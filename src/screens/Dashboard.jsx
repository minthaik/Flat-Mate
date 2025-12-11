import React, { useEffect, useMemo, useState } from "react";
import ChoresView from "../views/ChoresView";
import { uid, fromDateInputValue, toDateInputValue } from "../store/utils";
import ProfileScreen from "./ProfileScreen";
import TodosScreen from "./TodosScreen";

export default function Dashboard({ me, house, houseUsers, houseChores, houseGuests, todoLists, actions }) {
  const [tab, setTab] = useState("HOME");
  const [guestName, setGuestName] = useState("");
  const [guestDate, setGuestDate] = useState("");
  const [guestTime, setGuestTime] = useState("");
  const [guestNote, setGuestNote] = useState("");
  const [guestModalOpen, setGuestModalOpen] = useState(false);
  const [dndDate, setDndDate] = useState("");
  const [dndTime, setDndTime] = useState("");
  const [dndModalOpen, setDndModalOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusNote, setStatusNote] = useState("");
  const [pendingStatus, setPendingStatus] = useState(null);
  const [nowTs, setNowTs] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => actions.checkDndExpiry(), 60000);
    return () => clearInterval(id);
  }, [actions]);

  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (me?.status === "DND" && me?.dndUntil) {
      const until = new Date(me.dndUntil);
      setDndDate(toDateInputValue(me.dndUntil));
      setDndTime(until.toISOString().slice(11, 16));
    } else {
      const fallback = new Date(Date.now() + 2 * 60 * 60 * 1000);
      setDndDate(toDateInputValue(fallback.toISOString()));
      setDndTime(fallback.toISOString().slice(11, 16));
    }
  }, [me?.dndUntil, me?.status]);

  const myStatus = me?.status || "HOME";
  const myDndLeft = myStatus === "DND" ? remainingDnd(me) : null;
  const statusOptions = ["HOME", "AWAY", "OUT", "DND"];
  const statusMeta = {
    HOME: { icon: "home", className: "home" },
    AWAY: { icon: "flight_takeoff", className: "away" },
    OUT: { icon: "directions_walk", className: "out" },
    DND: { icon: "do_not_disturb_on", className: "dnd" }
  };

  const upcomingGuests = useMemo(() => {
    const list = [...(houseGuests || [])];
    list.sort((a, b) => new Date(a.arrivesAt || 0) - new Date(b.arrivesAt || 0));
    return list;
  }, [houseGuests]);

  useEffect(() => {
    setStatusNote(me?.statusNote || "");
  }, [me?.statusNote]);

  function saveStatus(status, note = statusNote) {
    if (!me) return;
    if (status === "DND") {
      const datePart = dndDate || toDateInputValue(new Date().toISOString());
      const timePart = dndTime || "12:00";
      const untilIso = new Date(`${datePart}T${timePart}:00`).toISOString();
      actions.setStatus(me.id, status, untilIso, note);
      setDndModalOpen(false);
      setStatusModalOpen(false);
      setPendingStatus(null);
    } else {
      actions.setStatus(me.id, status, null, note);
      setStatusModalOpen(false);
      setPendingStatus(null);
    }
  }

  function addGuest() {
    if (!me?.houseId || !guestName.trim()) return;
    const datePart = guestDate || toDateInputValue(new Date().toISOString());
    const timePart = guestTime || "12:00";
    const iso = new Date(`${datePart}T${timePart}:00`).toISOString();
    const guest = {
      id: uid("guest"),
      houseId: me.houseId,
      name: guestName.trim(),
      arrivesAt: iso,
      note: guestNote.trim(),
      hostId: me.id
    };
    actions.addGuest(guest);
    setGuestName("");
    setGuestDate("");
    setGuestTime("");
    setGuestNote("");
    setGuestModalOpen(false);
  }

  const canAddGuest = guestName.trim().length > 0;

  const choreOverview = useMemo(() => {
    const copy = [...(houseChores || [])];
    copy.sort((a, b) => new Date(a.dueAt || 0) - new Date(b.dueAt || 0));
    return copy.slice(0, 3);
  }, [houseChores]);

  function remainingDnd(u) {
    if (!u || u.status !== "DND" || !u.dndUntil) return null;
    const diff = new Date(u.dndUntil).getTime() - nowTs;
    if (diff <= 0) return "0m left";
    const mins = Math.max(1, Math.round(diff / 60000));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0) return `${h}h ${m}m left`;
    return `${m}m left`;
  }

  return (
    <>
      {tab === "HOME" && (
        <>
          <div className="section-title">My status</div>
          <div className="panel">
            <div className="stack">
              <div className="card">
                <div className="status-row">
                  {statusOptions.map(opt => {
                    const meta = statusMeta[opt] || {};
                    return (
                      <button
                        key={opt}
                        className={`btn status-btn ${meta.className || ""} ${myStatus === opt ? "active" : ""}`}
                        onClick={() => {
                          if (opt === "DND") {
                            setStatusNote(me?.statusNote || "");
                            setDndModalOpen(true);
                          } else {
                            setPendingStatus(opt);
                            setStatusNote(me?.statusNote || "");
                            setStatusModalOpen(true);
                          }
                        }}
                      >
                        <span className="material-symbols-outlined status-icon">
                          {meta.icon || "radio_button_unchecked"}
                        </span>
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>
                {myStatus === "DND" && (
                  <div className="stack">
                    <div className="small">
                      Do not disturb until {me?.dndUntil ? new Date(me.dndUntil).toLocaleString() : "unset"}
                    </div>
                    {myDndLeft && (
                      <div className="small emphasis">
                        <span className="countdown">{myDndLeft}</span> remaining
                      </div>
                    )}
                    <button className="btn secondary" onClick={() => setDndModalOpen(true)}>
                      Set DND time
                    </button>
                    <div className="small">Guests during this window are blocked.</div>
                  </div>
                )}
                <div className="small">Let roommates know if you are home, away, or not to be disturbed.</div>
              </div>
            </div>
          </div>

          <div className="section-title">Members Status</div>
          <div className="panel">
            {house ? (
              <div className="stack">
                {houseUsers.map((u, idx) => {
                  const isLast = idx === houseUsers.length - 1;
                  return (
                    <React.Fragment key={u.id}>
                      <div className="card">
                        <div className="kv">
                          <span className="h2" style={{ margin: 0 }}>{u.name}</span>
                          <span
                            className={`pill ${
                              u.status === "DND"
                                ? "dnd"
                                : u.status === "AWAY"
                                ? "away"
                                : u.status === "OUT"
                                ? "out"
                                : "home"
                            }`}
                          >
                            {u.status === "DND" ? "DND" : (u.status || "HOME")}
                          </span>
                        </div>
                        <div className="small">{u.statusNote || "No status message set"}</div>
                        {u.status === "DND" && u.dndUntil && (
                          <div className="small emphasis">
                            Ends {new Date(u.dndUntil).toLocaleTimeString()} &rarr; <span className="countdown">{remainingDnd(u)}</span>
                          </div>
                        )}
                      </div>
                      {!isLast && <div className="divider" />}
                    </React.Fragment>
                  );
                })}
              </div>
            ) : (
              <div className="small">No members found.</div>
            )}
          </div>

          <div className="section-title">Guest status</div>
          <div className="panel">
            <div className="stack">
              <div className="card">
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <div className="panel-title" style={{ margin: 0, paddingBottom: 0, borderBottom: "none" }}>Upcoming guests</div>
                  <button className="btn secondary small" onClick={() => setGuestModalOpen(true)}>
                    <span className="material-symbols-outlined" aria-hidden="true">add</span>
                    <span>Schedule Guest</span>
                  </button>
                </div>
                <div className="divider" style={{ marginTop: "var(--space-3)", marginBottom: "var(--space-3)" }} />
                <div className="list" style={{ marginTop: "var(--space-5)" }}>
                  {upcomingGuests.length === 0 && <div className="small">No guests scheduled.</div>}
                  {upcomingGuests.map(g => {
                    const host = houseUsers.find(u => u.id === g.hostId);
                    return (
                      <div key={g.id} className="kv" style={{ alignItems: "flex-start" }}>
                        <div className="stack" style={{ gap: "4px" }}>
                          <span className="h3">{g.name}</span>
                          <span className="small">{new Date(g.arrivesAt).toLocaleString()}</span>
                        </div>
                        <span className="small">Host: {host?.name || "Unknown"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="section-title">Chore overview</div>
          <div className="panel">
            <div className="stack">
              {choreOverview.length === 0 && <div className="small">No chores yet.</div>}
              {choreOverview.map(chore => {
                const assignee = houseUsers.find(u => u.id === chore.assigneeId);
                return (
                  <div key={chore.id} className="card">
                    <div className="kv">
                      <span className="h2" style={{ margin: 0 }}>{chore.title}</span>
                      <span className="pill">{assignee?.name || "Unassigned"}</span>
                    </div>
                    <div className="small">Due {chore.dueAt ? new Date(chore.dueAt).toLocaleDateString() : "-"}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {tab === "CHORES" && (
        <ChoresView
          me={me}
          house={house}
          houseUsers={houseUsers}
          chores={houseChores}
          actions={actions}
        />
      )}

      {tab === "PROFILE" && (
        <ProfileScreen
          me={me}
          house={house}
          houseUsers={houseUsers}
          actions={{
            updateProfile: actions.updateProfile,
            leaveHouse: actions.leaveHouse,
            transferAdmin: actions.transferAdmin,
            regenerateInvite: actions.regenerateInvite,
            renameHouse: actions.renameHouse
          }}
        />
      )}

      {tab === "TODOS" && (
        <TodosScreen
          me={me}
          houseUsers={houseUsers}
          todoLists={todoLists}
          actions={{
            addTodoList: actions.addTodoList,
            updateTodoList: actions.updateTodoList,
            deleteTodoList: actions.deleteTodoList,
            addTodoItem: actions.addTodoItem,
            toggleTodoItem: actions.toggleTodoItem,
            deleteTodoItem: actions.deleteTodoItem
          }}
        />
      )}

      <div className="footer-nav">
        <button className={`nav-btn ${tab === "HOME" ? "active" : ""}`} onClick={() => setTab("HOME")}>
          <span className="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
            </svg>
          </span>
          <span className="nav-label">Home</span>
        </button>
        <button className={`nav-btn ${tab === "CHORES" ? "active" : ""}`} onClick={() => setTab("CHORES")}>
          <span className="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M3 7h2v2H3V7Zm0 4h2v2H3v-2Zm0 4h2v2H3v-2ZM7 7h14v2H7V7Zm0 4h14v2H7v-2Zm0 4h14v2H7v-2Z" />
            </svg>
          </span>
          <span className="nav-label">Chores</span>
        </button>
        <button className={`nav-btn ${tab === "TODOS" ? "active" : ""}`} onClick={() => setTab("TODOS")}>
          <span className="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M19 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2ZM9 17H7v-2h2v2Zm0-4H7v-2h2v2Zm0-4H7V7h2v2Zm8 8h-6v-2h6v2Zm0-4h-6v-2h6v2Zm0-4h-6V7h6v2Z" />
            </svg>
          </span>
          <span className="nav-label">To-Dos</span>
        </button>
        <button className={`nav-btn ${tab === "PROFILE" ? "active" : ""}`} onClick={() => setTab("PROFILE")}>
          <span className="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 12c2.7 0 4.9-2.2 4.9-4.9S14.7 2.2 12 2.2 7.1 4.4 7.1 7.1 9.3 12 12 12Zm0 2.4c-3.3 0-7.8 1.7-7.8 4.9V22h15.6v-2.7c0-3.2-4.5-4.9-7.8-4.9Z" />
            </svg>
          </span>
          <span className="nav-label">Profile</span>
        </button>
      </div>

      {guestModalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <div className="h2">Schedule guest</div>
              <button className="btn icon-only danger" onClick={() => setGuestModalOpen(false)} aria-label="Close">
                <span className="material-symbols-outlined">cancel</span>
              </button>
            </div>
            <div className="stack">
              <input
                className="input"
                placeholder="Guest name"
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
              />
              <div className="stack">
                <div>
                  <div className="small">Date</div>
                  <input
                    className="input"
                    type="date"
                    value={guestDate}
                    onChange={e => setGuestDate(e.target.value)}
                  />
                </div>
                <div>
                  <div className="small">Time</div>
                  <input
                    className="input"
                    type="time"
                    value={guestTime}
                    onChange={e => setGuestTime(e.target.value)}
                  />
                </div>
              </div>
              <input
                className="input"
                placeholder="Note (optional)"
                value={guestNote}
                onChange={e => setGuestNote(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button className="btn secondary" onClick={() => setGuestModalOpen(false)}>Cancel</button>
              <button className="btn" onClick={addGuest} disabled={!canAddGuest}>Save</button>
            </div>
          </div>
        </div>
      )}

      {dndModalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <div className="h2">Set DND until</div>
              <button className="btn icon-only danger" onClick={() => setDndModalOpen(false)} aria-label="Close">
                <span className="material-symbols-outlined">cancel</span>
              </button>
            </div>
            <div className="stack">
              <div className="stack">
                <div>
                  <div className="small">Date</div>
                  <input
                    className="input"
                    type="date"
                    value={dndDate}
                    onChange={e => setDndDate(e.target.value)}
                  />
                </div>
                <div>
                  <div className="small">Time</div>
                  <input
                    className="input"
                    type="time"
                    value={dndTime}
                    onChange={e => setDndTime(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <div className="small">What are you doing? (optional)</div>
                <input
                  className="input"
                  placeholder="Let roommates know your plan"
                  value={statusNote}
                  onChange={e => setStatusNote(e.target.value)}
                />
              </div>
              <div className="small">During DND, guests cannot be scheduled for you.</div>
            </div>
            <div className="modal-actions">
              <button className="btn secondary" onClick={() => setDndModalOpen(false)}>Cancel</button>
              <button className="btn" onClick={() => saveStatus("DND", statusNote)}>Save</button>
            </div>
          </div>
        </div>
      )}

      {statusModalOpen && pendingStatus && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <div className="h2">Set status</div>
              <button
                className="btn icon-only danger"
                onClick={() => { setStatusModalOpen(false); setPendingStatus(null); }}
                aria-label="Close"
              >
                <span className="material-symbols-outlined">cancel</span>
              </button>
            </div>
            <div className="stack">
              <div className="small">What are you doing? (optional)</div>
              <input
                className="input"
                placeholder="Let roommates know your plan"
                value={statusNote}
                onChange={e => setStatusNote(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button className="btn secondary" onClick={() => { setStatusModalOpen(false); setPendingStatus(null); }}>Cancel</button>
              <button className="btn" onClick={() => saveStatus(pendingStatus, statusNote)}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}





