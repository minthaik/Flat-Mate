import React, { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import { uid, nowIso, addDays, toDateInputValue, fromDateInputValue } from "../store/utils";

const AddChoreDialog = forwardRef(function AddChoreDialog({ me, houseUsers, actions }, ref) {
  const [open, setOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [cadenceDays, setCadenceDays] = useState(7);
  const [startAt, setStartAt] = useState(() => nowIso());
  const [dueDate, setDueDate] = useState(() => toDateInputValue(addDays(nowIso(), 1)));
  const [endAt, setEndAt] = useState(null);
  const [showEnd, setShowEnd] = useState(false);

  const [rotationIds, setRotationIds] = useState([]);

  const [checklist, setChecklist] = useState([
    { id: uid("item"), label: "", required: true, isDone: false }
  ]);

  useImperativeHandle(ref, () => ({
    open: () => {
      setTitle("");
      setNotes("");
      setCadenceDays(7);
      setStartAt(nowIso());
      setDueDate(toDateInputValue(addDays(nowIso(), 1)));
      setEndAt(null);
      setShowEnd(false);
      setRotationIds(me?.id ? [me.id] : []);
      setChecklist([{ id: uid("item"), label: "", required: true, isDone: false }]);
      setOpen(true);
    }
  }), [me?.id]);

  const hasRotation = rotationIds.length > 0;
  const canSave = title.trim().length > 0 && hasRotation && !!me?.houseId;

  const rotationOptions = useMemo(() => houseUsers || [], [houseUsers]);

  function toggleRotation(id) {
    setRotationIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      return [...prev, id];
    });
  }

  function updateItem(id, patch) {
    setChecklist(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
  }

  function addItem() {
    setChecklist(prev => [...prev, { id: uid("item"), label: "", required: false, isDone: false }]);
  }

  function removeItem(id) {
    setChecklist(prev => prev.filter(i => i.id !== id));
  }

  function save() {
    if (!canSave || !me?.houseId) return;

    const cleanChecklist = (checklist || [])
      .map(i => ({
        id: i.id || uid("item"),
        label: String(i.label || "").trim(),
        required: !!i.required,
        isDone: false
      }))
      .filter(i => i.label.length > 0);

    const rotation = rotationIds;
    const assigneeId = rotation[0] || null;

    const dueAtIso = fromDateInputValue(dueDate) || addDays(startAt, 1);

    const chore = {
      id: uid("chore"),
      houseId: me.houseId,
      title: title.trim(),
      notes: notes.trim(),
      createdAt: nowIso(),
      state: "ACTIVE",
      cadenceDays: Number(cadenceDays || 7),
      startAt,
      endAt: showEnd ? endAt : null,
      rotation,
      rotationIndex: 0,
      assigneeId,
      dueAt: dueAtIso,
      checklist: cleanChecklist
    };

    actions.addChore(chore);
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <div className="h2">Add chore</div>
          <button className="btn icon-only danger" onClick={() => setOpen(false)} aria-label="Close">
            <span className="material-symbols-outlined">cancel</span>
          </button>
        </div>

        <div className="stack">
          <div>
            <div className="small">Title</div>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <div>
            <div className="small">Notes</div>
            <textarea className="input" rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <div className="stack">
            <div className="small">Due date</div>
            <div className="row" style={{ flexWrap: "wrap", gap: "var(--space-2)" }}>
              <input
                className="input"
                type="date"
                style={{ minWidth: 160, flex: "1 1 160px" }}
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
              <div className="row" style={{ gap: "var(--space-2)", flexWrap: "wrap" }}>
                <button className="btn ghost small" onClick={() => setDueDate(toDateInputValue(nowIso()))}>Today</button>
                <button className="btn ghost small" onClick={() => setDueDate(toDateInputValue(addDays(nowIso(), 1)))}>Tomorrow</button>
                <button className="btn ghost small" onClick={() => setDueDate(toDateInputValue(addDays(nowIso(), 7)))}>Next week</button>
              </div>
            </div>
          </div>

          <div className="stack">
            <div className="small">Cadence</div>
            <div className="row" style={{ flexWrap: "wrap", gap: "var(--space-2)" }}>
              <input
                className="input"
                type="number"
                min={1}
                style={{ minWidth: 140, flex: "1 1 140px" }}
                value={cadenceDays}
                onChange={e => setCadenceDays(Number(e.target.value || 1))}
              />
              <div className="row" style={{ gap: "var(--space-2)", flexWrap: "wrap" }}>
                <button className="btn ghost small" onClick={() => setCadenceDays(1)}>Daily</button>
                <button className="btn ghost small" onClick={() => setCadenceDays(7)}>Weekly</button>
                <button className="btn ghost small" onClick={() => setCadenceDays(14)}>Every 2 weeks</button>
              </div>
            </div>
          </div>

          <div className="stack">
            <div className="small">Schedule window</div>
            <div className="row" style={{ flexWrap: "wrap", gap: "var(--space-2)" }}>
              <input
                className="input"
                type="date"
                style={{ minWidth: 160, flex: "1 1 160px" }}
                value={toDateInputValue(startAt)}
                onChange={e => setStartAt(fromDateInputValue(e.target.value) || nowIso())}
              />
              {showEnd && (
                <input
                  className="input"
                  type="date"
                  style={{ minWidth: 160, flex: "1 1 160px" }}
                  value={toDateInputValue(endAt)}
                  onChange={e => setEndAt(fromDateInputValue(e.target.value))}
                />
              )}
              <button className="btn ghost small" onClick={() => setShowEnd(s => !s)}>
                {showEnd ? "Hide end date" : "Set end date"}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="panel-title">Rotation</div>
            <div className="list">
              {rotationOptions.map(u => (
                <label key={u.id} className="check">
                  <input
                    type="checkbox"
                    checked={rotationIds.includes(u.id)}
                    onChange={() => toggleRotation(u.id)}
                  />
                  <div>
                    <div>{u.name}</div>
                    <div className="small">{u.email}</div>
                  </div>
                </label>
              ))}
            </div>
            {!hasRotation && <div className="small">Select at least one member.</div>}
          </div>

          <div className="card">
            <div className="panel-title">Checklist</div>
            <div className="list">
              {checklist.map(i => (
                <div key={i.id} className="row">
                  <input
                    className="input"
                    placeholder="Item label"
                    value={i.label}
                    onChange={e => updateItem(i.id, { label: e.target.value })}
                  />
                  <select
                    value={i.required ? "required" : "optional"}
                    onChange={e => updateItem(i.id, { required: e.target.value === "required" })}
                    style={{ width: 140 }}
                  >
                    <option value="required">Required</option>
                    <option value="optional">Optional</option>
                  </select>
                  <button className="btn danger" onClick={() => removeItem(i.id)}>Remove</button>
                </div>
              ))}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn ghost small" onClick={addItem}>
                <span className="material-symbols-outlined" aria-hidden="true">add</span>
                <span>Add checklist item</span>
              </button>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          {!me?.houseId && (
            <div className="small" style={{ marginRight: "auto" }}>
              You must create or join a house before adding chores.
            </div>
          )}
          <button className="btn danger" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn" disabled={!canSave} onClick={save}>Create</button>
        </div>
      </div>
    </div>
  );
});

export default AddChoreDialog;
