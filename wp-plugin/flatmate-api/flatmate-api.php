<?php
/**
 * Plugin Name: Flatmate API
 * Description: Custom REST API and tables for Flatmate app (houses, members, chores, notes, expenses).
 * Version: 0.1.0
 * Author: Codex
 */

if (!defined('ABSPATH')) {
    exit;
}

class Flatmate_API_Plugin {
    const DEFAULT_POST_RETENTION_DAYS = 90;
    const AUTH_TOKEN_TTL = 604800; // 7 days
    private static $instance = null;
    private $tables;
    private $post_retention_days;
    private $member_cache = [];
    private $last_token_error = null;

    public static function instance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        global $wpdb;
        $prefix = $wpdb->prefix . 'flatmate_';
        $this->tables = [
            'houses'   => $prefix . 'houses',
            'members'  => $prefix . 'house_members',
            'notes'    => $prefix . 'notes',
            'chores'   => $prefix . 'chores',
            'expenses' => $prefix . 'expenses',
            'posts'    => $prefix . 'posts',
            'post_comments' => $prefix . 'post_comments',
            'tokens'  => $prefix . 'auth_tokens',
        ];
        $this->post_retention_days = max(
            1,
            intval(apply_filters('flatmate_post_retention_days', self::DEFAULT_POST_RETENTION_DAYS))
        );

        register_activation_hook(__FILE__, [$this, 'activate']);
        register_deactivation_hook(__FILE__, [self::class, 'deactivate']);
        add_action('rest_api_init', [$this, 'register_routes']);
        add_action('flatmate_cleanup_expired_posts', [$this, 'cleanup_expired_posts']);
        add_filter('determine_current_user', [$this, 'determine_current_user_from_token'], 20);
        add_filter('rest_authentication_errors', [$this, 'maybe_raise_token_error'], 20);
    }

    private function get_service_key() {
    // Prefer a constant defined in wp-config.php, fall back to environment.
    if (defined('FLATMATE_SERVICE_KEY') && is_string(FLATMATE_SERVICE_KEY) && FLATMATE_SERVICE_KEY !== '') {
        return FLATMATE_SERVICE_KEY;
    }
    $env = getenv('FLATMATE_SERVICE_KEY');
    return is_string($env) ? $env : '';
}

private function is_service_request() {
    $expected = $this->get_service_key();
    if (!$expected) {
        return false;
    }
    if (empty($_SERVER['HTTP_X_FLATMATE_SERVICE_KEY'])) {
        return false;
    }
    $provided = (string) $_SERVER['HTTP_X_FLATMATE_SERVICE_KEY'];
    return function_exists('hash_equals') ? hash_equals($expected, $provided) : ($expected === $provided);
}

