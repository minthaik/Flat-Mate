import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isHouseAdmin as domainIsHouseAdmin } from "../domain/houses";

const PAGE_SIZE = 10;
const COMMENTS_BATCH = 50;
const DEFAULT_AVATAR = "/avatars/avatar-happy.svg";
const POST_QUEUE_KEY = "community_post_queue_v1";
const MAX_MEDIA_DIMENSION = 1600;
const MEDIA_JPEG_QUALITY = 0.82;

const randomId = () => {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

const loadImageElement = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.decoding = "async";
    img.src = src;
  });

const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== "function") {
      reject(new Error("Canvas toBlob unsupported"));
      return;
    }
    canvas.toBlob(
      blob => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to compress image"));
        }
      },
      type,
      quality
    );
  });

async function resizeImageFile(file, maxDimension = MAX_MEDIA_DIMENSION, quality = MEDIA_JPEG_QUALITY) {
  if (typeof window === "undefined" || !file?.type?.startsWith("image/")) return file;
  try {
    const dataUrl = await readFileAsDataUrl(file);
    const image = await loadImageElement(dataUrl);
    const { width, height } = image;
    if (!width || !height) return file;
    const scale = Math.min(maxDimension / width, maxDimension / height, 1);
    if (!Number.isFinite(scale) || scale >= 1) {
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const preferredMime = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await canvasToBlob(
      canvas,
      preferredMime,
      preferredMime === "image/png" ? undefined : quality
    );
    const optimizedName =
      file.name?.replace(/\.(png|jpe?g|webp)$/i, preferredMime === "image/png" ? ".png" : ".jpg") ||
      `upload.${preferredMime === "image/png" ? "png" : "jpg"}`;
    return new File([blob], optimizedName, { type: blob.type, lastModified: Date.now() });
  } catch {
    return file;
  }
}

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
  const [lightboxMedia, setLightboxMedia] = useState(null);
  const composerTextareaRef = useRef(null);
  const lightboxCloseRef = useRef(null);
  const [pendingActivePosts, setActivePendingPosts] = useState([]);
  const [queuedPostEntries, setQueuedPostEntries] = useState([]);
  const queueRef = useRef([]);
  const flushingQueueRef = useRef(false);
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
  const meAuthorId = me?.wpId ? String(me.wpId) : null;
  const currentAuthor = useMemo(() => ({
    name: me?.name || "You",
    avatar: me?.photo || DEFAULT_AVATAR,
    isAdmin: domainIsHouseAdmin(me, house)
  }), [me?.name, me?.photo, house, me]);

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
  const persistQueueForHouse = useCallback((items) => {
    if (typeof window === "undefined" || !houseId) return;
    try {
      const raw = localStorage.getItem(POST_QUEUE_KEY);
      const map = raw ? JSON.parse(raw) : {};
      map[houseId] = items;
      localStorage.setItem(POST_QUEUE_KEY, JSON.stringify(map));
    } catch {
      // ignore storage issues
    }
    queueRef.current = items;
    setQueuedPostEntries(items);
  }, [houseId]);
  const loadQueueForHouse = useCallback(() => {
    if (typeof window === "undefined" || !houseId) {
      queueRef.current = [];
      setQueuedPostEntries([]);
      return [];
    }
    try {
      const raw = localStorage.getItem(POST_QUEUE_KEY);
      if (!raw) {
        queueRef.current = [];
        setQueuedPostEntries([]);
        return [];
      }
      const map = JSON.parse(raw);
      const list = Array.isArray(map[houseId]) ? map[houseId] : [];
      queueRef.current = list;
      setQueuedPostEntries(list);
      return list;
    } catch {
      queueRef.current = [];
      setQueuedPostEntries([]);
      return [];
    }
  }, [houseId]);
  const enqueueQueueEntry = useCallback((entry) => {
    const next = [entry, ...queueRef.current];
    persistQueueForHouse(next);
  }, [persistQueueForHouse]);
  const removeQueueEntry = useCallback((entryId) => {
    const next = queueRef.current.filter(item => item.id !== entryId);
    persistQueueForHouse(next);
  }, [persistQueueForHouse]);
  const updateQueueEntry = useCallback((entryId, patch) => {
    const next = queueRef.current.map(item => (item.id === entryId ? { ...item, ...patch } : item));
    persistQueueForHouse(next);
  }, [persistQueueForHouse]);
  const buildActivePendingDisplay = useCallback((entry) => ({
    id: entry.id,
    houseId,
    text: entry.text,
    mediaUrl: null,
    mediaPreview: entry.mediaPreview || "",
    authorId: meAuthorId,
    author: currentAuthor,
    createdAt: entry.createdAt,
    commentCount: 0,
    comments: [],
    hasFullThread: true,
    pending: true,
    status: entry.status || "sending",
    error: entry.error || "",
    pendingMetadata: { type: "active", id: entry.id }
  }), [currentAuthor, houseId, meAuthorId]);
  const buildQueuedPendingDisplay = useCallback((entry) => ({
    id: entry.id,
    houseId,
    text: entry.text,
    mediaUrl: null,
    mediaPreview: "",
    authorId: meAuthorId,
    author: currentAuthor,
    createdAt: entry.createdAt,
    commentCount: 0,
    comments: [],
    hasFullThread: true,
    pending: true,
    status: entry.status || "queued",
    error: entry.error || "",
    pendingMetadata: { type: "queue", id: entry.id }
  }), [currentAuthor, houseId, meAuthorId]);
  const pendingDisplayPosts = useMemo(() => {
    const activeDisplays = pendingActivePosts.map(buildActivePendingDisplay);
    const queuedDisplays = queuedPostEntries.map(buildQueuedPendingDisplay);
    return [...activeDisplays, ...queuedDisplays];
  }, [pendingActivePosts, queuedPostEntries, buildActivePendingDisplay, buildQueuedPendingDisplay]);
  const combinedPosts = useMemo(() => [...pendingDisplayPosts, ...posts], [pendingDisplayPosts, posts]);
  const submitPost = useCallback(async ({ text, imageFile }) => {
    if (!houseId) throw new Error("House required");
    const form = new FormData();
    if (text) form.append("text", text);
    if (imageFile) form.append("image", imageFile);
    const resp = await fetch(`/api/wp-posts?houseId=${encodeURIComponent(houseId)}`, {
      method: "POST",
      headers,
      body: form
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data?.error || "Failed to publish post");
    }
    return normalizePost(data);
  }, [headers, houseId, normalizePost]);
  const publishQueuedEntry = useCallback(async (entry) => {
    const normalized = await submitPost({ text: entry.text, imageFile: null });
    removeQueueEntry(entry.id);
    setPosts(prev => [normalized, ...prev]);
  }, [removeQueueEntry, submitPost]);
  const flushQueue = useCallback(async () => {
    if (!houseId || queueRef.current.length === 0 || flushingQueueRef.current) return;
    flushingQueueRef.current = true;
    for (const entry of queueRef.current) {
      updateQueueEntry(entry.id, { status: "sending", error: "" });
      try {
        await publishQueuedEntry(entry);
      } catch (err) {
        updateQueueEntry(entry.id, { status: "error", error: err.message || "Failed to send" });
        break;
      }
    }
    flushingQueueRef.current = false;
  }, [houseId, publishQueuedEntry, updateQueueEntry]);
  const releasePreview = useCallback((entry) => {
    if (entry?.mediaPreview && typeof window !== "undefined") {
      try {
        URL.revokeObjectURL(entry.mediaPreview);
      } catch {
        // ignore release errors
      }
    }
  }, []);
  const publishActiveEntry = useCallback(async (entry) => {
    try {
      const normalized = await submitPost({ text: entry.text, imageFile: entry.mediaFile || null });
      setActivePendingPosts(prev => prev.filter(item => item.id !== entry.id));
      releasePreview(entry);
      setPosts(prev => [normalized, ...prev]);
    } catch (err) {
      const message = err.message || "Could not publish post";
      if (!entry.mediaFile && entry.text) {
        setActivePendingPosts(prev => prev.filter(item => item.id !== entry.id));
        releasePreview(entry);
        enqueueQueueEntry({
          id: entry.id,
          houseId,
          text: entry.text,
          createdAt: entry.createdAt,
          status: "queued",
          error: ""
        });
        setError("Spotty connection. We'll send queued posts when you're online.");
        flushQueue();
      } else {
        setActivePendingPosts(prev =>
          prev.map(item => (item.id === entry.id ? { ...item, status: "error", error: message } : item))
        );
        setError(message);
      }
    }
  }, [enqueueQueueEntry, flushQueue, houseId, submitPost, releasePreview]);
  const cancelPendingPost = useCallback((post) => {
    const meta = post?.pendingMetadata;
    if (!meta) return;
    if (meta.type === "active") {
      const entry = pendingActivePosts.find(item => item.id === meta.id);
      if (entry) {
        releasePreview(entry);
      }
      setActivePendingPosts(prev => prev.filter(item => item.id !== meta.id));
    } else if (meta.type === "queue") {
      removeQueueEntry(meta.id);
    }
  }, [pendingActivePosts, releasePreview, removeQueueEntry]);
  const retryPendingPost = useCallback((post) => {
    const meta = post?.pendingMetadata;
    if (!meta) return;
    if (meta.type === "active") {
      const entry = pendingActivePosts.find(item => item.id === meta.id);
      if (!entry) return;
      setActivePendingPosts(prev =>
        prev.map(item => (item.id === meta.id ? { ...item, status: "sending", error: "" } : item))
      );
      publishActiveEntry(entry);
    } else if (meta.type === "queue") {
      updateQueueEntry(meta.id, { status: "queued", error: "" });
      flushQueue();
    }
  }, [pendingActivePosts, publishActiveEntry, updateQueueEntry, flushQueue]);

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
    loadQueueForHouse();
    setActivePendingPosts(prev => {
      prev.forEach(entry => releasePreview(entry));
      return [];
    });
  }, [houseId, fetchPosts, loadQueueForHouse, releasePreview]);

  useEffect(() => {
    if (!houseId) return;
    flushQueue();
  }, [houseId, queuedPostEntries.length, flushQueue]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    function handleOnline() {
      flushQueue();
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [flushQueue]);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);
  useEffect(() => {
    if (!lightboxMedia) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeLightbox();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxMedia, closeLightbox]);
  useEffect(() => {
    if (lightboxMedia && lightboxCloseRef.current) {
      lightboxCloseRef.current.focus();
    }
  }, [lightboxMedia]);

  const handleImageChange = useCallback(async (event) => {
    const input = event.target;
    const file = input?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    let optimized = file;
    try {
      optimized = await resizeImageFile(file);
    } catch {
      optimized = file;
    }
    const preview = URL.createObjectURL(optimized);
    setComposerImage(optimized);
    setImagePreview(preview);
  }, [imagePreview]);

  const clearComposerMedia = useCallback(() => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setComposerImage(null);
    setImagePreview("");
  }, [imagePreview]);

  const handleCreatePost = useCallback(() => {
    if (!houseId || (!composerText.trim() && !composerImage)) return;
    const entry = {
      id: randomId(),
      text: composerText.trim(),
      createdAt: new Date().toISOString(),
      mediaFile: composerImage || null,
      mediaPreview: imagePreview || "",
      status: "sending",
      error: ""
    };
    setActivePendingPosts(prev => [entry, ...prev]);
    setComposerText("");
    setComposerImage(null);
    setImagePreview("");
    setCreatingPost(true);
    publishActiveEntry(entry).finally(() => setCreatingPost(false));
  }, [houseId, composerText, composerImage, imagePreview, publishActiveEntry]);

  const updatePostState = useCallback((postId, updater) => {
    setPosts(prev => prev.map(post => (post.id === postId ? updater(post) : post)));
  }, []);

  const handleDeletePost = useCallback(async (postId) => {
    if (!postId) return;
    const activeEntry = pendingActivePosts.find(entry => entry.id === postId);
    if (activeEntry) {
      setActivePendingPosts(prev => prev.filter(entry => entry.id !== postId));
      return;
    }
    if (queueRef.current.some(entry => entry.id === postId)) {
      removeQueueEntry(postId);
      return;
    }
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
  }, [headers, pendingActivePosts, removeQueueEntry]);

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
  const openLightbox = useCallback((post, src) => {
    if (!src) return;
    const trimmed = post?.text?.trim();
    const fallbackAlt = post?.author?.name
      ? `Shared by ${post.author.name}`
      : "Community post image";
    const captionParts = [];
    if (post?.author?.name) captionParts.push(post.author.name);
    if (post?.createdAt) captionParts.push(new Date(post.createdAt).toLocaleString());
    setLightboxMedia({
      src,
      alt: trimmed || fallbackAlt,
      caption: captionParts.join(" • ")
    });
  }, []);
  const closeLightbox = useCallback(() => setLightboxMedia(null), []);

  const composerDisabled = !houseId || creatingPost;
  const composerReady = !composerDisabled && (composerText.trim() || composerImage);
  const showEmptyState = !loading && posts.length === 0 && pendingDisplayPosts.length === 0;

  return (
    <div className="community-screen stack">
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
          <div className="panel-title" style={{ margin: 0 }}>Overview</div>
          <p className="community-hero__summary-text">
            {houseId
              ? "Mobile pulse for your house—posts, people, and conversations."
              : "Invite your house to Flatmate to see live community insights."}
          </p>
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
        {houseId && (
          <div className="community-hero__footer">
            <button className="btn secondary small" onClick={handleRefresh} disabled={loading}>
              <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
              <span>{loading ? "Syncing..." : "Refresh"}</span>
            </button>
          </div>
        )}
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

        {combinedPosts.map(post => {
          const mediaSrc = post.mediaUrl || post.mediaPreview;
          const inlineAlt =
            post.text?.trim() || `${post.author?.name || "Housemate"} shared a photo`;
          return (
            <article key={post.id} className="panel community-post">
            <header className="community-post__header">
              <div className="community-post__author">
                <div className="community-avatar">
                  <img
                    src={post.author?.avatar || DEFAULT_AVATAR}
                    alt=""
                  />
                </div>
                <div className="community-author-line">
                  <div className="community-author-line__primary">
                    <span className="community-author-name">{post.author?.name || "Housemate"}</span>
                    {post.author?.isAdmin && <span className="chip chip-admin">Admin</span>}
                  </div>
                  <span className="community-post__timestamp">
                    {post.createdAt ? new Date(post.createdAt).toLocaleString() : ""}
                  </span>
                </div>
              </div>
              {post.pending ? (
                <div className="community-post__pending-actions">
                  <span
                    className={[
                      "community-post__status",
                      post.status === "error" ? "community-post__status--error" : ""
                    ].filter(Boolean).join(" ")}
                  >
                    {post.status === "queued"
                      ? "Queued"
                      : post.status === "error"
                      ? "Retry needed"
                      : "Sending..."}
                  </span>
                  <div className="community-post__pending-buttons">
                    {post.status === "error" && (
                      <button
                        className="btn ghost small"
                        onClick={() => retryPendingPost(post)}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
                        <span>Retry</span>
                      </button>
                    )}
                    <button
                      className="btn ghost small"
                      onClick={() => cancelPendingPost(post)}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">close</span>
                      <span>Cancel</span>
                    </button>
                  </div>
                </div>
              ) : (
                canManagePost(post) && (
                  <button
                    className="btn ghost small"
                    onClick={() => handleDeletePost(post.id)}
                    disabled={deletingPostId === post.id}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                    <span>{deletingPostId === post.id ? "Removing..." : "Delete"}</span>
                  </button>
                )
              )}
            </header>

            {post.text && (
              <p className="community-post__text">
                {post.text}
              </p>
            )}

            {mediaSrc && (
              <div className="community-post__media">
                <button
                  type="button"
                  className="community-post__media-btn"
                  onClick={() => openLightbox(post, mediaSrc)}
                  aria-label="Expand image"
                >
                  <img src={mediaSrc} alt={inlineAlt} />
                </button>
              </div>
            )}

            <div className="community-post__meta">
              {post.pending ? (
                <span className="small muted">
                  {post.status === "queued"
                    ? "Queued. We'll send it when your connection returns."
                    : post.status === "error"
                    ? post.error || "Unable to send. Retry or cancel."
                    : "Sending..."}
                </span>
              ) : (
                <span className="small muted">
                  {post.commentCount === 0
                    ? "No comments yet"
                    : `${post.commentCount} comment${post.commentCount === 1 ? "" : "s"}`}
                </span>
              )}
              {!post.pending && post.commentCount > post.comments.length && (
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

            {!post.pending ? (
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
                          <div className="community-author-line__primary">
                            <span className="community-author-name">{comment.author?.name || "Housemate"}</span>
                            {comment.author?.isAdmin && <span className="chip chip-admin">Admin</span>}
                          </div>
                          <span className="community-post__timestamp">
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
            ) : (
              <div className="community-post__pending-note small muted">
                {post.status === "queued"
                  ? "Queued posts send automatically once you're online."
                  : post.status === "error"
                  ? post.error || "Unable to send. Retry or cancel this post."
                  : "Sending..."}
              </div>
            )}
            </article>
          );
        })}

        {hasMore && posts.length > 0 && (
          <div className="panel community-load-more">
            <button className="btn ghost" onClick={handleLoadMore} disabled={loading}>
              <span className="material-symbols-outlined" aria-hidden="true">unfold_more</span>
              <span>{loading ? "Loading..." : "Load more posts"}</span>
            </button>
          </div>
        )}
      </section>
      {lightboxMedia && (
        <div
          className="community-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Post image preview"
          onClick={closeLightbox}
        >
          <div
            className="community-lightbox__surface"
            onClick={event => event.stopPropagation()}
          >
            <button
              type="button"
              className="community-lightbox__close"
              onClick={closeLightbox}
              aria-label="Close image preview"
              ref={lightboxCloseRef}
            >
              <span className="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
            <div className="community-lightbox__image">
              <img src={lightboxMedia.src} alt={lightboxMedia.alt || "Post media"} />
            </div>
            {lightboxMedia.caption && (
              <div className="community-lightbox__caption small muted">
                {lightboxMedia.caption}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
