import React, { useEffect, useMemo, useRef, useState } from "react";
import ChoresView from "../views/ChoresView";
import { uid, fromDateInputValue, toDateInputValue } from "../store/utils";
import ProfileScreen from "./ProfileScreen";
import TodosScreen from "./TodosScreen";
import SupportScreen from "./SupportScreen";
import RoommatesScreen from "./RoommatesScreen";
import FinanceScreen from "./FinanceScreen";
import CommunityScreen from "./CommunityScreen";
import GuestsScreen from "./GuestsScreen";

const AVATAR_PRESETS = [
  { id: "happy", src: "/avatars/avatar-happy.svg", accent: "#7ea0ff" },
  { id: "cool", src: "/avatars/avatar-cool.svg", accent: "#31c48d" },
  { id: "cat", src: "/avatars/avatar-cat.svg", accent: "#f5c44f" },
  { id: "dog", src: "/avatars/avatar-dog.svg", accent: "#ff7b7b" }
];

function OverviewCard({ title, actionLabel, onAction, children, panelStyle }) {
  return (
    <div className="panel" style={{ height: "100%", ...(panelStyle || {}) }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div className="panel-title" style={{ margin: 0 }}>{title}</div>
        {onAction && (
          <button className="btn ghost small" onClick={onAction}>
            <span>{actionLabel || "View all"}</span>
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export default function Dashboard({
  me,
  house,
  houseUsers,
  houseChores,
  houseGuests,
  todoLists,
  houseExpenses = [],
  actions
}) {
  const [dndDate, setDndDate] = useState("");
  const [dndTime, setDndTime] = useState("");
  const [dndModalOpen, setDndModalOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusNote, setStatusNote] = useState("");
  const [pendingStatus, setPendingStatus] = useState(null);
  const [nowTs, setNowTs] = useState(Date.now());
  const [isMoreOpen, setMoreOpen] = useState(false);
  const [tab, setTab] = useState(() => {
    if (typeof window === "undefined") return "HOME";
    const stored = localStorage.getItem("dashboard_tab");
    return stored || "HOME";
  });
  const remoteSyncKey = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("dashboard_tab", tab);
  }, [tab]);

  useEffect(() => {
    const id = setInterval(() => actions.checkDndExpiry(), 60000);
    return () => clearInterval(id);
  }, [actions]);

  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function handleEsc(e) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
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
  const avatarPresetSrc = (() => {
    if (me?.photo) return me.photo;
    const preset = AVATAR_PRESETS.find(p => p.id === me?.avatarPreset) || AVATAR_PRESETS[0];
    return preset?.src || "/avatars/avatar-happy.svg";
  })();

  const upcomingGuests = useMemo(() => {
    const list = [...(houseGuests || [])];
    list.sort((a, b) => new Date(a.arrivesAt || 0) - new Date(b.arrivesAt || 0));
    return list;
  }, [houseGuests]);
  const houseCurrency = (house?.currency || "USD").toUpperCase();
  const currencySymbols = { USD: "$", EUR: "EUR ", GBP: "GBP ", AUD: "AUD ", CAD: "CAD ", JPY: "JPY " };
  const currencySymbol = currencySymbols[houseCurrency] || `${houseCurrency} `;
  const fmtCurrency = (amt) => `${currencySymbol}${Number(amt || 0).toFixed(2)}`;

  useEffect(() => {
    setStatusNote(me?.statusNote || "");
  }, [me?.statusNote]);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    if (!token || !actions?.syncRemoteHouses) return;
    const key = `${token}:${house?.id || "none"}`;
    if (remoteSyncKey.current === key) return;
    remoteSyncKey.current = key;
    let aborted = false;
    fetch("/api/wp-houses", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async resp => {
        const data = await resp.json().catch(() => []);
        if (aborted || !resp.ok || !Array.isArray(data)) return;
        actions.syncRemoteHouses(data);
      })
      .catch(() => {});
    return () => {
      aborted = true;
    };
  }, [actions?.syncRemoteHouses, house?.id]);

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

  const choreOverview = useMemo(() => {
    const copy = [...(houseChores || [])];
    copy.sort((a, b) => new Date(a.dueAt || 0) - new Date(b.dueAt || 0));
    return copy.slice(0, 3);
  }, [houseChores]);

  const recentExpenses = useMemo(() => {
    const list = [...(houseExpenses || [])];
    list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return list.slice(0, 3);
  }, [houseExpenses]);

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
        <div className="stack" style={{ gap: 16 }}>
          <div className="section-title">Overview</div>

          <OverviewCard
            title="My status"
            panelStyle={{ background: "linear-gradient(135deg, #e6f4ec 0%, #f2fbf6 100%)", border: "1px solid rgba(11,138,59,0.18)" }}
          >
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
          </OverviewCard>

          <div
            className="grid two"
            style={{ gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}
          >
            <OverviewCard
              title="Members"
              actionLabel="View status"
              onAction={() => setTab("ROOMMATES")}
              panelStyle={{ background: "linear-gradient(135deg, #e8f1fb 0%, #f5f8fd 100%)", border: "1px solid rgba(31,93,168,0.18)" }}
            >
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
            </OverviewCard>

            <OverviewCard
              title="Chores"
              actionLabel="View all"
              onAction={() => setTab("CHORES")}
              panelStyle={{ background: "linear-gradient(135deg, #fff2eb 0%, #fff8f3 100%)", border: "1px solid rgba(199,84,31,0.16)" }}
            >
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
            </OverviewCard>

            <OverviewCard
              title="Upcoming guests"
              actionLabel="Open"
              onAction={() => setTab("GUESTS")}
              panelStyle={{ background: "linear-gradient(135deg, #f3ecff 0%, #faf7ff 100%)", border: "1px solid rgba(143,91,232,0.16)" }}
            >
              <div className="stack">
                {upcomingGuests.length === 0 && <div className="small">No guests scheduled.</div>}
                {upcomingGuests.slice(0, 3).map(g => {
                  const host = houseUsers.find(u => u.id === g.hostId);
                  return (
                    <div key={g.id} className="card">
                      <div className="kv" style={{ alignItems: "flex-start" }}>
                        <div className="stack" style={{ gap: "4px" }}>
                          <span className="h3">{g.name}</span>
                          <span className="small">{new Date(g.arrivesAt).toLocaleString()}</span>
                        </div>
                        <span className="small">Host: {host?.name || "Unknown"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </OverviewCard>

            <OverviewCard
              title="Community"
              actionLabel="View feed"
              onAction={() => setTab("COMMUNITY")}
              panelStyle={{ background: "linear-gradient(135deg, #ecf5ff 0%, #f6fffb 100%)", border: "1px solid rgba(15,102,191,0.16)" }}
            >
              <div className="stack" style={{ gap: 8 }}>
                <div className="small">
                  Share updates with a photo or start a conversation. Head to the Community feed to post.
                </div>
                <button className="btn secondary small" onClick={() => setTab("COMMUNITY")}>
                  Open community feed
                </button>
              </div>
            </OverviewCard>

            <OverviewCard
              title="Finance"
              actionLabel="Open"
              onAction={() => setTab("FINANCE")}
              panelStyle={{ background: "linear-gradient(135deg, #e9f6ec 0%, #eef4ff 100%)", border: "1px solid rgba(11,138,59,0.16)" }}
            >
              <div className="stack">
                {recentExpenses.length === 0 && <div className="small muted">No expenses yet.</div>}
                {recentExpenses.map(exp => {
                  const payer = houseUsers.find(u => u.id === exp.payerId);
                  return (
                    <div key={exp.id} className="card">
                      <div className="kv">
                        <span className="h3" style={{ margin: 0 }}>{exp.title}</span>
                        <span className="pill">{exp.type === "shared" ? "Shared" : "Personal"}</span>
                      </div>
                      <div className="small muted" style={{ color: "#f1f5f9" }}>
                        {exp.category} � {fmtCurrency(exp.amount)} � {payer?.name || "Unknown"} on {new Date(exp.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </OverviewCard>
          </div>
        </div>
      )}

      {tab === "CHORES" && (
        <ChoresView
          me={me}
          house={house}
          houseUsers={houseUsers}
          chores={houseChores}
          actions={actions}
          onBack={() => setTab("HOME")}
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
            renameHouse: actions.renameHouse,
            setHouseCurrency: actions.setHouseCurrency,
            onBack: () => setTab("HOME")
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
          onBack={() => setTab("HOME")}
        />
      )}
      {tab === "FINANCE" && (
        <FinanceScreen
          me={me}
          house={house}
          houseUsers={houseUsers}
          expenses={houseExpenses}
          actions={{
            addExpense: actions.addExpense,
            deleteExpense: actions.deleteExpense
          }}
          onBack={() => setTab("HOME")}
        />
      )}

      {tab === "COMMUNITY" && (
        <CommunityScreen
          me={me}
          house={house}
          houseUsers={houseUsers}
          onBack={() => setTab("HOME")}
        />
      )}
      {tab === "ROOMMATES" && (
        <RoommatesScreen
          me={me}
          house={house}
          houseUsers={houseUsers}
          onBack={() => setTab("HOME")}
        />
      )}
      {tab === "GUESTS" && (
        <GuestsScreen
          me={me}
          house={house}
          houseUsers={houseUsers}
          guests={houseGuests}
          actions={{ addGuest: actions.addGuest }}
          onBack={() => setTab("HOME")}
        />
      )}
      {tab === "SUPPORT" && (
        <SupportScreen
          me={me}
          house={house}
          onBack={() => setTab("HOME")}
        />
      )}

      <nav className="footer-nav" aria-label="Primary">
        <ul className="nav-shell">
          <li>
            <a
              href="#home"
              className={`nav-btn ${tab === "HOME" ? "active" : ""}`}
              onClick={(e) => { e.preventDefault(); setTab("HOME"); }}
              aria-current={tab === "HOME" ? "page" : undefined}
            >
              <span className="nav-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                </svg>
              </span>
              <span className="nav-label">Home</span>
            </a>
          </li>
          <li>
            <a
              href="#chores"
              className={`nav-btn ${tab === "CHORES" ? "active" : ""}`}
              onClick={(e) => { e.preventDefault(); setTab("CHORES"); }}
              aria-current={tab === "CHORES" ? "page" : undefined}
            >
              <span className="nav-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M3 7h2v2H3V7Zm0 4h2v2H3v-2Zm0 4h2v2H3v-2ZM7 7h14v2H7V7Zm0 4h14v2H7v-2Zm0 4h14v2H7v-2Z" />
                </svg>
              </span>
              <span className="nav-label">Chores</span>
            </a>
          </li>
          <li>
            <a
              href="#todos"
              className={`nav-btn ${tab === "TODOS" ? "active" : ""}`}
              onClick={(e) => { e.preventDefault(); setTab("TODOS"); }}
              aria-current={tab === "TODOS" ? "page" : undefined}
            >
              <span className="nav-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M19 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2ZM9 17H7v-2h2v2Zm0-4H7v-2h2v2Zm0-4H7V7h2v2Zm8 8h-6v-2h6v2Zm0-4h-6v-2h6v2Zm0-4h-6V7h6v2Z" />
                </svg>
              </span>
              <span className="nav-label">To-Dos</span>
            </a>
          </li>
          <li>
            <a
              href="#more"
              className="nnav-btn"
              onClick={(e) => { e.preventDefault(); setMoreOpen(true); }}
            >
              <span className="nav-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm-6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm12 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
                </svg>
              </span>
              <span className="nav-label">More</span>
            </a>
          </li>
        </ul>
      </nav>

      {isMoreOpen && (
        <div className="drawer-backdrop" onClick={() => setMoreOpen(false)}>
          <aside className="drawer" aria-label="More menu" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="h2" aria-hidden="true"></div>
              <button className="btn icon-only danger" onClick={() => setMoreOpen(false)} aria-label="Close">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="drawer-user">
              <div className="drawer-avatar avatar-mark" aria-hidden="true">
                <img src={avatarPresetSrc} alt="" />
              </div>
              <div className="drawer-user-meta">
                <div className="h3" style={{ margin: 0 }}>{me?.name || "Anonymous"}</div>
                <div className="small muted">{house?.name || "No house"}</div>
              </div>
            </div>
            <div className="drawer-list">
              <a
                href="#roommates"
                className="drawer-link"
                onClick={(e) => {
                  e.preventDefault();
                  setTab("ROOMMATES");
                  setMoreOpen(false);
                }}
              >
                Roommates
              </a>
              <a
                href="#finance"
                className="drawer-link"
                onClick={(e) => {
                  e.preventDefault();
                  setTab("FINANCE");
                  setMoreOpen(false);
                }}
              >
                Finance
              </a>
              <a
                href="#guests"
                className="drawer-link"
                onClick={(e) => {
                  e.preventDefault();
                  setTab("GUESTS");
                  setMoreOpen(false);
                }}
              >
                Guests
              </a>
              <a
                href="#community"
                className="drawer-link"
                onClick={(e) => {
                  e.preventDefault();
                  setTab("COMMUNITY");
                  setMoreOpen(false);
                }}
              >
                Community
              </a>
              <a
                href="#settings"
                className="drawer-link"
                onClick={(e) => {
                  e.preventDefault();
                  setTab("PROFILE");
                  setMoreOpen(false);
                }}
              >
                Settings
              </a>
              <a
                href="#support"
                className="drawer-link"
                onClick={(e) => {
                  e.preventDefault();
                  setTab("SUPPORT");
                  setMoreOpen(false);
                }}
              >
                Support
              </a>
            </div>
          </aside>
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
              <button className="btn danger" onClick={() => setDndModalOpen(false)}>Cancel</button>
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
              <button className="btn danger" onClick={() => { setStatusModalOpen(false); setPendingStatus(null); }}>Cancel</button>
              <button className="btn" onClick={() => saveStatus(pendingStatus, statusNote)}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}



