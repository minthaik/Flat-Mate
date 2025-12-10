import React, { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import { uid, nowIso, addDays, toDateInputValue, fromDateInputValue } from "../store/utils";

const AddChoreDialog = forwardRef(function AddChoreDialog({ me, houseUsers, actions }, ref) {
  const [open, setOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [cadenceDays, setCadenceDays] = useState(7);
  const [startAt, setStartAt] = useState(() => nowIso());
  const [endAt, setEndAt] = useState(null);

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
      setEndAt(null);
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

    const chore = {
      id: uid("chore"),
      houseId: me.houseId,
      title: title.trim(),
      notes: notes.trim(),
      createdAt: nowIso(),
      state: "ACTIVE",
      cadenceDays: Number(cadenceDays || 7),
      startAt,
      endAt,
      rotation,
      rotationIndex: 0,
      assigneeId,
      dueAt: addDays(startAt, 1),
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
          <button className="btn secondary" onClick={() => setOpen(false)}>Close</button>
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

          <div className="row">
            <div style={{ flex: 1 }}>
              <div className="small">Cadence (days)</div>
              <input
                className="input"
                type="number"
                min={1}
                value={cadenceDays}
                onChange={e => setCadenceDays(Number(e.target.value || 1))}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div className="small">Start date</div>
              <input
                className="input"
                type="date"
                value={toDateInputValue(startAt)}
                onChange={e => setStartAt(fromDateInputValue(e.target.value) || nowIso())}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div className="small">End date (optional)</div>
              <input
                className="input"
                type="date"
                value={toDateInputValue(endAt)}
                onChange={e => setEndAt(fromDateInputValue(e.target.value))}
              />
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
              <button className="btn ghost" onClick={addItem}>Add checklist item</button>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          {!me?.houseId && (
            <div className="small" style={{ marginRight: "auto" }}>
              You must create or join a house before adding chores.
            </div>
          )}
          <button className="btn secondary" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn" disabled={!canSave} onClick={save}>Create</button>
        </div>
      </div>
    </div>
  );
});

export default AddChoreDialog;
