import React, { useMemo, useRef, useState } from "react";
import AddChoreDialog from "../dialogs/AddChoreDialog";
import ChoreDetailDialog from "../dialogs/ChoreDetailDialog";

function isOverdue(chore) {
  if (!chore?.dueAt || chore.state === "ENDED") return false;
  return new Date(chore.dueAt).getTime() < Date.now();
}

export default function ChoresView({ me, house, houseUsers, chores, actions }) {
  const [selectedId, setSelectedId] = useState(null);
  const addRef = useRef(null);
  const detailRef = useRef(null);
  const accentPalette = ["#1f8a5f", "#c28a00", "#3457d5", "#d84460", "#7a5ce0", "#2f6fdd", "#238aab"];

  const sorted = useMemo(() => {
    const copy = [...(chores || [])];
    copy.sort((a, b) => new Date(a.dueAt || 0) - new Date(b.dueAt || 0));
    return copy;
  }, [chores]);

  const priority = useMemo(() => {
    const targets = ["trash", "rest room cleaning", "restroom cleaning", "bathroom cleaning"];
    return sorted.filter(c => targets.includes(String(c.title || "").toLowerCase()));
  }, [sorted]);

  const others = useMemo(() => {
    const ids = new Set(priority.map(c => c.id));
    return sorted.filter(c => !ids.has(c.id));
  }, [sorted, priority]);

  const accentFor = (id) => {
    if (!id) return accentPalette[0];
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = (hash + id.charCodeAt(i) * 17) % 9973;
    }
    return accentPalette[hash % accentPalette.length];
  };

  const selected = sorted.find(c => c.id === selectedId) || null;

  return (
    <>
      <div className="topbar" style={{ marginBottom: 12 }}>
        <div>
          <span className="brand">Chores</span>
          {house?.name && <span className="badge">{house.name}</span>}
        </div>
        <div className="row">
          <button className="btn secondary small" onClick={() => addRef.current?.open()}>
            <span className="material-symbols-outlined" aria-hidden="true">add</span>
            <span>Add Chore</span>
          </button>
        </div>
      </div>

      {!house && (
        <div className="card">
          <div className="small">You must create or join a house first.</div>
        </div>
      )}

      <div className="stack">
        <div className="section-title">Assignments</div>
        <div className="panel">
          {priority.length > 0 && (
            <>
              <div className="small" style={{ marginBottom: 6 }}>Priority</div>
              <div className="list" style={{ marginBottom: 12 }}>
                {priority.map(chore => {
                  const assignee = houseUsers.find(u => u.id === chore.assigneeId);
                  return (
                    <div
                      key={chore.id}
                      className={`card ${selectedId === chore.id ? "selected" : ""}`}
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        setSelectedId(chore.id);
                        detailRef.current?.open(chore.id);
                      }}
                    >
                      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                        <div className="h2" style={{ margin: 0, color: accentFor(chore.id) }}>{chore.title}</div>
                        <span className={`pill ${chore.state === "ENDED" ? "end" : isOverdue(chore) ? "end" : "ok"}`}>
                          {chore.state === "ENDED" ? "ENDED" : isOverdue(chore) ? "OVERDUE" : "ACTIVE"}
                        </span>
                      </div>
                      <div className="kv" style={{ marginTop: 6 }}>
                        <span>Assignee</span>
                        <span>{assignee?.name || "Unassigned"}</span>
                      </div>
                      <div className="kv">
                        <span>Due</span>
                        <span>{chore.dueAt ? new Date(chore.dueAt).toLocaleDateString() : "-"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          <div className="list">
            {others.length === 0 && priority.length === 0 && (
              <div className="small">No chores yet.</div>
            )}
            {others.map(chore => {
              const assignee = houseUsers.find(u => u.id === chore.assigneeId);
              return (
                <div
                  key={chore.id}
                  className={`card ${selectedId === chore.id ? "selected" : ""}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    setSelectedId(chore.id);
                    detailRef.current?.open(chore.id);
                  }}
                >
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div className="h2" style={{ margin: 0, color: accentFor(chore.id) }}>{chore.title}</div>
                    <span className={`pill ${chore.state === "ENDED" ? "end" : isOverdue(chore) ? "end" : "ok"}`}>
                      {chore.state === "ENDED" ? "ENDED" : isOverdue(chore) ? "OVERDUE" : "ACTIVE"}
                    </span>
                  </div>
                  <div className="kv" style={{ marginTop: 6 }}>
                    <span>Assignee</span>
                    <span>{assignee?.name || "Unassigned"}</span>
                  </div>
                  <div className="kv">
                    <span>Due</span>
                    <span>{chore.dueAt ? new Date(chore.dueAt).toLocaleDateString() : "-"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="section-title">Plan</div>
        <div className="panel">
          {selected ? (
            <div className="card">
              <div className="h2" style={{ color: accentFor(selected.id) }}>{selected.title}</div>
              <div className="small">{selected.notes || "No notes."}</div>
              <div className="divider" />
              <div className="kv"><span>Cadence</span><span>{selected.cadenceDays} days</span></div>
              <div className="kv"><span>Start</span><span>{selected.startAt ? new Date(selected.startAt).toLocaleDateString() : "-"}</span></div>
              <div className="kv"><span>End</span><span>{selected.endAt ? new Date(selected.endAt).toLocaleDateString() : "-"}</span></div>
              <div className="divider" />
              <div className="panel-title">Rotation</div>
              <div className="list">
                {(selected.rotation || []).map((id, idx) => {
                  const u = houseUsers.find(x => x.id === id);
                  const isCurrent = idx === Number(selected.rotationIndex || 0);
                  return (
                    <div key={id} className="kv">
                      <span>{isCurrent ? "• " : ""}{u?.name || "Unknown"}</span>
                      <span className="pill">{isCurrent ? "current" : "next"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="small">Select a chore to see schedule and rotation.</div>
          )}
        </div>
      </div>

      <AddChoreDialog ref={addRef} me={me} houseUsers={houseUsers} actions={actions} />
      <ChoreDetailDialog ref={detailRef} me={me} houseUsers={houseUsers} chores={chores} actions={actions} />
    </>
  );
}
