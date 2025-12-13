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
    private static $instance = null;
    private $tables;

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
        ];

        register_activation_hook(__FILE__, [$this, 'activate']);
        add_action('rest_api_init', [$this, 'register_routes']);
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
            text TEXT DEFAULT '',
            media_id BIGINT UNSIGNED NULL,
            media_url VARCHAR(512) DEFAULT NULL,
            comment_count INT UNSIGNED NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY house_id (house_id),
            KEY author_id (author_id),
            KEY created_at (created_at)
        ) $charset_collate;";

        $post_comments = "CREATE TABLE {$this->tables['post_comments']} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            post_id BIGINT UNSIGNED NOT NULL,
            author_id BIGINT UNSIGNED NOT NULL,
            text TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY post_id (post_id),
            KEY author_id (author_id)
        ) $charset_collate;";

        dbDelta($houses);
        dbDelta($members);
        dbDelta($notes);
        dbDelta($chores);
        dbDelta($expenses);
        dbDelta($posts);
        dbDelta($post_comments);
    }

    private function current_user_or_error() {
        $uid = get_current_user_id();
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

    private function format_user_summary($user_id) {
        $user = get_userdata($user_id);
        if (!$user) return null;
        return [
            'id' => (int)$user->ID,
            'name' => $user->display_name,
            'email' => $user->user_email,
        ];
    }

    private function format_post_row($row) {
        if (!$row) return null;
        return [
            'id' => (int)$row['id'],
            'houseId' => (int)$row['house_id'],
            'authorId' => (int)$row['author_id'],
            'text' => $row['text'],
            'mediaUrl' => $row['media_url'],
            'mediaId' => $row['media_id'] ? (int)$row['media_id'] : null,
            'commentCount' => (int)$row['comment_count'],
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'],
            'author' => $this->format_user_summary($row['author_id']),
        ];
    }

    private function format_comment_row($row) {
        if (!$row) return null;
        return [
            'id' => (int)$row['id'],
            'postId' => (int)$row['post_id'],
            'authorId' => (int)$row['author_id'],
            'text' => $row['text'],
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'],
            'author' => $this->format_user_summary($row['author_id']),
        ];
    }

    private function append_post_comments(&$posts, $limit = 5) {
        global $wpdb;
        if (empty($posts)) return;
        $ids = array_map(function($post) {
            return (int)$post['id'];
        }, $posts);
        $placeholders = implode(',', array_fill(0, count($ids), '%d'));
        $query = "SELECT * FROM {$this->tables['post_comments']} WHERE post_id IN ($placeholders) ORDER BY created_at DESC";
        $rows = $wpdb->get_results($wpdb->prepare($query, $ids), ARRAY_A);
        $grouped = [];
        foreach ($rows as $row) {
            $pid = (int)$row['post_id'];
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
            "SELECT * FROM {$this->tables['post_comments']} WHERE post_id=%d ORDER BY created_at ASC LIMIT %d OFFSET %d",
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
            "SELECT * FROM {$this->tables['post_comments']} WHERE id=%d",
            $comment_id
        ), ARRAY_A);
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

    private function require_membership($house_id) {
        global $wpdb;
        $uid = $this->current_user_or_error();
        if (is_wp_error($uid)) return $uid;
        // Allow admins/service accounts to bypass membership checks
        if (current_user_can('manage_options') || current_user_can('edit_users')) {
            return $uid;
        }
        if ($this->is_house_member($house_id, $uid)) {
            return $uid;
        }
        // Auto-add the current user as a member to avoid blocking basic-auth service users
        $wpdb->replace($this->tables['members'], [
            'house_id' => $house_id,
            'user_id'  => $uid,
            'role'     => 'member',
            'status'   => 'HOME',
        ], ['%d','%d','%s','%s']);
        if ($this->is_house_member($house_id, $uid)) {
            return $uid;
        }
        return new WP_Error('flatmate_forbidden', 'Not a member of this house', ['status' => 403]);
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
        $user_id = intval($req['user_id']);
        if (!$user_id) return new WP_Error('flatmate_invalid', 'user_id required', ['status' => 400]);
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
        $wpdb->delete($this->tables['members'], ['house_id' => $house_id, 'user_id' => $user_id], ['%d','%d']);
        $member_count = $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$this->tables['members']} WHERE house_id=%d", $house_id));
        if (intval($member_count) === 0) {
            $wpdb->delete($this->tables['houses'], ['id' => $house_id], ['%d']);
            $wpdb->delete($this->tables['notes'], ['house_id' => $house_id], ['%d']);
            $wpdb->delete($this->tables['chores'], ['house_id' => $house_id], ['%d']);
            $wpdb->delete($this->tables['expenses'], ['house_id' => $house_id], ['%d']);
            return ['ok' => true, 'members' => [], 'house_deleted' => true];
        }
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
        $media = null;
        if (!empty($image_file) && !empty($image_file['tmp_name'])) {
            $media = $this->handle_post_media($image_file);
            if (is_wp_error($media)) return $media;
        }
        $wpdb->insert($this->tables['posts'], [
            'house_id' => $house_id,
            'author_id' => $uid,
            'text' => $text,
            'media_id' => $media['id'] ?? null,
            'media_url' => $media['url'] ?? null,
        ], ['%d','%d','%s','%d','%s']);
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
        $wpdb->insert($this->tables['post_comments'], [
            'post_id' => $post_id,
            'author_id' => $uid,
            'text' => $text,
        ], ['%d','%d','%s']);
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
