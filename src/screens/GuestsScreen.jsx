import React, { useMemo, useState } from "react";
import { uid } from "../store/utils";

export default function GuestsScreen({ me, house, houseUsers = [], guests = [], actions, onBack }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");

  const sortedGuests = useMemo(() => {
    const list = [...(guests || [])];
    list.sort((a, b) => new Date(b.arrivesAt || 0) - new Date(a.arrivesAt || 0));
    return list;
  }, [guests]);

  function scheduleGuest() {
    if (!me?.houseId || !name.trim()) return;
    const datePart = date || new Date().toISOString().slice(0, 10);
    const timePart = time || "12:00";
    const arrivesAt = new Date(`${datePart}T${timePart}:00`).toISOString();
    actions.addGuest({
      id: uid("guest"),
      houseId: me.houseId,
      name: name.trim(),
      arrivesAt,
      note: note.trim(),
      hostId: me.id
    });
    setName("");
    setDate("");
    setTime("");
    setNote("");
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="section-title">Guests</div>
        {onBack && (
          <button className="btn ghost small" onClick={onBack}>
            <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
            <span>Back</span>
          </button>
        )}
      </div>

      <div className="panel">
        <div className="panel-title">Schedule guest</div>
        <div className="stack" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <input
              className="input"
              placeholder="Guest name"
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ flex: "1 1 200px", minWidth: 0 }}
            />
            <input
              className="input"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={{ flex: "1 1 140px" }}
            />
            <input
              className="input"
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              style={{ flex: "1 1 120px" }}
            />
          </div>
          <textarea
            className="input"
            rows={2}
            placeholder="Notes (optional)"
            value={note}
            onChange={e => setNote(e.target.value)}
          />
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn small" onClick={scheduleGuest} disabled={!name.trim()}>
              <span className="material-symbols-outlined" aria-hidden="true">add</span>
              <span>Schedule</span>
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Guest list</div>
        <div className="stack">
          {sortedGuests.length === 0 && <div className="small muted">No guests scheduled.</div>}
          {sortedGuests.map((g, idx) => {
            const host = houseUsers.find(u => u.id === g.hostId);
            const isLast = idx === sortedGuests.length - 1;
            return (
              <div
                key={g.id}
                className="card"
                style={{ padding: "10px 0", borderBottom: isLast ? "none" : "1px solid var(--md-sys-color-outline)" }}
              >
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div className="stack" style={{ gap: 4 }}>
                    <div className="h3" style={{ margin: 0 }}>{g.name}</div>
                    <div className="small muted">
                      {g.arrivesAt ? new Date(g.arrivesAt).toLocaleString() : "No time set"} · Host: {host?.name || "Unknown"}
                    </div>
                    {g.note && <div className="small muted">{g.note}</div>}
                  </div>
                  <button className="btn ghost small" onClick={() => actions.addGuest({ ...g, id: g.id })} disabled>
                    Scheduled
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
