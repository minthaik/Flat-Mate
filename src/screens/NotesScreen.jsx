import React, { useEffect, useMemo, useState, useCallback } from "react";
import { uid } from "../store/utils";

const normalizeNote = (note = {}, meId) => {
  const id =
    note.id ??
    note.ID ??
    note.noteId ??
    note.note_id ??
    note.record_id ??
    note.databaseId ??
    note.database_id ??
    note.uuid;
  const rawAuthor = note.authorId ?? note.userId ?? note.user_id ?? note.author;
  let authorId =
    rawAuthor !== undefined && rawAuthor !== null && rawAuthor !== ""
      ? String(rawAuthor)
      : meId;
  if (!authorId || authorId === "0") authorId = meId;
  return { ...note, id: id ?? note.id, authorId };
};

export default function NotesScreen({ me, house, houseUsers = [], notes = [], actions, onBack }) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [remoteNotes, setRemoteNotes] = useState(notes.map(n => normalizeNote(n, me?.id)));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const houseId = house?.id;
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;

  useEffect(() => {
    if (!houseId) {
      setRemoteNotes(notes.map(n => normalizeNote(n, me?.id)));
      return;
    }
    let active = true;
    const fetchNotes = async () => {
      setLoading(true);
      setError("");
      try {
        const resp = await fetch(`/api/wp-notes?houseId=${encodeURIComponent(houseId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.error || "Failed to load notes");
        if (!active) return;
        const list = Array.isArray(data) ? data.map(n => normalizeNote(n, me?.id)) : [];
        setRemoteNotes(list);
      } catch (err) {
        if (active) {
          setError(err.message || "Could not load notes");
          setRemoteNotes(notes.map(n => normalizeNote(n, me?.id)));
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchNotes();
    return () => {
      active = false;
    };
  }, [houseId, notes, token, me?.id]);

  const authorLookup = useMemo(() => {
    const map = new Map();
    houseUsers.forEach(user => map.set(user.id, user));
    return map;
  }, [houseUsers]);

  const filteredNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...remoteNotes].filter(note => (pinnedOnly ? note.pinned : true));
    list.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
    if (!q) return list;
    return list.filter(note => (note.text || note.note || "").toLowerCase().includes(q));
  }, [remoteNotes, query, pinnedOnly]);

  const addNote = useCallback(async () => {
    if (!houseId || !draft.trim()) return;
    setSaving(true);
    setError("");
    const payload = {
      houseId,
      text: draft.trim(),
      author: me?.id
    };
    const fallback = {
      id: uid("note"),
      houseId,
      authorId: me?.id,
      text: draft.trim(),
      createdAt: new Date().toISOString(),
      pinned: false
    };
    try {
      const resp = await fetch("/api/wp-notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "Failed to save note");
      const createdId =
        data?.id ??
        data?.ID ??
        data?.noteId ??
        data?.note_id ??
        data?.record_id ??
        data?.databaseId ??
        data?.database_id;
      setRemoteNotes(prev => [normalizeNote({ ...fallback, id: createdId || fallback.id }, me?.id), ...prev]);
      setDraft("");
    } catch (err) {
      setError(err.message || "Could not save note");
      if (actions?.addNote) actions.addNote(fallback);
      setRemoteNotes(prev => [normalizeNote(fallback, me?.id), ...prev]);
      setDraft("");
    } finally {
      setSaving(false);
    }
  }, [draft, houseId, me?.id, token, actions]);

  const togglePin = useCallback(
    async (noteId, pinned) => {
      setError("");
      try {
        const resp = await fetch("/api/wp-notes", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ id: noteId, pinned })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data?.error || "Failed to update note");
        setRemoteNotes(prev => prev.map(note => (note.id === noteId ? { ...note, pinned } : note)));
        if (actions?.updateNote) actions.updateNote(noteId, { pinned });
      } catch (err) {
        setError(err.message || "Could not update note");
      }
    },
    [token, actions]
  );

  const deleteNote = useCallback(
    async noteId => {
      setError("");
      try {
        const resp = await fetch(`/api/wp-notes?id=${encodeURIComponent(noteId)}`, {
          method: "DELETE",
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data?.error || "Failed to delete note");
        setRemoteNotes(prev => prev.filter(note => note.id !== noteId));
        if (actions?.deleteNote) actions.deleteNote(noteId);
      } catch (err) {
        setError(err.message || "Could not delete note");
      }
    },
    [token, actions]
  );

  return (
    <div className="stack" style={{ gap: 16, paddingTop: 24 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="section-title" style={{ margin: 0 }}>
          House notes
        </div>
        {onBack && (
          <button className="btn ghost small" onClick={onBack}>
            <span className="material-symbols-outlined" aria-hidden="true">
              arrow_back
            </span>
            <span>Back</span>
          </button>
        )}
      </div>

      <div className="panel">
        <div className="stack" style={{ gap: 10 }}>
          {!houseId && (
            <div className="small muted" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>
              Create or join a house to see and add notes.
            </div>
          )}
          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              className="input"
              placeholder="Share a note with your house"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              style={{ flex: "1 1 220px", minWidth: 0 }}
              disabled={!houseId}
            />
            <button
              className="btn small secondary"
              onClick={addNote}
              disabled={!houseId || saving || !draft.trim()}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                add
              </span>
              <span>{saving ? "Posting..." : "Post"}</span>
            </button>
          </div>
          <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              className="input"
              placeholder="Search notes"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ flex: "1 1 180px", minWidth: 0 }}
            />
            <label className="row" style={{ gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={pinnedOnly}
                onChange={e => setPinnedOnly(e.target.checked)}
              />
              <span className="small">Pinned only</span>
            </label>
          </div>
          {loading && <div className="small muted">Loading notes...</div>}
          {error && (
            <div className="small" style={{ color: "var(--md-sys-color-danger)" }}>
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="stack">
          {filteredNotes.length === 0 && (
            <div className="small muted">No notes yet.</div>
          )}
          {filteredNotes.map((note, idx) => {
            const author = authorLookup.get(note.authorId);
            const isLast = idx === filteredNotes.length - 1;
            return (
              <div
                key={note.id}
                className="card"
                style={{
                  padding: "10px 0",
                  borderBottom: isLast ? "none" : "1px solid var(--md-sys-color-outline)"
                }}
              >
                <div
                  className="row"
                  style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}
                >
                  <div className="stack" style={{ gap: 6, flex: "1 1 auto" }}>
                    <div className="row" style={{ gap: 8, alignItems: "center" }}>
                      <div className="avatar-mark" style={{ width: 32, height: 32 }}>
                        <img
                          src={author?.photo || "/avatars/avatar-happy.svg"}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </div>
                      <div className="stack" style={{ gap: 2 }}>
                        <div className="small">{author?.name || "Unknown"}</div>
                        <div className="small muted">
                          {note.createdAt ? new Date(note.createdAt).toLocaleString() : ""}
                        </div>
                      </div>
                      {note.pinned && <span className="pill">Pinned</span>}
                    </div>
                    <div className="small">{note.text}</div>
                  </div>
                  <div className="stack" style={{ gap: 6, minWidth: 96, alignItems: "flex-end" }}>
                    <button className="btn ghost small" onClick={() => togglePin(note.id, !note.pinned)}>
                      {note.pinned ? "Unpin" : "Pin"}
                    </button>
                    {author?.id === me?.id && (
                      <button className="btn ghost small" onClick={() => deleteNote(note.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
