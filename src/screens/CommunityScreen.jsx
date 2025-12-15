import React, { useCallback, useEffect, useMemo, useState } from "react";
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

  const composerDisabled = !houseId || creatingPost;

  return (
    <div className="stack" style={{ gap: 16, paddingTop: 24 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="section-title" style={{ margin: 0 }}>Community feed</div>
        {onBack && (
          <button className="btn ghost small" onClick={onBack}>
            <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
            <span>Back</span>
          </button>
        )}
      </div>

      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {!houseId && (
          <div className="small muted">
            Create or join a house to share updates with your community.
          </div>
        )}
        <textarea
          className="input"
          placeholder="Share what's happening..."
          rows={3}
          value={composerText}
          onChange={e => setComposerText(e.target.value)}
          disabled={composerDisabled}
          style={{ resize: "vertical" }}
        />
        {imagePreview && (
          <div className="card" style={{ padding: 8, position: "relative" }}>
            <img
              src={imagePreview}
              alt="Preview"
              style={{ width: "100%", borderRadius: 8, maxHeight: 320, objectFit: "cover" }}
            />
            <button
              className="btn icon-only danger"
              style={{ position: "absolute", top: 8, right: 8 }}
              onClick={clearComposerMedia}
              aria-label="Remove photo"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        )}
        <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "space-between" }}>
          <label className="btn ghost small" style={{ cursor: composerDisabled ? "not-allowed" : "pointer" }}>
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={composerDisabled}
              onChange={handleImageChange}
            />
            <span className="material-symbols-outlined" aria-hidden="true">photo_camera</span>
            <span>Add photo</span>
          </label>
          <button
            className="btn secondary"
            onClick={handleCreatePost}
            disabled={composerDisabled || (!composerText.trim() && !composerImage)}
          >
            {creatingPost ? "Posting..." : "Post"}
          </button>
        </div>
        {error && (
          <div className="small" style={{ color: "var(--md-sys-color-danger)" }}>
            {error}
          </div>
        )}
      </div>

      <div className="stack" style={{ gap: 12 }}>
        {posts.length === 0 && (
          <div className="panel">
            {loading ? (
              <div className="small muted">Loading posts...</div>
            ) : (
              <div className="small muted">No updates yet. Be the first to post!</div>
            )}
          </div>
        )}

        {posts.map(post => (
          <article key={post.id} className="panel" style={{ padding: 16, gap: 12 }}>
            <div className="stack" style={{ gap: 12 }}>
              <header className="row" style={{ gap: 12, alignItems: "center", justifyContent: "space-between" }}>
                <div className="row" style={{ gap: 12, alignItems: "center", flex: "1 1 auto" }}>
                  <div className="avatar-mark" style={{ width: 48, height: 48 }}>
                    <img
                      src={post.author?.avatar || DEFAULT_AVATAR}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                  <div className="stack" style={{ gap: 4 }}>
                    <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span className="h3" style={{ margin: 0 }}>{post.author?.name || "Housemate"}</span>
                      {post.author?.isAdmin && (
                        <span
                          className="pill"
                          style={{
                            background: "rgba(220, 38, 38, 0.12)",
                            color: "#b91c1c",
                            border: "1px solid rgba(185, 28, 28, 0.3)",
                            fontSize: 11,
                            padding: "4px 10px"
                          }}
                        >
                          Admin
                        </span>
                      )}
                    </div>
                    <span className="small muted">
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
                    {deletingPostId === post.id ? "Removing..." : "Delete"}
                  </button>
                )}
              </header>

              {post.text && <p style={{ margin: "4px 0 0 0", lineHeight: 1.5 }}>{post.text}</p>}
              {post.mediaUrl && (
                <div style={{ borderRadius: 12, overflow: "hidden", marginTop: 8 }}>
                  <img
                    src={post.mediaUrl}
                    alt=""
                    style={{ width: "100%", maxHeight: 420, objectFit: "cover" }}
                  />
                </div>
              )}

              <div
                className="row"
                style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", margin: "8px 0" }}
              >
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
                    {threadLoading[post.id] ? "Loading..." : "View all comments"}
                  </button>
                )}
              </div>

              <div className="stack" style={{ gap: 12 }}>
                {post.comments.map(comment => (
                  <div key={comment.id} className="card" style={{ padding: 12, background: "var(--md-sys-color-surface2)" }}>
                    <div className="row" style={{ gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                      <div className="row" style={{ gap: 10, alignItems: "center", flex: "1 1 auto" }}>
                        <div className="avatar-mark" style={{ width: 36, height: 36 }}>
                          <img
                            src={comment.author?.avatar || DEFAULT_AVATAR}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        </div>
                        <div className="stack" style={{ gap: 2 }}>
                          <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <span className="small emphasis">{comment.author?.name || "Housemate"}</span>
                            {comment.author?.isAdmin && (
                              <span
                                className="pill"
                                style={{
                                  background: "rgba(220, 38, 38, 0.12)",
                                  color: "#b91c1c",
                                  border: "1px solid rgba(185, 28, 28, 0.3)",
                                  fontSize: 10,
                                  padding: "2px 8px"
                                }}
                              >
                                Admin
                              </span>
                            )}
                          </div>
                          <span className="small muted">
                            {comment.createdAt ? new Date(comment.createdAt).toLocaleString() : ""}
                          </span>
                        </div>
                      </div>
                      {canManageComment(comment) && (
                        <button
                          className="btn ghost small"
                          onClick={() => handleDeleteComment(post.id, comment.id)}
                          disabled={Boolean(threadLoading[`delete-${comment.id}`])}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    <div className="small" style={{ marginTop: 8, lineHeight: 1.4 }}>
                      {comment.text}
                    </div>
                  </div>
                ))}

                <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                  <textarea
                    className="input"
                    rows={2}
                    placeholder="Write a comment..."
                    value={commentDrafts[post.id] || ""}
                    onChange={e => handleCommentChange(post.id, e.target.value)}
                    style={{ flex: "1 1 auto", resize: "vertical" }}
                  />
                  <button
                    className="btn secondary small"
                    onClick={() => handleAddComment(post.id)}
                    disabled={!commentDrafts[post.id]?.trim() || commentLoading[post.id]}
                  >
                    {commentLoading[post.id] ? "Posting..." : "Comment"}
                  </button>
                </div>
              </div>
            </div>
          </article>
        ))}

        {hasMore && posts.length > 0 && (
          <div className="panel" style={{ padding: 16 }}>
            <button className="btn ghost" onClick={handleLoadMore} disabled={loading}>
              {loading ? "Loading..." : "Load more posts"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
