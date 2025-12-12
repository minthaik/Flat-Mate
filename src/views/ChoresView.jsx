import React, { useMemo, useRef, useState } from "react";
import AddChoreDialog from "../dialogs/AddChoreDialog";
import ChoreDetailDialog from "../dialogs/ChoreDetailDialog";

function isOverdue(chore) {
  if (!chore?.dueAt || chore.state === "ENDED") return false;
  return new Date(chore.dueAt).getTime() < Date.now();
}

function dueMeta(chore) {
  if (!chore?.dueAt) return { label: "No due date", tone: "ok" };
  const now = Date.now();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const endOfTomorrow = new Date(endOfToday.getTime() + 24 * 60 * 60 * 1000);
  const ts = new Date(chore.dueAt).getTime();
  if (Number.isNaN(ts)) return { label: "No due date", tone: "ok" };
  if (chore.state === "ENDED") return { label: "Ended", tone: "end" };
  if (ts < now) return { label: "Overdue", tone: "end" };
  if (ts <= endOfToday.getTime()) return { label: "Due today", tone: "end" };
  if (ts <= endOfTomorrow.getTime()) return { label: "Due tomorrow", tone: "ok" };
  return { label: new Date(chore.dueAt).toLocaleDateString(), tone: "ok" };
}

export default function ChoresView({ me, house, houseUsers, chores, actions }) {
  const [selectedId, setSelectedId] = useState(null);
  const addRef = useRef(null);
  const detailRef = useRef(null);
  const isAdmin = !!(me && house && house.adminId === me.id);
  const accentPalette = ["#d97706", "#db2777", "#2563eb", "#059669", "#a855f7", "#f97316", "#14b8a6"];
  const dayPalette = ["#0b8a3b", "#1f5da8", "#c7541f", "#7a5af8", "#e3a008", "#14b8a6", "#ef4444"];
  const weekStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const sorted = useMemo(() => {
    const copy = [...(chores || [])];
    copy.sort((a, b) => new Date(a.dueAt || 0) - new Date(b.dueAt || 0));
    return copy;
  }, [chores]);

  const myChores = useMemo(() => sorted.filter(c => c.assigneeId === me?.id), [sorted, me?.id]);
  const othersChores = useMemo(() => sorted.filter(c => c.assigneeId !== me?.id), [sorted, me?.id]);

  const others = sorted;

  const accentFor = (id) => {
    if (!id) return accentPalette[0];
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = (hash + id.charCodeAt(i) * 17) % 9973;
    }
    return accentPalette[hash % accentPalette.length];
  };

  const selected = sorted.find(c => c.id === selectedId) || null;
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + idx);
      return d;
    });
  }, [weekStart]);

  const choresByDay = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(weekStart.getDate() + 7);
    const withinWeek = sorted.filter(c => c.dueAt && new Date(c.dueAt) >= weekStart && new Date(c.dueAt) < end);
    const map = {};
    weekDays.forEach((day, idx) => {
      const dayStr = day.toISOString().slice(0, 10);
      map[dayStr] = withinWeek.filter(c => {
        const d = new Date(c.dueAt);
        return d.getFullYear() === day.getFullYear() &&
          d.getMonth() === day.getMonth() &&
          d.getDate() === day.getDate();
      });
    });
    return map;
  }, [sorted, weekStart, weekDays]);

  return (
    <>
      {isAdmin && (
        <div className="topbar" style={{ marginBottom: 12 }}>
          <div>
            <span className="brand">Chores</span>
            {house?.name && <span className="badge">{house.name}</span>}
          </div>
          <div className="row">
            <button className="btn secondary small" onClick={() => addRef.current?.openNew()}>
              <span className="material-symbols-outlined" aria-hidden="true">add</span>
              <span>Add Chore</span>
            </button>
          </div>
        </div>
      )}

      {!house && (
        <div className="card">
          <div className="small">You must create or join a house first.</div>
        </div>
      )}

      <div className="stack">
        <div className="section-title">My chores</div>
        <div className="panel">
          <div className="list">
            {myChores.length === 0 && <div className="small">Nothing assigned to you yet.</div>}
            {myChores.map(chore => {
              const assignee = houseUsers.find(u => u.id === chore.assigneeId);
              const due = dueMeta(chore);
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
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div className="h2" style={{ margin: 0, color: accentFor(chore.id) }}>{chore.title}</div>
                      <div className="row" style={{ gap: 6 }}>
                        <span className={`pill ${due.tone === "end" ? "end" : "ok"}`}>{due.label}</span>
                      </div>
                    </div>
                  <div className="kv" style={{ marginTop: 6 }}>
                    <span>Assignee</span>
                    <span>{assignee?.name || "Unassigned"}</span>
                  </div>
                  <div className="kv">
                    <span>State</span>
                    <span className="pill ok">{chore.state === "ENDED" ? "Ended" : "Active"}</span>
                  </div>
                  <div className="row" style={{ justifyContent: "flex-end", marginTop: "var(--space-3)" }}>
                    <button
                      className="btn small"
                      disabled={chore.state === "ENDED"}
                      onClick={e => {
                        e.stopPropagation();
                        actions.completeChore(chore.id, me?.id);
                      }}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">check</span>
                      <span>Mark done</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="section-title">All chores</div>
        <div className="panel">
          <div className="stack" style={{ gap: "var(--space-3)" }}>
            <div>
              <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>This week</div>
              <div className="week-grid">
                {weekDays.map((day, idx) => {
                  const key = day.toISOString().slice(0, 10);
                  const items = choresByDay[key] || [];
                  const label = day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
                  const dayAccent = dayPalette[idx % dayPalette.length];
                  const colStyle = {
                    borderColor: `${dayAccent}33`,
                    background: `linear-gradient(180deg, ${dayAccent}12, transparent 55%)`
                  };
                  return (
                    <div key={key} className="week-col" style={colStyle}>
                      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, gap: 8 }}>
                        <div className="small" style={{ fontWeight: 700, color: dayAccent }}>{label}</div>
                        {idx === 0 && <span className="pill ok" style={{ fontSize: 11 }}>Today</span>}
                      </div>
                      {items.length === 0 ? (
                        <div className="small muted">No chores</div>
                      ) : (
                        <div className="stack" style={{ gap: 8 }}>
                          {items.map(c => {
                            const assignee = houseUsers.find(u => u.id === c.assigneeId);
                            const timeStr = c.dueAt ? new Date(c.dueAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
                            return (
                              <div key={c.id} className="week-item" style={{ borderColor: dayAccent }}>
                                <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                                  <div className="small" style={{ fontWeight: 700, color: dayAccent }}>{c.title}</div>
                                </div>
                                <div className="tiny">{assignee?.name || "Unassigned"}</div>
                                {timeStr && <div className="tiny muted">{timeStr}</div>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <AddChoreDialog ref={addRef} me={me} houseUsers={houseUsers} actions={actions} allowManage={isAdmin} />
      <ChoreDetailDialog
        ref={detailRef}
        me={me}
        houseUsers={houseUsers}
        chores={chores}
        actions={actions}
        houseAdminId={house?.adminId}
        onEdit={(chore) => addRef.current?.openEdit(chore)}
      />
    </>
  );
}