private function get_actor_override_user_id() {
    // SECURITY: Only allow actor impersonation for service requests authenticated as an admin/service account.
    // Normal end-users must never be able to impersonate arbitrary WordPress user IDs.
    if (!$this->is_service_request()) {
        return null;
    }
    if (!current_user_can('manage_options')) {
        return null;
    }
    if (empty($_SERVER['HTTP_X_FLATMATE_ACTOR'])) {
        return null;
    }
    $candidate = intval($_SERVER['HTTP_X_FLATMATE_ACTOR']);
    if ($candidate <= 0) {
        return null;
    }
    $user = get_userdata($candidate);
    if (!$user) {
        return null;
    }
    if (function_exists('wp_set_current_user')) {
        wp_set_current_user($candidate);
    }
    return $candidate;
}

    private function get_effective_user_id() {
        $override = $this->get_actor_override_user_id();
        if ($override !== null) {
            return $override;
        }
        return get_current_user_id();
    }

    public function activate() {
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        global $wpdb;
        $charset_collate = $wpdb->get_charset_collate();

        $houses = "CREATE TABLE {$this->tables['houses']} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            name VARCHAR(191) NOT NULL,
            invite_code VARCHAR(16) NOT NULL,
            currency VARCHAR(8) DEFAULT 'USD',
            created_by BIGINT UNSIGNED NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY invite_code (invite_code),
            KEY created_by (created_by)
        ) $charset_collate;";

        $members = "CREATE TABLE {$this->tables['members']} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            house_id BIGINT UNSIGNED NOT NULL,
            user_id BIGINT UNSIGNED NOT NULL,
            role VARCHAR(32) DEFAULT 'member',
            status VARCHAR(32) DEFAULT 'HOME',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY house_user (house_id, user_id),
            KEY user_id (user_id)
        ) $charset_collate;";

        $notes = "CREATE TABLE {$this->tables['notes']} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            house_id BIGINT UNSIGNED NOT NULL,
            user_id BIGINT UNSIGNED NOT NULL,
            text TEXT NOT NULL,
            pinned TINYINT(1) DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY house_id (house_id),
            KEY user_id (user_id),
            KEY pinned (pinned)
        ) $charset_collate;";

        $chores = "CREATE TABLE {$this->tables['chores']} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            house_id BIGINT UNSIGNED NOT NULL,
            title VARCHAR(191) NOT NULL,
            assignee_id BIGINT UNSIGNED NULL,
            rotation JSON NULL,
            due_date DATETIME NULL,
            status VARCHAR(32) DEFAULT 'open',
            created_by BIGINT UNSIGNED NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY house_id (house_id),
            KEY assignee_id (assignee_id),
            KEY status (status),
            KEY due_date (due_date)
        ) $charset_collate;";

        $expenses = "CREATE TABLE {$this->tables['expenses']} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            house_id BIGINT UNSIGNED NOT NULL,
            user_id BIGINT UNSIGNED NOT NULL,
            amount DECIMAL(12,2) NOT NULL DEFAULT 0,
            currency VARCHAR(8) DEFAULT 'USD',
            description VARCHAR(255) DEFAULT '',
            status VARCHAR(32) DEFAULT 'open',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY house_id (house_id),
            KEY user_id (user_id),
            KEY status (status)
        ) $charset_collate;";

        $posts = "CREATE TABLE {$this->tables['posts']} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            house_id BIGINT UNSIGNED NOT NULL,
            author_id BIGINT UNSIGNED NOT NULL,
            author_member_id BIGINT UNSIGNED NULL,
            text TEXT DEFAULT '',
            media_id BIGINT UNSIGNED NULL,
            media_url VARCHAR(512) DEFAULT NULL,
            comment_count INT UNSIGNED NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY house_id (house_id),
            KEY author_id (author_id),
            KEY author_member_id (author_member_id),
            KEY created_at (created_at)
        ) $charset_collate;";

        $post_comments = "CREATE TABLE {$this->tables['post_comments']} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            post_id BIGINT UNSIGNED NOT NULL,
            author_id BIGINT UNSIGNED NOT NULL,
            author_member_id BIGINT UNSIGNED NULL,
            text TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY post_id (post_id),
            KEY author_id (author_id),
            KEY author_member_id (author_member_id)
        ) $charset_collate;";

        $tokens = "CREATE TABLE {$this->tables['tokens']} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id BIGINT UNSIGNED NOT NULL,
            token_hash VARCHAR(255) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            last_used DATETIME NULL,
            PRIMARY KEY (id),
            KEY user_id (user_id),
            KEY expires_at (expires_at)
        ) $charset_collate;";

        dbDelta($houses);
        dbDelta($members);
        dbDelta($notes);
        dbDelta($chores);
        dbDelta($expenses);
        dbDelta($posts);
        dbDelta($post_comments);
        dbDelta($tokens);

        if (!wp_next_scheduled('flatmate_cleanup_expired_posts')) {
            wp_schedule_event(time() + HOUR_IN_SECONDS, 'daily', 'flatmate_cleanup_expired_posts');
        }
    }

    public static function deactivate() {
        wp_clear_scheduled_hook('flatmate_cleanup_expired_posts');
    }

    private function current_user_or_error() {
        $uid = $this->get_effective_user_id();
        if (!$uid) {
            return new WP_Error('flatmate_unauthorized', 'Authentication required', ['status' => 401]);
        }
        return $uid;
    }

    private function is_house_member($house_id, $user_id) {
        global $wpdb;
        $table = $this->tables['members'];
        $row = $wpdb->get_var($wpdb->prepare("SELECT id FROM {$table} WHERE house_id=%d AND user_id=%d", $house_id, $user_id));
        return !empty($row);
    }

    private function generate_unique_invite_code() {
        global $wpdb;
        $table = $this->tables['houses'];
        for ($i = 0; $i < 10; $i++) {
            $code = strtoupper(wp_generate_password(8, false, false));
            $exists = $wpdb->get_var($wpdb->prepare("SELECT id FROM {$table} WHERE invite_code=%s", $code));
            if (!$exists) {
                return $code;
            }
        }
        return strtoupper(wp_generate_password(8, false, false));
    }

    private function user_is_house_admin($house_id, $user_id) {
        global $wpdb;
        if (current_user_can('manage_options') || current_user_can('edit_users')) {
            return true;
        }
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT role FROM {$this->tables['members']} WHERE house_id=%d AND user_id=%d",
            $house_id,
            $user_id
        ));
        if (!$row) return false;
        return strtolower($row->role ?? '') === 'admin';
    }

    private function user_is_last_admin($house_id, $user_id) {
        global $wpdb;
        $member = $wpdb->get_row($wpdb->prepare(
            "SELECT role FROM {$this->tables['members']} WHERE house_id=%d AND user_id=%d",
            $house_id,
            $user_id
        ));
        if (!$member || strtolower($member->role ?? '') !== 'admin') {
            return false;
        }
        $admin_count = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$this->tables['members']} WHERE house_id=%d AND LOWER(role)='admin'",
            $house_id
        ));
        return $admin_count <= 1;
    }

    private function format_user_summary($user_id) {
        $user = get_userdata($user_id);
        if (!$user) return null;
        return [
            'id' => (int)$user->ID,
            'name' => $user->display_name,
            'email' => $user->user_email,
        ];
    }

    private function get_member_by_id($house_id, $member_id) {
        if (!$member_id) return null;
        $cache_key = sprintf('id:%d:%d', $house_id, $member_id);
        if (array_key_exists($cache_key, $this->member_cache)) {
            return $this->member_cache[$cache_key];
        }
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$this->tables['members']} WHERE id=%d AND house_id=%d",
            $member_id,
            $house_id
        ), ARRAY_A);
        $this->member_cache[$cache_key] = $row ?: null;
        return $this->member_cache[$cache_key];
    }

    private function get_member_by_user($house_id, $user_id) {
        if (!$user_id) return null;
        $cache_key = sprintf('user:%d:%d', $house_id, $user_id);
        if (array_key_exists($cache_key, $this->member_cache)) {
            return $this->member_cache[$cache_key];
        }
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$this->tables['members']} WHERE house_id=%d AND user_id=%d",
            $house_id,
            $user_id
        ), ARRAY_A);
        $this->member_cache[$cache_key] = $row ?: null;
        return $this->member_cache[$cache_key];
    }

    private function resolve_member_actor($house_id, $member_id, $user_id) {
        $member = $this->get_member_by_id($house_id, $member_id);
        if ($member) {
            return $member;
        }
        return $this->get_member_by_user($house_id, $user_id);
    }

    private function format_member_summary($member_row) {
        if (!$member_row) return null;
        $user = get_userdata((int)$member_row['user_id']);
        $name = $user ? $user->display_name : null;
        $email = $user ? $user->user_email : null;
        $avatar = function_exists('get_avatar_url') ? get_avatar_url((int)$member_row['user_id']) : null;
        return [
            'id' => (int)$member_row['id'],
            'houseId' => (int)$member_row['house_id'],
            'userId' => (int)$member_row['user_id'],
            'role' => $member_row['role'] ?: 'member',
            'status' => $member_row['status'] ?: 'HOME',
            'name' => $name,
            'email' => $email,
            'avatarUrl' => $avatar,
        ];
    }

    private function format_post_row($row) {
        if (!$row) return null;
        $member_row = $this->resolve_member_actor(
            (int)$row['house_id'],
            isset($row['author_member_id']) ? (int)$row['author_member_id'] : 0,
            (int)$row['author_id']
        );
        return [
            'id' => (int)$row['id'],
            'houseId' => (int)$row['house_id'],
            'authorId' => (int)$row['author_id'],
            'authorMemberId' => $member_row ? (int)$member_row['id'] : (isset($row['author_member_id']) ? (int)$row['author_member_id'] : null),
            'text' => $row['text'],
            'mediaUrl' => $row['media_url'],
            'mediaId' => $row['media_id'] ? (int)$row['media_id'] : null,
            'commentCount' => (int)$row['comment_count'],
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'],
            'author' => $this->format_user_summary($row['author_id']),
            'member' => $this->format_member_summary($member_row),
        ];
    }

    private function format_comment_row($row) {
        if (!$row) return null;
        $house_id = isset($row['house_id']) ? (int)$row['house_id'] : null;
        $member_row = $house_id ? $this->resolve_member_actor(
            $house_id,
            isset($row['author_member_id']) ? (int)$row['author_member_id'] : 0,
            (int)$row['author_id']
        ) : null;
        return [
            'id' => (int)$row['id'],
            'postId' => (int)$row['post_id'],
            'authorId' => (int)$row['author_id'],
            'authorMemberId' => $member_row ? (int)$member_row['id'] : (isset($row['author_member_id']) ? (int)$row['author_member_id'] : null),
            'text' => $row['text'],
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'],
            'author' => $this->format_user_summary($row['author_id']),
            'member' => $this->format_member_summary($member_row),
            'houseId' => $house_id,
        ];
    }

    private function append_post_comments(&$posts, $limit = 5) {
        global $wpdb;
        if (empty($posts)) return;
        $ids = array_map(function($post) {
            return (int)$post['id'];
        }, $posts);
        $house_lookup = [];
        foreach ($posts as $post) {
            $house_lookup[(int)$post['id']] = isset($post['houseId']) ? (int)$post['houseId'] : null;
        }
        $placeholders = implode(',', array_fill(0, count($ids), '%d'));
        $query = "SELECT * FROM {$this->tables['post_comments']} WHERE post_id IN ($placeholders) ORDER BY created_at DESC";
        $rows = $wpdb->get_results($wpdb->prepare($query, $ids), ARRAY_A);
        $grouped = [];
        foreach ($rows as $row) {
            $pid = (int)$row['post_id'];
            $row['house_id'] = $house_lookup[$pid] ?? null;
            if (!isset($grouped[$pid])) $grouped[$pid] = [];
            if (count($grouped[$pid]) >= $limit) continue;
            $grouped[$pid][] = $row;
        }
        foreach ($posts as &$post) {
            $pid = (int)$post['id'];
            if (!isset($grouped[$pid])) {
                $post['comments'] = [];
                continue;
            }
            $comments = array_reverse($grouped[$pid]);
            $post['comments'] = array_map(function($row) {
                return $this->format_comment_row($row);
            }, $comments);
        }
    }

    private function fetch_post_comments_list($post_id, $per_page = 20, $page = 1) {
        global $wpdb;
        $per_page = max(1, min(100, intval($per_page)));
        $page = max(1, intval($page));
        $offset = ($page - 1) * $per_page;
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT c.*, p.house_id FROM {$this->tables['post_comments']} c
             JOIN {$this->tables['posts']} p ON p.id = c.post_id
             WHERE c.post_id=%d ORDER BY c.created_at ASC LIMIT %d OFFSET %d",
            $post_id,
            $per_page,
            $offset
        ), ARRAY_A);
        return array_map(function($row) {
            return $this->format_comment_row($row);
        }, $rows);
    }

    private function get_comment_record($comment_id) {
        global $wpdb;
        return $wpdb->get_row($wpdb->prepare(
            "SELECT c.*, p.house_id FROM {$this->tables['post_comments']} c
             JOIN {$this->tables['posts']} p ON p.id = c.post_id
             WHERE c.id=%d",
            $comment_id
        ), ARRAY_A);
    }

    public function cleanup_expired_posts() {
        global $wpdb;
        $days = max(
            1,
            intval(apply_filters('flatmate_post_retention_days', $this->post_retention_days))
        );
        $cutoff = gmdate('Y-m-d H:i:s', time() - ($days * DAY_IN_SECONDS));
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT id, media_id FROM {$this->tables['posts']} WHERE created_at < %s",
            $cutoff
        ), ARRAY_A);
        if (empty($rows)) {
            return;
        }
        $post_ids = array_map('intval', wp_list_pluck($rows, 'id'));
        if (!empty($post_ids)) {
            $id_list = implode(',', $post_ids);
            $wpdb->query("DELETE FROM {$this->tables['post_comments']} WHERE post_id IN ($id_list)");
            $wpdb->query("DELETE FROM {$this->tables['posts']} WHERE id IN ($id_list)");
        }
        if (!function_exists('wp_delete_attachment')) {
            require_once ABSPATH . 'wp-admin/includes/post.php';
        }
        foreach ($rows as $row) {
            if (!empty($row['media_id'])) {
                wp_delete_attachment((int)$row['media_id'], true);
            }
        }
    }

    private function handle_post_media($file) {
        if (empty($file) || empty($file['tmp_name'])) {
            return null;
        }
        if (!function_exists('wp_handle_upload')) {
            require_once ABSPATH . 'wp-admin/includes/file.php';
        }
        if (!function_exists('wp_generate_attachment_metadata')) {
            require_once ABSPATH . 'wp-admin/includes/image.php';
        }
        $allowed_types = ['image/jpeg','image/png','image/gif','image/webp','image/avif'];
        $type = $file['type'] ?? '';
        if ($type && !in_array($type, $allowed_types, true)) {
            return new WP_Error('flatmate_invalid_media', 'Unsupported image type', ['status' => 400]);
        }
        $upload = wp_handle_upload($file, ['test_form' => false]);
        if (isset($upload['error'])) {
            return new WP_Error('flatmate_media_error', $upload['error'], ['status' => 400]);
        }
        $attachment = [
            'post_mime_type' => $upload['type'],
            'post_title' => sanitize_file_name(basename($upload['file'])),
            'post_content' => '',
            'post_status' => 'inherit',
        ];
        $attach_id = wp_insert_attachment($attachment, $upload['file']);
        if (is_wp_error($attach_id)) {
            return $attach_id;
        }
        $attach_data = wp_generate_attachment_metadata($attach_id, $upload['file']);
        wp_update_attachment_metadata($attach_id, $attach_data);
        return [
            'id' => $attach_id,
            'url' => wp_get_attachment_url($attach_id),
        ];
    }

    private function get_post_record($post_id) {
        global $wpdb;
        return $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$this->tables['posts']} WHERE id=%d",
            $post_id
        ), ARRAY_A);
    }

    private function get_house_members($house_id) {
        global $wpdb;
        $members_table = $this->tables['members'];
        $users_table = $wpdb->users;
        $sql = $wpdb->prepare("
            SELECT m.user_id, m.role, m.status, u.display_name, u.user_email
            FROM {$members_table} m
            LEFT JOIN {$users_table} u ON u.ID = m.user_id
            WHERE m.house_id=%d
            ORDER BY (m.role='admin') DESC, u.display_name ASC
        ", $house_id);
        $rows = $wpdb->get_results($sql, ARRAY_A);
        if (!$rows) {
            return [];
        }
        return array_map(function($row) {
            $role = $row['role'] ?: 'member';
            return [
                'user_id'   => intval($row['user_id']),
                'wp_user_id'=> intval($row['user_id']),
                'role'      => $role,
                'status'    => $row['status'] ?: 'HOME',
                'name'      => $row['display_name'] ?: ($row['user_email'] ?: 'Member'),
                'email'     => $row['user_email'],
                'is_admin'  => $role === 'admin',
            ];
        }, $rows);
    }

    private function format_house($house, $include_members = true) {
        if (!$house) {
            return null;
        }
        $house_arr = is_array($house) ? $house : (array) $house;
        $house_id = intval($house_arr['id']);
        $data = [
            'id'          => $house_id,
            'name'        => $house_arr['name'],
            'invite_code' => $house_arr['invite_code'],
            'currency'    => $house_arr['currency'],
            'created_by'  => intval($house_arr['created_by']),
        ];
        if ($include_members) {
            $members = $this->get_house_members($house_id);
            $data['members'] = $members;
            foreach ($members as $member) {
                if (!empty($member['is_admin'])) {
                    $data['admin_member'] = $member;
                    $data['admin_user_id'] = $member['user_id'];
                    break;
                }
            }
        }
        return $data;
    }

    public function register_routes() {
        $ns = 'flatmate/v1';

        register_rest_route($ns, '/login', [
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'permission_callback' => '__return_true',
                'callback'            => [$this, 'login'],
            ],
        ]);

        // Houses
        register_rest_route($ns, '/houses', [
            [
                'methods'             => WP_REST_Server::READABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'list_houses'],
            ],
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'create_house'],
            ],
        ]);

        register_rest_route($ns, '/houses/(?P<id>\d+)', [
            [
                'methods'             => WP_REST_Server::EDITABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'update_house'],
            ],
            [
                'methods'             => WP_REST_Server::DELETABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'delete_house'],
            ],
        ]);

        // Join by invite code
        register_rest_route($ns, '/houses/join', [
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'join_house'],
            ],
        ]);

        register_rest_route($ns, '/houses/(?P<id>\d+)/members', [
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'add_member'],
            ],
            [
                'methods'             => WP_REST_Server::DELETABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'remove_member'],
            ],
        ]);

        // Notes
        register_rest_route($ns, '/notes', [
            [
                'methods'             => WP_REST_Server::READABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'list_notes'],
            ],
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'create_note'],
            ],
        ]);

        register_rest_route($ns, '/notes/(?P<id>\d+)', [
            [
                'methods'             => WP_REST_Server::EDITABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'update_note'],
            ],
            [
                'methods'             => WP_REST_Server::DELETABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'delete_note'],
            ],
        ]);

        // Chores
        register_rest_route($ns, '/chores', [
            [
                'methods'             => WP_REST_Server::READABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'list_chores'],
            ],
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'create_chore'],
            ],
        ]);

        register_rest_route($ns, '/chores/(?P<id>\d+)', [
            [
                'methods'             => WP_REST_Server::EDITABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'update_chore'],
            ],
            [
                'methods'             => WP_REST_Server::DELETABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'delete_chore'],
            ],
        ]);

        // Expenses
        register_rest_route($ns, '/expenses', [
            [
                'methods'             => WP_REST_Server::READABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'list_expenses'],
            ],
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'create_expense'],
            ],
        ]);

        register_rest_route($ns, '/expenses/(?P<id>\d+)', [
            [
                'methods'             => WP_REST_Server::EDITABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'update_expense'],
            ],
            [
                'methods'             => WP_REST_Server::DELETABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'delete_expense'],
            ],
        ]);

        // Posts (community feed)
        register_rest_route($ns, '/houses/(?P<id>\d+)/posts', [
            [
                'methods'             => WP_REST_Server::READABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'list_posts'],
            ],
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'create_post'],
            ],
        ]);

        register_rest_route($ns, '/posts/(?P<id>\d+)', [
            [
                'methods'             => WP_REST_Server::READABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'get_post'],
            ],
            [
                'methods'             => WP_REST_Server::DELETABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'delete_post'],
            ],
        ]);

        register_rest_route($ns, '/posts/(?P<post_id>\d+)/comments', [
            [
                'methods'             => WP_REST_Server::READABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'list_post_comments'],
            ],
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'create_post_comment'],
            ],
        ]);

        register_rest_route($ns, '/posts/(?P<post_id>\d+)/comments/(?P<comment_id>\d+)', [
            [
                'methods'             => WP_REST_Server::DELETABLE,
                'permission_callback' => [$this, 'check_auth'],
                'callback'            => [$this, 'delete_post_comment'],
            ],
        ]);
    }

    public function check_auth() {
        $uid = $this->current_user_or_error();
        return is_wp_error($uid) ? $uid : true;
    }

    private function get_authorization_header() {
        $header = '';
        if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
            $header = $_SERVER['HTTP_AUTHORIZATION'];
        } elseif (!empty($_SERVER['Authorization'])) {
            $header = $_SERVER['Authorization'];
        } elseif (function_exists('apache_request_headers')) {
            $headers = apache_request_headers();
            if (isset($headers['Authorization'])) {
                $header = $headers['Authorization'];
            }
        }
        return is_string($header) ? trim($header) : '';
    }

    private function extract_bearer_token() {
        $header = $this->get_authorization_header();
        $token = $this->parse_authorization_token($header);
        if ($token) {
            return $token;
        }
        if (!empty($_SERVER['HTTP_X_FLATMATE_TOKEN'])) {
            $fallback = trim((string) $_SERVER['HTTP_X_FLATMATE_TOKEN']);
            return $fallback !== '' ? $fallback : null;
        }
        return null;
    }

    private function parse_authorization_token($header) {
        if (!$header || !is_string($header)) {
            return null;
        }
        $trimmed = trim($header);
        if ($trimmed === '') {
            return null;
        }
        $prefixes = ['Flatmate ', 'Bearer '];
        foreach ($prefixes as $prefix) {
            if (stripos($trimmed, $prefix) === 0) {
                $candidate = trim(substr($trimmed, strlen($prefix)));
                if ($candidate !== '') {
                    return $candidate;
                }
            }
        }
        return null;
    }

    private function cleanup_expired_tokens() {
        global $wpdb;
        if (empty($this->tables['tokens'])) {
            return;
        }
        $now = gmdate('Y-m-d H:i:s');
        $wpdb->query($wpdb->prepare("DELETE FROM {$this->tables['tokens']} WHERE expires_at < %s", $now));
    }

    private function create_user_token($user_id) {
        global $wpdb;
        $this->cleanup_expired_tokens();
        $raw = wp_generate_password(64, false, false);
        $hash = wp_hash_password($raw);
        $expires = gmdate('Y-m-d H:i:s', time() + self::AUTH_TOKEN_TTL);
        $inserted = $wpdb->insert(
            $this->tables['tokens'],
            [
                'user_id'    => $user_id,
                'token_hash' => $hash,
                'expires_at' => $expires,
            ],
            ['%d','%s','%s']
        );
        if (!$inserted) {
            return new WP_Error('flatmate_token_error', 'Unable to issue token', ['status' => 500]);
        }
        $token_id = $wpdb->insert_id;
        return [
            'token' => sprintf('%d.%s', $token_id, $raw),
            'expires_at' => $expires,
        ];
    }

    private function validate_bearer_token($token) {
        global $wpdb;
        if (empty($token)) {
            return new WP_Error('flatmate_invalid_token', 'Invalid token', ['status' => 401]);
        }
        $parts = explode('.', $token, 2);
        if (count($parts) !== 2) {
            return new WP_Error('flatmate_invalid_token', 'Invalid token format', ['status' => 401]);
        }
        $token_id = intval($parts[0]);
        $secret = $parts[1];
        if ($token_id <= 0 || empty($secret)) {
            return new WP_Error('flatmate_invalid_token', 'Invalid token format', ['status' => 401]);
        }
        $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$this->tables['tokens']} WHERE id=%d", $token_id));
        if (!$row) {
            return new WP_Error('flatmate_invalid_token', 'Token not found', ['status' => 401]);
        }
        if (strtotime($row->expires_at) < time()) {
            $wpdb->delete($this->tables['tokens'], ['id' => $row->id], ['%d']);
            return new WP_Error('flatmate_invalid_token', 'Token expired', ['status' => 401]);
        }
        if (!wp_check_password($secret, $row->token_hash)) {
            $wpdb->delete($this->tables['tokens'], ['id' => $row->id], ['%d']);
            return new WP_Error('flatmate_invalid_token', 'Invalid token', ['status' => 401]);
        }
        $wpdb->update(
            $this->tables['tokens'],
            ['last_used' => gmdate('Y-m-d H:i:s')],
            ['id' => $row->id],
            ['%s'],
            ['%d']
        );
        return (int) $row->user_id;
    }

    public function determine_current_user_from_token($user_id) {
        if ($user_id) {
            return $user_id;
        }
        $token = $this->extract_bearer_token();
        if (!$token) {
            return $user_id;
        }
        $validation = $this->validate_bearer_token($token);
        if (is_wp_error($validation)) {
            $this->last_token_error = $validation;
            return 0;
        }
        wp_set_current_user($validation);
        return $validation;
    }

    public function maybe_raise_token_error($result) {
        if (!empty($result)) {
            return $result;
        }
        if ($this->last_token_error instanceof WP_Error) {
            $error = $this->last_token_error;
            $this->last_token_error = null;
            return $error;
        }
        return $result;
    }

    private function require_membership($house_id, $args = []) {
        global $wpdb;
        $uid = $this->current_user_or_error();
        if (is_wp_error($uid)) return $uid;
        $allow_service_auto_add = !empty($args['allow_service_auto_add']);
        // Allow admins/service accounts to bypass membership checks
        if (current_user_can('manage_options') || current_user_can('edit_users')) {
            return $uid;
        }
        if ($this->is_house_member($house_id, $uid)) {
            return $uid;
        }
        if ($allow_service_auto_add && $this->is_service_request()) {
            $wpdb->replace($this->tables['members'], [
                'house_id' => $house_id,
                'user_id'  => $uid,
                'role'     => 'member',
                'status'   => 'HOME',
            ], ['%d','%d','%s','%s']);
            if ($this->is_house_member($house_id, $uid)) {
                return $uid;
            }
        }
        return new WP_Error('flatmate_forbidden', 'Not a member of this house', ['status' => 403]);
    }

    public function login($req) {
        $username = sanitize_user($req->get_param('username'));
        $password = $req->get_param('password');
        if (!$username || !$password) {
            return new WP_Error('flatmate_invalid_login', 'Username and password required', ['status' => 400]);
        }
        $user = wp_authenticate($username, $password);
        if (is_wp_error($user)) {
            return new WP_Error('flatmate_invalid_login', 'Invalid username or password', ['status' => 403]);
        }
        $token_data = $this->create_user_token((int)$user->ID);
        if (is_wp_error($token_data)) {
            return $token_data;
        }
        return [
            'token' => $token_data['token'],
            'expiresAt' => $token_data['expires_at'],
            'user' => [
                'id' => (int)$user->ID,
                'username' => $user->user_login,
                'email' => $user->user_email,
                'name' => $user->display_name,
            ],
        ];
    }

    /* Houses */
    public function list_houses($req) {
        global $wpdb;
        $uid = $this->current_user_or_error();
        if (is_wp_error($uid)) return $uid;
        $table = $this->tables['members'];
        $ids = $wpdb->get_col($wpdb->prepare("SELECT house_id FROM {$table} WHERE user_id=%d", $uid));
        if (empty($ids)) return [];
        $placeholders = implode(',', array_fill(0, count($ids), '%d'));
        $houses = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$this->tables['houses']} WHERE id IN ($placeholders)", $ids), ARRAY_A);
        return array_map(function($house) {
            return $this->format_house($house);
        }, $houses);
    }

    public function create_house($req) {
        global $wpdb;
        $uid = $this->current_user_or_error();
        if (is_wp_error($uid)) return $uid;
        $name = sanitize_text_field($req['name']);
        $currency = sanitize_text_field($req['currency'] ?: 'USD');
        if (!$name) {
            return new WP_Error('flatmate_invalid', 'Name required', ['status' => 400]);
        }
        $invite = $this->generate_unique_invite_code();
        $wpdb->insert($this->tables['houses'], [
            'name'       => $name,
            'invite_code'=> $invite,
            'currency'   => $currency,
            'created_by' => $uid,
        ], ['%s','%s','%s','%d']);
        $house_id = $wpdb->insert_id;
        $wpdb->insert($this->tables['members'], [
            'house_id' => $house_id,
            'user_id'  => $uid,
            'role'     => 'admin',
            'status'   => 'HOME',
        ], ['%d','%d','%s','%s']);
        $house = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$this->tables['houses']} WHERE id=%d", $house_id), ARRAY_A);
        return $this->format_house($house);
    }

    public function update_house($req) {
      global $wpdb;
      $house_id = intval($req['id']);
      $uid = $this->require_membership($house_id);
      if (is_wp_error($uid)) return $uid;
      $name = sanitize_text_field($req['name']);
      $currency = sanitize_text_field($req['currency']);
      $regenInvite = filter_var($req->get_param('regenInvite'), FILTER_VALIDATE_BOOLEAN);
      $data = [];
      $fmt  = [];
      if ($name) { $data['name'] = $name; $fmt[] = '%s'; }
      if ($currency) { $data['currency'] = $currency; $fmt[] = '%s'; }
      if ($regenInvite) {
        $data['invite_code'] = $this->generate_unique_invite_code();
        $fmt[] = '%s';
      }
      if (empty($data)) return new WP_Error('flatmate_invalid', 'Nothing to update', ['status' => 400]);
      $wpdb->update($this->tables['houses'], $data, ['id' => $house_id], $fmt, ['%d']);
      $house = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$this->tables['houses']} WHERE id=%d", $house_id), ARRAY_A);
      if ($house) {
        return [
          'house' => $this->format_house($house)
        ];
      }
      return ['ok' => true];
    }

    public function delete_house($req) {
        global $wpdb;
        $house_id = intval($req['id']);
        $uid = $this->require_membership($house_id);
        if (is_wp_error($uid)) return $uid;
        if (!$this->user_is_house_admin($house_id, $uid)) {
            return new WP_Error('flatmate_forbidden', 'Admin privileges required', ['status' => 403]);
        }
        $wpdb->delete($this->tables['houses'], ['id' => $house_id], ['%d']);
        $wpdb->delete($this->tables['members'], ['house_id' => $house_id], ['%d']);
        $wpdb->delete($this->tables['notes'], ['house_id' => $house_id], ['%d']);
        $wpdb->delete($this->tables['chores'], ['house_id' => $house_id], ['%d']);
        $wpdb->delete($this->tables['expenses'], ['house_id' => $house_id], ['%d']);
        return ['ok' => true];
    }

    public function add_member($req) {
        global $wpdb;
        $house_id = intval($req['id']);
        $uid = $this->require_membership($house_id);
        if (is_wp_error($uid)) return $uid;
        if (!$this->user_is_house_admin($house_id, $uid)) {
            return new WP_Error('flatmate_forbidden', 'Admin privileges required to add members', ['status' => 403]);
        }
        $user_id = intval($req['user_id']);
        if (!$user_id) return new WP_Error('flatmate_invalid', 'user_id required', ['status' => 400]);
        if (!get_userdata($user_id)) {
            return new WP_Error('flatmate_invalid', 'User not found', ['status' => 404]);
        }
        $wpdb->replace($this->tables['members'], [
            'house_id' => $house_id,
            'user_id'  => $user_id,
            'role'     => 'member',
            'status'   => 'HOME',
        ], ['%d','%d','%s','%s']);
        return ['ok' => true, 'members' => $this->get_house_members($house_id)];
    }

    public function join_house($req) {
        global $wpdb;
        $uid = $this->current_user_or_error();
        if (is_wp_error($uid)) return $uid;
        $code = sanitize_text_field($req['inviteCode'] ?? $req['invite_code']);
        if (!$code) return new WP_Error('flatmate_invalid', 'inviteCode required', ['status' => 400]);
        $house = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$this->tables['houses']} WHERE invite_code=%s", $code), ARRAY_A);
        if (!$house) return new WP_Error('flatmate_not_found', 'Invalid invite code', ['status' => 404]);
        $wpdb->replace($this->tables['members'], [
            'house_id' => $house['id'],
            'user_id'  => $uid,
            'role'     => 'member',
            'status'   => 'HOME',
        ], ['%d','%d','%s','%s']);
        return [
            'joined' => true,
            'house'  => $this->format_house($house),
        ];
    }

    public function remove_member($req) {
        global $wpdb;
        $house_id = intval($req['id']);
        $uid = $this->require_membership($house_id);
        if (is_wp_error($uid)) return $uid;
        $user_id = intval($req['user_id'] ?: 0);
        if (!$user_id) {
            $user_id = $uid;
        }
        $is_self = ($user_id === $uid);
        if (!$is_self && !$this->user_is_house_admin($house_id, $uid)) {
            return new WP_Error('flatmate_forbidden', 'Admin privileges required to remove other members', ['status' => 403]);
        }
        if ($this->user_is_last_admin($house_id, $user_id)) {
            return new WP_Error('flatmate_forbidden', 'Cannot remove the last house admin', ['status' => 403]);
        }
        $wpdb->delete($this->tables['members'], ['house_id' => $house_id, 'user_id' => $user_id], ['%d','%d']);
        return ['ok' => true, 'members' => $this->get_house_members($house_id)];
    }

    /* Posts */
    public function list_posts($req) {
        global $wpdb;
        $house_id = intval($req['id']);
        if (!$house_id) return new WP_Error('flatmate_invalid', 'houseId required', ['status' => 400]);
        $uid = $this->require_membership($house_id);
        if (is_wp_error($uid)) return $uid;
        $per_page = max(1, min(50, intval($req->get_param('per_page') ?? 10)));
        $page = max(1, intval($req->get_param('page') ?? 1));
        $offset = ($page - 1) * $per_page;
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$this->tables['posts']} WHERE house_id=%d ORDER BY created_at DESC LIMIT %d OFFSET %d",
            $house_id,
            $per_page,
            $offset
        ), ARRAY_A);
        $posts = array_map(function($row) {
            return $this->format_post_row($row);
        }, $rows);
        $with_comments = filter_var($req->get_param('withComments'), FILTER_VALIDATE_BOOLEAN);
        if ($with_comments && !empty($posts)) {
            $this->append_post_comments($posts);
        } else {
            foreach ($posts as &$post) {
                $post['comments'] = [];
            }
        }
        return [
            'items' => $posts,
            'page' => $page,
            'perPage' => $per_page,
        ];
    }

    public function create_post($req) {
        global $wpdb;
        $house_id = intval($req['id'] ?? $req['house_id']);
        if (!$house_id) return new WP_Error('flatmate_invalid', 'houseId required', ['status' => 400]);
        $uid = $this->require_membership($house_id);
        if (is_wp_error($uid)) return $uid;
        $text = sanitize_textarea_field($req['text'] ?? $req->get_param('text') ?? '');
        $files = $req->get_file_params();
        $image_file = $files['image'] ?? null;
        if (!$text && (empty($image_file) || empty($image_file['tmp_name']))) {
            return new WP_Error('flatmate_invalid', 'Text or image required', ['status' => 400]);
        }
        $member_param = $req['memberId'] ?? $req['member_id'] ?? null;
        if ($member_param === null && $req instanceof WP_REST_Request) {
            $member_param = $req->get_param('memberId') ?? $req->get_param('member_id');
        }
        $author_member_row = $this->resolve_member_actor($house_id, intval($member_param), $uid);
        $author_member_id = $author_member_row ? (int)$author_member_row['id'] : null;
        $media = null;
        if (!empty($image_file) && !empty($image_file['tmp_name'])) {
            $media = $this->handle_post_media($image_file);
            if (is_wp_error($media)) return $media;
        }
        $wpdb->insert($this->tables['posts'], [
            'house_id' => $house_id,
            'author_id' => $uid,
             'author_member_id' => $author_member_id,
            'text' => $text,
            'media_id' => $media['id'] ?? null,
            'media_url' => $media['url'] ?? null,
        ], ['%d','%d','%d','%s','%d','%s']);
        $post_id = $wpdb->insert_id;
        $row = $this->get_post_record($post_id);
        $post = $this->format_post_row($row);
        $post['comments'] = [];
        return $post;
    }

    public function get_post($req) {
        $post_id = intval($req['id']);
        if (!$post_id) return new WP_Error('flatmate_invalid', 'post id required', ['status' => 400]);
        $row = $this->get_post_record($post_id);
        if (!$row) return new WP_Error('flatmate_not_found', 'Post not found', ['status' => 404]);
        $uid = $this->require_membership($row['house_id']);
        if (is_wp_error($uid)) return $uid;
        $per_page = max(1, min(100, intval($req->get_param('per_page') ?? 50)));
        $page = max(1, intval($req->get_param('page') ?? 1));
        $post = $this->format_post_row($row);
        $post['comments'] = $this->fetch_post_comments_list($post_id, $per_page, $page);
        $post['commentsPage'] = $page;
        $post['commentsPerPage'] = $per_page;
        return $post;
    }

    public function delete_post($req) {
        global $wpdb;
        $post_id = intval($req['id']);
        if (!$post_id) return new WP_Error('flatmate_invalid', 'post id required', ['status' => 400]);
        $row = $this->get_post_record($post_id);
        if (!$row) return new WP_Error('flatmate_not_found', 'Post not found', ['status' => 404]);
        $uid = $this->require_membership($row['house_id']);
        if (is_wp_error($uid)) return $uid;
        $can_manage = ($uid === intval($row['author_id'])) || $this->user_is_house_admin($row['house_id'], $uid);
        if (!$can_manage) {
            return new WP_Error('flatmate_forbidden', 'Not allowed to delete this post', ['status' => 403]);
        }
        $wpdb->delete($this->tables['posts'], ['id' => $post_id], ['%d']);
        $wpdb->delete($this->tables['post_comments'], ['post_id' => $post_id], ['%d']);
        return ['deleted' => true];
    }

    public function list_post_comments($req) {
        $post_id = intval($req['post_id']);
        if (!$post_id) return new WP_Error('flatmate_invalid', 'post id required', ['status' => 400]);
        $row = $this->get_post_record($post_id);
        if (!$row) return new WP_Error('flatmate_not_found', 'Post not found', ['status' => 404]);
        $uid = $this->require_membership($row['house_id']);
        if (is_wp_error($uid)) return $uid;
        $per_page = max(1, min(100, intval($req->get_param('per_page') ?? 20)));
        $page = max(1, intval($req->get_param('page') ?? 1));
        $comments = $this->fetch_post_comments_list($post_id, $per_page, $page);
        return [
            'items' => $comments,
            'page' => $page,
            'perPage' => $per_page,
        ];
    }

    public function create_post_comment($req) {
        global $wpdb;
        $post_id = intval($req['post_id']);
        if (!$post_id) return new WP_Error('flatmate_invalid', 'post id required', ['status' => 400]);
        $row = $this->get_post_record($post_id);
        if (!$row) return new WP_Error('flatmate_not_found', 'Post not found', ['status' => 404]);
        $uid = $this->require_membership($row['house_id']);
        if (is_wp_error($uid)) return $uid;
        $text = sanitize_textarea_field($req['text'] ?? $req->get_param('text'));
        if (!$text) return new WP_Error('flatmate_invalid', 'text required', ['status' => 400]);
        $member_param = $req['memberId'] ?? $req['member_id'] ?? null;
        if ($member_param === null && $req instanceof WP_REST_Request) {
            $member_param = $req->get_param('memberId') ?? $req->get_param('member_id');
        }
        $author_member_row = $this->resolve_member_actor((int)$row['house_id'], intval($member_param), $uid);
        $author_member_id = $author_member_row ? (int)$author_member_row['id'] : null;
        $wpdb->insert($this->tables['post_comments'], [
            'post_id' => $post_id,
            'author_id' => $uid,
            'author_member_id' => $author_member_id,
            'text' => $text,
        ], ['%d','%d','%d','%s']);
        $comment_id = $wpdb->insert_id;
        $wpdb->query($wpdb->prepare(
            "UPDATE {$this->tables['posts']} SET comment_count = comment_count + 1 WHERE id=%d",
            $post_id
        ));
        $comment = $this->get_comment_record($comment_id);
        return $this->format_comment_row($comment);
    }

    public function delete_post_comment($req) {
        global $wpdb;
        $post_id = intval($req['post_id']);
        $comment_id = intval($req['comment_id']);
        if (!$post_id || !$comment_id) return new WP_Error('flatmate_invalid', 'invalid ids', ['status' => 400]);
        $post = $this->get_post_record($post_id);
        if (!$post) return new WP_Error('flatmate_not_found', 'Post not found', ['status' => 404]);
        $comment = $this->get_comment_record($comment_id);
        if (!$comment || intval($comment['post_id']) !== $post_id) {
            return new WP_Error('flatmate_not_found', 'Comment not found', ['status' => 404]);
        }
        $uid = $this->require_membership($post['house_id']);
        if (is_wp_error($uid)) return $uid;
        $can_manage = ($uid === intval($comment['author_id'])) || $this->user_is_house_admin($post['house_id'], $uid);
        if (!$can_manage) {
            return new WP_Error('flatmate_forbidden', 'Not allowed to delete this comment', ['status' => 403]);
        }
        $wpdb->delete($this->tables['post_comments'], ['id' => $comment_id], ['%d']);
        $wpdb->query($wpdb->prepare(
            "UPDATE {$this->tables['posts']} SET comment_count = GREATEST(comment_count - 1, 0) WHERE id=%d",
            $post_id
        ));
        return ['deleted' => true];
    }

    /* Notes */
    public function list_notes($req) {
        global $wpdb;
        $house_id = intval($req['houseId'] ?? $req['house_id']);
        if (!$house_id) return new WP_Error('flatmate_invalid', 'houseId required', ['status' => 400]);
        $uid = $this->require_membership($house_id);
        if (is_wp_error($uid)) return $uid;
        $limit = max(1, min(200, intval($req['per_page'] ?? 50)));
        $offset = max(0, intval($req['offset'] ?? 0));
        $sql = $wpdb->prepare(
            "SELECT * FROM {$this->tables['notes']} WHERE house_id=%d ORDER BY pinned DESC, created_at DESC LIMIT %d OFFSET %d",
            $house_id, $limit, $offset
        );
        return $wpdb->get_results($sql, ARRAY_A);
    }

    public function create_note($req) {
        global $wpdb;
        $house_id = intval($req['houseId'] ?? $req['house_id']);
        if (!$house_id) return new WP_Error('flatmate_invalid', 'houseId required', ['status' => 400]);
        $uid = $this->require_membership($house_id);
        if (is_wp_error($uid)) return $uid;
        $text = sanitize_text_field($req['text']);
        if (!$text) return new WP_Error('flatmate_invalid', 'text required', ['status' => 400]);
        $wpdb->insert($this->tables['notes'], [
            'house_id' => $house_id,
            'user_id'  => $uid,
            'text'     => $text,
            'pinned'   => !empty($req['pinned']) ? 1 : 0,
        ], ['%d','%d','%s','%d']);
        return [
            'id'        => $wpdb->insert_id,
            'houseId'   => $house_id,
            'userId'    => $uid,
            'text'      => $text,
            'pinned'    => !empty($req['pinned']) ? 1 : 0,
            'createdAt' => current_time('mysql'),
        ];
    }

    public function update_note($req) {
        global $wpdb;
        $id = intval($req['id']);
        if (!$id) return new WP_Error('flatmate_invalid', 'id required', ['status' => 400]);
        $note = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$this->tables['notes']} WHERE id=%d", $id));
        if (!$note) return new WP_Error('flatmate_not_found', 'Note not found', ['status' => 404]);
        $uid = $this->require_membership($note->house_id);
        if (is_wp_error($uid)) return $uid;
        $data = [];
        $fmt  = [];
        if (isset($req['pinned'])) { $data['pinned'] = $req['pinned'] ? 1 : 0; $fmt[] = '%d'; }
        if (isset($req['text'])) { $data['text'] = sanitize_text_field($req['text']); $fmt[] = '%s'; }
        if (empty($data)) return new WP_Error('flatmate_invalid', 'Nothing to update', ['status' => 400]);
        $wpdb->update($this->tables['notes'], $data, ['id' => $id], $fmt, ['%d']);
        return ['ok' => true];
    }

    public function delete_note($req) {
        global $wpdb;
        $id = intval($req['id']);
        if (!$id) return new WP_Error('flatmate_invalid', 'id required', ['status' => 400]);
        $note = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$this->tables['notes']} WHERE id=%d", $id));
        if (!$note) return new WP_Error('flatmate_not_found', 'Note not found', ['status' => 404]);
        $uid = $this->require_membership($note->house_id);
        if (is_wp_error($uid)) return $uid;
        $wpdb->delete($this->tables['notes'], ['id' => $id], ['%d']);
        return ['ok' => true];
    }

    /* Chores */
    public function list_chores($req) {
        global $wpdb;
        $house_id = intval($req['houseId'] ?? $req['house_id']);
        if (!$house_id) return new WP_Error('flatmate_invalid', 'houseId required', ['status' => 400]);
        $uid = $this->require_membership($house_id);
        if (is_wp_error($uid)) return $uid;
        $limit = max(1, min(200, intval($req['per_page'] ?? 100)));
        $offset = max(0, intval($req['offset'] ?? 0));
        $sql = $wpdb->prepare(
            "SELECT * FROM {$this->tables['chores']} WHERE house_id=%d ORDER BY due_date IS NULL, due_date ASC, created_at DESC LIMIT %d OFFSET %d",
            $house_id, $limit, $offset
        );
        return $wpdb->get_results($sql, ARRAY_A);
    }

    public function create_chore($req) {
        global $wpdb;
        $uid = $this->current_user_or_error();
        if (is_wp_error($uid)) return $uid;
        $house_id = intval($req['houseId'] ?? $req['house_id']);
        if (!$house_id) return new WP_Error('flatmate_invalid', 'houseId required', ['status' => 400]);
        if (!$this->is_house_member($house_id, $uid)) {
            return new WP_Error('flatmate_forbidden', 'Not a member of this house', ['status' => 403]);
        }
        $title = sanitize_text_field($req['title']);
        if (!$title) return new WP_Error('flatmate_invalid', 'title required', ['status' => 400]);
        $assignee = intval($req['assigneeId'] ?? $req['assignee_id']);
        $rotation = isset($req['rotation']) ? wp_json_encode($req['rotation']) : null;
        $due_date = !empty($req['dueDate']) ? gmdate('Y-m-d H:i:s', strtotime($req['dueDate'])) : null;
        $status = sanitize_text_field($req['status'] ?: 'open');
        $wpdb->insert($this->tables['chores'], [
            'house_id'    => $house_id,
            'title'       => $title,
            'assignee_id' => $assignee ?: null,
            'rotation'    => $rotation,
            'due_date'    => $due_date,
            'status'      => $status,
            'created_by'  => $uid,
        ], ['%d','%s','%d','%s','%s','%s','%d']);
        return [
            'id'         => $wpdb->insert_id,
            'houseId'    => $house_id,
            'title'      => $title,
            'assigneeId' => $assignee ?: null,
            'rotation'   => $rotation ? json_decode($rotation, true) : null,
            'dueDate'    => $due_date,
            'status'     => $status,
        ];
    }

    public function update_chore($req) {
        global $wpdb;
        $id = intval($req['id']);
        if (!$id) return new WP_Error('flatmate_invalid', 'id required', ['status' => 400]);
        $chore = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$this->tables['chores']} WHERE id=%d", $id));
        if (!$chore) return new WP_Error('flatmate_not_found', 'Chore not found', ['status' => 404]);
        $uid = $this->require_membership($chore->house_id);
        if (is_wp_error($uid)) return $uid;
        $data = [];
        $fmt  = [];
        if (isset($req['title'])) { $data['title'] = sanitize_text_field($req['title']); $fmt[] = '%s'; }
        if (isset($req['assigneeId']) || isset($req['assignee_id'])) { $data['assignee_id'] = intval($req['assigneeId'] ?? $req['assignee_id']); $fmt[] = '%d'; }
        if (isset($req['rotation'])) { $data['rotation'] = wp_json_encode($req['rotation']); $fmt[] = '%s'; }
        if (isset($req['status'])) { $data['status'] = sanitize_text_field($req['status']); $fmt[] = '%s'; }
        if (isset($req['dueDate'])) { $data['due_date'] = gmdate('Y-m-d H:i:s', strtotime($req['dueDate'])); $fmt[] = '%s'; }
        if (empty($data)) return new WP_Error('flatmate_invalid', 'Nothing to update', ['status' => 400]);
        $wpdb->update($this->tables['chores'], $data, ['id' => $id], $fmt, ['%d']);
        return ['ok' => true];
    }

    public function delete_chore($req) {
        global $wpdb;
        $id = intval($req['id']);
        if (!$id) return new WP_Error('flatmate_invalid', 'id required', ['status' => 400]);
        $chore = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$this->tables['chores']} WHERE id=%d", $id));
        if (!$chore) return new WP_Error('flatmate_not_found', 'Chore not found', ['status' => 404]);
        $uid = $this->require_membership($chore->house_id);
        if (is_wp_error($uid)) return $uid;
        $wpdb->delete($this->tables['chores'], ['id' => $id], ['%d']);
        return ['ok' => true];
    }

    /* Expenses */
    public function list_expenses($req) {
        global $wpdb;
        $house_id = intval($req['houseId'] ?? $req['house_id']);
        if (!$house_id) return new WP_Error('flatmate_invalid', 'houseId required', ['status' => 400]);
        $uid = $this->require_membership($house_id);
        if (is_wp_error($uid)) return $uid;
        $limit = max(1, min(200, intval($req['per_page'] ?? 100)));
        $offset = max(0, intval($req['offset'] ?? 0));
        $sql = $wpdb->prepare(
            "SELECT * FROM {$this->tables['expenses']} WHERE house_id=%d ORDER BY created_at DESC LIMIT %d OFFSET %d",
            $house_id, $limit, $offset
        );
        return $wpdb->get_results($sql, ARRAY_A);
    }

    public function create_expense($req) {
        global $wpdb;
        $uid = $this->current_user_or_error();
        if (is_wp_error($uid)) return $uid;
        $house_id = intval($req['houseId'] ?? $req['house_id']);
        if (!$house_id) return new WP_Error('flatmate_invalid', 'houseId required', ['status' => 400]);
        if (!$this->is_house_member($house_id, $uid)) {
            return new WP_Error('flatmate_forbidden', 'Not a member of this house', ['status' => 403]);
        }
        $amount = floatval($req['amount']);
        $currency = sanitize_text_field($req['currency'] ?: 'USD');
        $description = sanitize_text_field($req['description'] ?: '');
        $status = sanitize_text_field($req['status'] ?: 'open');
        $wpdb->insert($this->tables['expenses'], [
            'house_id'   => $house_id,
            'user_id'    => $uid,
            'amount'     => $amount,
            'currency'   => $currency,
            'description'=> $description,
            'status'     => $status,
        ], ['%d','%d','%f','%s','%s','%s']);
        return [
            'id'          => $wpdb->insert_id,
            'houseId'     => $house_id,
            'userId'      => $uid,
            'amount'      => $amount,
            'currency'    => $currency,
            'description' => $description,
            'status'      => $status,
            'createdAt'   => current_time('mysql'),
        ];
    }

    public function update_expense($req) {
        global $wpdb;
        $id = intval($req['id']);
        if (!$id) return new WP_Error('flatmate_invalid', 'id required', ['status' => 400]);
        $expense = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$this->tables['expenses']} WHERE id=%d", $id));
        if (!$expense) return new WP_Error('flatmate_not_found', 'Expense not found', ['status' => 404]);
        $uid = $this->require_membership($expense->house_id);
        if (is_wp_error($uid)) return $uid;
        $data = [];
        $fmt  = [];
        if (isset($req['amount'])) { $data['amount'] = floatval($req['amount']); $fmt[] = '%f'; }
        if (isset($req['currency'])) { $data['currency'] = sanitize_text_field($req['currency']); $fmt[] = '%s'; }
        if (isset($req['description'])) { $data['description'] = sanitize_text_field($req['description']); $fmt[] = '%s'; }
        if (isset($req['status'])) { $data['status'] = sanitize_text_field($req['status']); $fmt[] = '%s'; }
        if (empty($data)) return new WP_Error('flatmate_invalid', 'Nothing to update', ['status' => 400]);
        $wpdb->update($this->tables['expenses'], $data, ['id' => $id], $fmt, ['%d']);
        return ['ok' => true];
    }

    public function delete_expense($req) {
        global $wpdb;
        $id = intval($req['id']);
        if (!$id) return new WP_Error('flatmate_invalid', 'id required', ['status' => 400]);
        $expense = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$this->tables['expenses']} WHERE id=%d", $id));
        if (!$expense) return new WP_Error('flatmate_not_found', 'Expense not found', ['status' => 404]);
        $uid = $this->require_membership($expense->house_id);
        if (is_wp_error($uid)) return $uid;
        $wpdb->delete($this->tables['expenses'], ['id' => $id], ['%d']);
        return ['ok' => true];
    }
}

Flatmate_API_Plugin::instance();
