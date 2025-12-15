import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isHouseAdmin as domainIsHouseAdmin } from "../domain/houses";

const PAGE_SIZE = 10;
const COMMENTS_BATCH = 50;
const DEFAULT_AVATAR = "/avatars/avatar-happy.svg";

const randomId = () => {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export default function CommunityScreen({ me, house, houseUsers = [], onBack, authToken }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [composerText, setComposerText] = useState("");
  const [composerImage, setComposerImage] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [creatingPost, setCreatingPost] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [commentLoading, setCommentLoading] = useState({});
  const [threadLoading, setThreadLoading] = useState({});
  const [deletingPostId, setDeletingPostId] = useState(null);
  const [composerFocused, setComposerFocused] = useState(false);
  const composerTextareaRef = useRef(null);
  const houseId = house?.id;
  const isHouseAdmin = domainIsHouseAdmin(me, house);

  const houseUsersByWp = useMemo(() => {
    const map = new Map();
    houseUsers.forEach(user => {
      const candidates = [
        user?.wpId,
        user?.wp_id,
        user?.wpUserId,
        user?.wp_user_id
      ];
      candidates.forEach(val => {
        if (val === undefined || val === null) return;
        map.set(String(val), user);
      });
    });
    return map;
  }, [houseUsers]);

  const hydrateAuthor = useCallback(
    (wpId, fallback = {}) => {
      const key = wpId ? String(wpId) : null;
      const localUser = key ? houseUsersByWp.get(key) : null;

      const fallbackAvatar =
        fallback.avatar ||
        fallback.avatarUrl ||
        fallback.avatarURL ||
        fallback.avatar_url ||
        fallback.avatar_urls?.["48"] ||
        fallback.author_avatar_urls?.["48"] ||
        DEFAULT_AVATAR;

      const fallbackName =
        localUser?.name ||
        fallback.name ||
        fallback.display_name ||
        fallback.displayName ||
        fallback.author_name ||
        fallback.username ||
        fallback.user_login ||
        "Housemate";

      const fallbackEmail =
        localUser?.email ||
        fallback.email ||
        fallback.author_email ||
        "";

      const avatar = localUser?.photo || fallbackAvatar;
      const isAdmin = localUser ? domainIsHouseAdmin(localUser, house) : Boolean(fallback.is_admin);
      return {
        id: key,
        name: fallbackName,
        email: fallbackEmail,
        avatar,
        isAdmin
      };
    },
    [houseUsersByWp, house]
  );

  const normalizeComment = useCallback(
    (comment) => {
      if (!comment) return null;
      const id =
        comment.id ??
        comment.commentId ??
        comment.comment_id ??
        comment.ID ??
        comment.uuid ??
        comment.database_id;
      const authorId = comment.authorId ?? comment.author_id ?? comment.user_id ?? null;
      const relatedPostId = comment.postId ?? comment.post_id ?? comment.post ?? null;
      return {
        id: String(id ?? randomId()),
        postId: relatedPostId ? String(relatedPostId) : null,
        text: comment.text || comment.content || "",
        createdAt: comment.createdAt || comment.created_at || new Date().toISOString(),
        authorId: authorId ? String(authorId) : null,
        author: hydrateAuthor(authorId, comment.author || comment.user || {})
      };
    },
    [hydrateAuthor]
  );

  const normalizePost = useCallback(
    (post) => {
      if (!post) return null;
      const id =
        post.id ??
        post.postId ??
        post.post_id ??
        post.ID ??
        post.uuid ??
        post.database_id;
      const authorId = post.authorId ?? post.author_id ?? post.user_id ?? null;
      const comments = Array.isArray(post.comments)
        ? post.comments
            .map(normalizeComment)
            .filter(Boolean)
        : [];
      return {
        id: String(id ?? randomId()),
        houseId: post.houseId ?? post.house_id ?? houseId,
        authorId: authorId ? String(authorId) : null,
        author: hydrateAuthor(authorId, post.author || {}),
        text: post.text || post.content || "",
        mediaUrl: post.mediaUrl || post.media_url || null,
        mediaId: post.mediaId ?? post.media_id ?? null,
        commentCount: Number(post.commentCount ?? post.comment_count ?? comments.length),
        createdAt: post.createdAt || post.created_at || new Date().toISOString(),
        updatedAt: post.updatedAt || post.updated_at || null,
        comments,
        hasFullThread: false
      };
    },
    [houseId, hydrateAuthor, normalizeComment]
  );

  const headers = useMemo(() => (authToken ? { Authorization: `Flatmate ${authToken}` } : {}), [authToken]);

  const fetchPosts = useCallback(
    async (nextPage = 1, append = false) => {
      if (!houseId) {
        setPosts([]);
        setHasMore(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const resp = await fetch(
          `/api/wp-posts?houseId=${encodeURIComponent(houseId)}&page=${nextPage}&per_page=${PAGE_SIZE}&withComments=true`,
          { headers }
        );
        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(data?.error || "Failed to load posts");
        }
        const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
        const normalized = items.map(normalizePost).filter(Boolean);
        setPosts(prev => (append ? [...prev, ...normalized] : normalized));
        const nextHasMore = normalized.length >= PAGE_SIZE;
        setHasMore(nextHasMore);
        setPage(nextPage);
      } catch (err) {
        setError(err.message || "Could not load posts");
        if (!append) {
          setPosts([]);
        }
      } finally {
        setLoading(false);
      }
    },
    [headers, houseId, normalizePost]
  );

  useEffect(() => {
    setPosts([]);
    setPage(1);
    setHasMore(true);
    if (houseId) {
      fetchPosts(1, false);
    }
  }, [houseId, fetchPosts]);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const handleImageChange = useCallback((event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    const preview = URL.createObjectURL(file);
    setComposerImage(file);
    setImagePreview(preview);
  }, [imagePreview]);

  const clearComposerMedia = useCallback(() => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setComposerImage(null);
    setImagePreview("");
  }, [imagePreview]);

  const handleCreatePost = useCallback(async () => {
    if (!houseId || (!composerText.trim() && !composerImage)) return;
    setCreatingPost(true);
    setError("");
    try {
      const form = new FormData();
      if (composerText.trim()) form.append("text", composerText.trim());
      if (composerImage) form.append("image", composerImage);
      const resp = await fetch(`/api/wp-posts?houseId=${encodeURIComponent(houseId)}`, {
        method: "POST",
        headers,
        body: form
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error || "Failed to publish post");
      }
      const normalized = normalizePost(data);
      if (normalized) {
        setPosts(prev => [normalized, ...prev]);
      }
      setComposerText("");
      clearComposerMedia();
    } catch (err) {
      setError(err.message || "Could not publish post");
    } finally {
      setCreatingPost(false);
    }
  }, [composerImage, composerText, headers, houseId, normalizePost, clearComposerMedia]);

  const updatePostState = useCallback((postId, updater) => {
    setPosts(prev => prev.map(post => (post.id === postId ? updater(post) : post)));
  }, []);

  const handleDeletePost = useCallback(async (postId) => {
    if (!postId) return;
    if (typeof window !== "undefined" && !window.confirm("Delete this post?")) return;
    setDeletingPostId(postId);
    setError("");
    try {
      const resp = await fetch(`/api/wp-posts?postId=${encodeURIComponent(postId)}`, {
        method: "DELETE",
        headers
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.error || "Failed to delete post");
      }
      setPosts(prev => prev.filter(post => post.id !== postId));
    } catch (err) {
      setError(err.message || "Could not delete post");
    } finally {
      setDeletingPostId(null);
    }
  }, [headers]);

  const handleCommentChange = useCallback((postId, value) => {
    setCommentDrafts(prev => ({ ...prev, [postId]: value }));
  }, []);

  const handleAddComment = useCallback(async (postId) => {
    const draft = (commentDrafts[postId] || "").trim();
    if (!draft) return;
    setCommentLoading(prev => ({ ...prev, [postId]: true }));
    setError("");
    try {
      const resp = await fetch(`/api/wp-post-comments?postId=${encodeURIComponent(postId)}`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text: draft })
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error || "Failed to add comment");
      }
      const normalized = normalizeComment(data);
      if (normalized) {
        updatePostState(postId, post => ({
          ...post,
          comments: [...post.comments, normalized],
          commentCount: post.commentCount + 1
        }));
      }
      setCommentDrafts(prev => ({ ...prev, [postId]: "" }));
    } catch (err) {
      setError(err.message || "Could not add comment");
    } finally {
      setCommentLoading(prev => ({ ...prev, [postId]: false }));
    }
  }, [commentDrafts, headers, normalizeComment, updatePostState]);

  const handleDeleteComment = useCallback(async (postId, commentId) => {
    if (!commentId) return;
    if (typeof window !== "undefined" && !window.confirm("Delete this comment?")) return;
    setThreadLoading(prev => ({ ...prev, [`delete-${commentId}`]: true }));
    setError("");
    try {
      const resp = await fetch(
        `/api/wp-post-comments?postId=${encodeURIComponent(postId)}&commentId=${encodeURIComponent(commentId)}`,
        {
          method: "DELETE",
          headers
        }
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.error || "Failed to delete comment");
      }
      updatePostState(postId, post => ({
        ...post,
        comments: post.comments.filter(comment => comment.id !== commentId),
        commentCount: Math.max(0, post.commentCount - 1)
      }));
    } catch (err) {
      setError(err.message || "Could not delete comment");
    } finally {
      setThreadLoading(prev => {
        const copy = { ...prev };
        delete copy[`delete-${commentId}`];
        return copy;
      });
    }
  }, [headers, updatePostState]);

  const loadFullThread = useCallback(async (postId) => {
    setThreadLoading(prev => ({ ...prev, [postId]: true }));
    setError("");
    try {
      const resp = await fetch(
        `/api/wp-post-comments?postId=${encodeURIComponent(postId)}&per_page=${COMMENTS_BATCH}`,
        { headers }
      );
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error || "Failed to load comments");
      }
      const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      const normalized = items.map(normalizeComment).filter(Boolean);
      updatePostState(postId, post => ({
        ...post,
        comments: normalized,
        hasFullThread: true
      }));
    } catch (err) {
      setError(err.message || "Could not load comments");
    } finally {
      setThreadLoading(prev => ({ ...prev, [postId]: false }));
    }
  }, [headers, normalizeComment, updatePostState]);

  const canManagePost = useCallback((post) => {
    if (!post) return false;
    if (isHouseAdmin) return true;
    if (!me?.wpId) return false;
    return String(me.wpId) === String(post.authorId);
  }, [isHouseAdmin, me?.wpId]);

  const canManageComment = useCallback((comment) => {
    if (!comment) return false;
    if (isHouseAdmin) return true;
    if (!me?.wpId) return false;
    return String(me.wpId) === String(comment.authorId);
  }, [isHouseAdmin, me?.wpId]);

  const handleLoadMore = useCallback(() => {
    if (loading || !hasMore) return;
    fetchPosts(page + 1, true);
  }, [fetchPosts, hasMore, loading, page]);

  const formatRelativeTime = useCallback((value) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    const diff = Date.now() - date.getTime();
    const segments = [
      { limit: 60 * 1000, divisor: 1000, unit: "s" },
      { limit: 60 * 60 * 1000, divisor: 60 * 1000, unit: "m" },
      { limit: 24 * 60 * 60 * 1000, divisor: 60 * 60 * 1000, unit: "h" },
      { limit: 7 * 24 * 60 * 60 * 1000, divisor: 24 * 60 * 60 * 1000, unit: "d" }
    ];
    for (const segment of segments) {
      if (diff < segment.limit) {
        const value = Math.max(1, Math.round(diff / segment.divisor));
        return `${value}${segment.unit} ago`;
      }
    }
    return date.toLocaleDateString();
  }, []);

  const heroStats = useMemo(() => {
    const latestPost = posts[0];
    const totalComments = posts.reduce((acc, post) => acc + (Number(post.commentCount) || 0), 0);
    const formatValue = (val) =>
      typeof val === "number" && Number.isFinite(val) && val > 0 ? val.toString().padStart(2, "0") : "—";
    return [
      {
        id: "members",
        label: "Housemates",
        value: formatValue(houseUsers.length),
        caption: houseUsers.length ? "synced in this space" : "invite your circle"
      },
      {
        id: "posts",
        label: "Live posts",
        value: formatValue(posts.length),
        caption: posts.length ? "this week" : "waiting for first drop"
      },
      {
        id: "conversation",
        label: "Conversation",
        value: formatValue(totalComments),
        caption: latestPost?.createdAt ? `Latest ${formatRelativeTime(latestPost.createdAt)}` : "ready when you are"
      }
    ];
  }, [formatRelativeTime, houseUsers.length, posts]);

  const handleRefresh = useCallback(() => {
    if (!houseId) return;
    fetchPosts(1, false);
  }, [fetchPosts, houseId]);

  const focusComposer = useCallback(() => {
    composerTextareaRef.current?.focus();
  }, []);

  const composerDisabled = !houseId || creatingPost;
  const composerReady = !composerDisabled && (composerText.trim() || composerImage);
  const showEmptyState = !loading && posts.length === 0;

  return (
    <div className="community-screen stack" style={{ gap: 20, paddingTop: 16 }}>
      <div className="community-screen__heading">
        <div className="community-heading__title">
          <div className="section-title">Community feed</div>
          {onBack && (
            <button className="btn ghost small" onClick={onBack}>
              <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
              <span>Back</span>
            </button>
          )}
        </div>
      </div>

      <section className="panel community-hero">
        <div className="community-hero__header">
          <div>
            <p className="community-hero__eyebrow">Overview</p>
            <p className="community-hero__summary-text">
              {houseId
                ? "Mobile pulse for your house—posts, people, and conversations."
                : "Invite your house to Flatmate to see live community insights."}
            </p>
          </div>
          {houseId && (
            <button className="btn secondary small" onClick={handleRefresh} disabled={loading}>
              <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
              <span>{loading ? "Syncing..." : "Refresh"}</span>
            </button>
          )}
        </div>
        <div className="community-hero__list">
          {heroStats.map(stat => (
            <div key={stat.id} className="community-hero__item">
              <div className="community-hero__item-text">
                <span className="community-hero__label">{stat.label}</span>
                {stat.caption && <span className="small muted">{stat.caption}</span>}
              </div>
              <div className="community-hero__value">{stat.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel community-composer">
        <div
          className={[
            "community-composer__field",
            composerFocused ? "is-focused" : "",
            composerDisabled ? "is-disabled" : ""
          ].filter(Boolean).join(" ")}
        >
          <textarea
            ref={composerTextareaRef}
            className="community-composer__input community-composer__input--condensed"
            placeholder={
              houseId
                ? "Share an update, ask for backup, or celebrate a win."
                : "Join or create a house to start sharing updates."
            }
            rows={3}
            value={composerText}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => setComposerFocused(false)}
            onChange={e => setComposerText(e.target.value)}
            disabled={composerDisabled}
          />

          {imagePreview && (
            <div className="community-media-preview">
              <img src={imagePreview} alt="Preview" />
              <button
                className="btn icon-only danger"
                onClick={clearComposerMedia}
                aria-label="Remove photo"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
          )}

          <div className="community-composer__actionbar">
            <div className="community-composer__action-left">
              <label className={`chip-button ${composerDisabled ? "is-disabled" : ""}`}>
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  disabled={composerDisabled}
                  onChange={handleImageChange}
                />
                <span className="material-symbols-outlined" aria-hidden="true">add_a_photo</span>
                <span>Photo</span>
              </label>
              {imagePreview && (
                <button type="button" className="chip-button ghost" onClick={clearComposerMedia}>
                  <span className="material-symbols-outlined" aria-hidden="true">backspace</span>
                  <span>Reset media</span>
                </button>
              )}
            </div>
            <button
              className="btn community-composer__post"
              onClick={handleCreatePost}
              disabled={!composerReady}
            >
              {creatingPost ? "Posting..." : "Post"}
            </button>
          </div>
        </div>

        {error && (
          <div className="community-inline-error">
            <span className="material-symbols-outlined" aria-hidden="true">error</span>
            <span>{error}</span>
          </div>
        )}
      </section>

      <section className="community-feed stack" style={{ gap: 16 }}>
        {loading && posts.length === 0 && (
          <div className="panel community-empty">
            <div className="small muted">Loading posts...</div>
          </div>
        )}

        {showEmptyState && (
          <div className="panel community-empty">
            <span className="material-symbols-outlined" aria-hidden="true">hotel_class</span>
            <div className="community-empty__copy">
              <div className="h3" style={{ margin: 0 }}>No updates yet</div>
              <p className="small muted" style={{ margin: 0 }}>
                Share a quick win, drop an errand reminder, or ask for backup. The thread lives here.
              </p>
            </div>
            {houseId && (
              <button className="btn secondary small" type="button" onClick={focusComposer}>
                Start a post
              </button>
            )}
          </div>
        )}

        {posts.map(post => (
          <article key={post.id} className="panel community-post">
            <header className="community-post__header">
              <div className="community-post__author">
                <div className="community-avatar">
                  <img
                    src={post.author?.avatar || DEFAULT_AVATAR}
                    alt=""
                  />
                </div>
                <div>
                  <div className="community-author-line">
                    <span className="community-author-name">{post.author?.name || "Housemate"}</span>
                    {post.author?.isAdmin && <span className="chip chip-admin">Admin</span>}
                  </div>
                  <span className="community-post__timestamp">
                    {post.createdAt ? new Date(post.createdAt).toLocaleString() : ""}
                  </span>
                </div>
              </div>
              {canManagePost(post) && (
                <button
                  className="btn ghost small"
                  onClick={() => handleDeletePost(post.id)}
                  disabled={deletingPostId === post.id}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                  <span>{deletingPostId === post.id ? "Removing..." : "Delete"}</span>
                </button>
              )}
            </header>

            {post.text && (
              <p className="community-post__text">
                {post.text}
              </p>
            )}

            {post.mediaUrl && (
              <div className="community-post__media">
                <img src={post.mediaUrl} alt="" />
              </div>
            )}

            <div className="community-post__meta">
              <span className="small muted">
                {post.commentCount === 0
                  ? "No comments yet"
                  : `${post.commentCount} comment${post.commentCount === 1 ? "" : "s"}`}
              </span>
              {post.commentCount > post.comments.length && (
                <button
                  className="btn ghost small"
                  onClick={() => loadFullThread(post.id)}
                  disabled={threadLoading[post.id]}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">forum</span>
                  <span>{threadLoading[post.id] ? "Loading..." : "View all"}</span>
                </button>
              )}
            </div>

            <div className="community-comments">
              {post.comments.map(comment => (
                <div key={comment.id} className="community-comment">
                  <div className="community-comment__top">
                    <div className="community-avatar community-avatar--sm">
                      <img
                        src={comment.author?.avatar || DEFAULT_AVATAR}
                        alt=""
                      />
                    </div>
                    <div className="community-comment__meta">
                      <div className="community-author-line">
                        <span className="community-author-name">{comment.author?.name || "Housemate"}</span>
                        {comment.author?.isAdmin && <span className="chip chip-admin">Admin</span>}
                      </div>
                      <span className="community-post__timestamp">
                        {comment.createdAt ? new Date(comment.createdAt).toLocaleString() : ""}
                      </span>
                    </div>
                    {canManageComment(comment) && (
                      <button
                        className="btn ghost small"
                        onClick={() => handleDeleteComment(post.id, comment.id)}
                        disabled={Boolean(threadLoading[`delete-${comment.id}`])}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                  <div className="community-comment__body">
                    {comment.text}
                  </div>
                </div>
              ))}

              <div className="community-comment-composer">
                <div className="community-comment-input-wrap">
                  <textarea
                    className="community-comment-input"
                    rows={2}
                    placeholder="Add a comment..."
                    value={commentDrafts[post.id] || ""}
                    onChange={e => handleCommentChange(post.id, e.target.value)}
                  />
                  <button
                    className="btn secondary small community-comment-submit"
                    onClick={() => handleAddComment(post.id)}
                    disabled={!commentDrafts[post.id]?.trim() || commentLoading[post.id]}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">send</span>
                    <span>{commentLoading[post.id] ? "Posting..." : "Comment"}</span>
                  </button>
                </div>
              </div>
            </div>
          </article>
        ))}

        {hasMore && posts.length > 0 && (
          <div className="panel community-load-more">
            <button className="btn ghost" onClick={handleLoadMore} disabled={loading}>
              <span className="material-symbols-outlined" aria-hidden="true">unfold_more</span>
              <span>{loading ? "Loading..." : "Load more posts"}</span>
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
