import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import AuthScreen from "./screens/AuthScreen";
import OnboardingScreen from "./screens/OnboardingScreen";
import Dashboard from "./screens/Dashboard";
import Toast from "./components/Toast";

import { reducer, loadInitial } from "./store/reducer";
import { getCurrentUser, getHouse, getHouseUsers, getHouseChores, getHouseGuests, getTodoLists, getHouseExpenses } from "./store/selectors";
import { uid, SESSION_STATE_KEY } from "./store/utils";

const AUTH_TOKEN_KEY = "flatmate_auth_token";
const normalizeToken = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  return trimmed.toLowerCase().startsWith("bearer ") ? trimmed.slice(7).trim() : trimmed;
};

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitial);
  const [authToken, setAuthTokenState] = useState(() => {
    if (typeof window === "undefined") return null;
    return normalizeToken(sessionStorage.getItem(AUTH_TOKEN_KEY));
  });
  const setAuthToken = useCallback((token) => {
    setAuthTokenState(normalizeToken(token));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", state.theme || "light");
  }, [state.theme]);

  const [installEvent, setInstallEvent] = useState(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);


  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    setIsStandalone(standalone);

    function handleBeforeInstall(e) {
      e.preventDefault();
      setInstallEvent(e);
      setCanInstall(true);
    }
    function handleAppInstalled() {
      setInstallEvent(null);
      setCanInstall(false);
      setIsStandalone(true);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function triggerInstall() {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
    setCanInstall(false);
  }

  const me = getCurrentUser(state);
  const house = getHouse(state, me);
  const houseUsers = getHouseUsers(state, me);
  const houseChores = getHouseChores(state, me);
  const houseGuests = getHouseGuests(state, me);
  const todoLists = getTodoLists(state, me);
  const houseExpenses = getHouseExpenses(state, me);
  const remoteSyncRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (authToken) {
      sessionStorage.setItem(AUTH_TOKEN_KEY, authToken);
    } else {
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
    }
  }, [authToken]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const payload = JSON.stringify({ ...state, toast: null });
      sessionStorage.setItem(SESSION_STATE_KEY, payload);
    } catch {}
  }, [state]);

  const actions = useMemo(() => ({
    login: (email, profile) => {
      const normalized = String(email || "").toLowerCase().trim();
      const exists = state?.db?.users?.some(u => u.email?.toLowerCase() === normalized) ?? false;
      if (!exists) return false;
      dispatch({ type: "LOGIN", email, profile });
      return true;
    },
    signup: (name, email, profile) => dispatch({ type: "SIGNUP", name, email, profile }),
    logout: () => {
      setAuthToken(null);
      dispatch({ type: "LOGOUT" });
    },
    createHouse: (payload) => dispatch({ type: "CREATE_HOUSE", payload }),
    joinHouse: (payload) => dispatch({ type: "JOIN_HOUSE", payload }),

    addChore: (chore) => dispatch({ type: "ADD_CHORE", chore }),
    updateChore: (choreId, patch) => dispatch({ type: "UPDATE_CHORE", choreId, patch }),
    setStatus: (userId, status, until, statusNote) => dispatch({ type: "SET_STATUS", userId, status, until, statusNote }),
    addGuest: (guest) => dispatch({ type: "ADD_GUEST", guest }),
    addNote: (note) => dispatch({ type: "ADD_NOTE", note }),
    deleteNote: (noteId) => dispatch({ type: "DELETE_NOTE", noteId }),
    toggleChoreItem: (choreId, itemId) => dispatch({ type: "TOGGLE_CHORE_ITEM", choreId, itemId }),
    completeChore: (choreId, userId) => dispatch({ type: "COMPLETE_CHORE", choreId, userId }),
    setTheme: (theme) => dispatch({ type: "SET_THEME", theme }),
    updateProfile: (userId, patch) => dispatch({ type: "UPDATE_PROFILE", userId, patch }),
    leaveHouse: (userId) => dispatch({ type: "LEAVE_HOUSE", userId }),
    transferAdmin: (fromUserId, toUserId) => dispatch({ type: "TRANSFER_ADMIN", fromUserId, toUserId }),
    regenerateInvite: (userId, houseId, inviteCode) => dispatch({ type: "REGENERATE_INVITE", userId, houseId, inviteCode }),
    renameHouse: (userId, houseId, name) => dispatch({ type: "RENAME_HOUSE", userId, houseId, name }),
    setHouseCurrency: (userId, houseId, currency) => dispatch({ type: "SET_HOUSE_CURRENCY", userId, houseId, currency }),
    addTodoList: (payload) => dispatch({ type: "ADD_TODO_LIST", list: { id: uid("todo_list"), ...payload } }),
    updateTodoList: (listId, patch) => dispatch({ type: "UPDATE_TODO_LIST", listId, patch }),
    deleteTodoList: (listId) => dispatch({ type: "DELETE_TODO_LIST", listId }),
    addTodoItem: (listId, payload) => dispatch({ type: "ADD_TODO_ITEM", listId, task: { id: uid("todo"), ...payload } }),
    toggleTodoItem: (listId, taskId) => dispatch({ type: "TOGGLE_TODO_ITEM", listId, taskId }),
    deleteTodoItem: (listId, taskId) => dispatch({ type: "DELETE_TODO_ITEM", listId, taskId }),
    addExpense: (expense) => dispatch({ type: "ADD_EXPENSE", expense }),
    deleteExpense: (expenseId) => dispatch({ type: "DELETE_EXPENSE", expenseId }),

    checkDndExpiry: () => dispatch({ type: "CHECK_DND_EXPIRY" }),
    dismissToast: () => dispatch({ type: "DISMISS_TOAST" }),
    updateNote: (noteId, patch) => dispatch({ type: "UPDATE_NOTE", noteId, patch }),
    syncRemoteHouses: (houses) => dispatch({ type: "SYNC_REMOTE_HOUSES", houses })
  }), [dispatch, state]);

  const activeHouseId = house?.id || "none";
  useEffect(() => {
    if (!authToken || !actions?.syncRemoteHouses) return;
    const key = `${authToken}:${me?.id || "anon"}:${activeHouseId}`;
    if (remoteSyncRef.current === key) return;
    remoteSyncRef.current = key;
    fetch("/api/wp-houses", {
      headers: { Authorization: `Bearer ${authToken}` }
    })
      .then(async resp => {
        const data = await resp.json().catch(() => []);
        if (!resp.ok || !Array.isArray(data)) return;
        actions.syncRemoteHouses(data);
      })
      .catch(() => {});
  }, [actions?.syncRemoteHouses, me?.id, activeHouseId, authToken]);

  useEffect(() => {
    if (!authToken || state.currentUserId) return;
    let cancelled = false;
    async function hydrateFromToken() {
      try {
        const resp = await fetch("/api/wp-me", {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        if (!resp.ok) return;
        const meData = await resp.json().catch(() => null);
        if (!meData || cancelled) return;
        const email =
          String(meData.email || meData.user_email || meData.username || "").toLowerCase().trim();
        const name = meData.name || meData.display_name || meData.user_nicename || "Member";
        if (!email) return;
        const profile = { name, wpId: meData.id ?? meData.user_id ?? null };
        const exists = state?.db?.users?.some(u => u.email?.toLowerCase() === email) ?? false;
        if (exists) {
          dispatch({ type: "LOGIN", email, profile });
        } else {
          dispatch({ type: "SIGNUP", name, email, profile });
        }
      } catch {
        // ignore token hydration errors; user can login manually
      }
    }
    hydrateFromToken();
    return () => {
      cancelled = true;
    };
  }, [authToken, state.db.users, state.currentUserId, dispatch]);

  return (
    <div className="app-shell">
      <div className="header-nav">
        <div className="topbar">
          <div className="brand-cluster">
            <img src="/paxbud-logo.svg" alt="paxbud logo" className="logo-img" />
          </div>
          <div className="topbar-right">
            {!isStandalone && (
              <button
                className="btn secondary small install-btn"
                onClick={triggerInstall}
                disabled={!canInstall}
                title={canInstall ? "Install this app" : "Install will be ready when your browser allows it"}
              >
                <span className="material-symbols-outlined" aria-hidden="true">download</span>
                <span>Install app</span>
              </button>
            )}
            {me && (
              <button className="btn icon-only danger" onClick={actions.logout} aria-label="Logout">
                <span className="material-symbols-outlined">power_settings_new</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 0 }}>
        {state.view === "AUTH" && <AuthScreen actions={actions} onAuthToken={setAuthToken} />}
        {state.view === "ONBOARDING" && <OnboardingScreen me={me} actions={actions} authToken={authToken} />}
        {state.view === "DASHBOARD" && (
          <Dashboard
            state={state}
            me={me}
            house={house}
            houseUsers={houseUsers}
            houseChores={houseChores}
            houseGuests={houseGuests}
            todoLists={todoLists}
            houseExpenses={houseExpenses}
            actions={actions}
            authToken={authToken}
          />
        )}
      </div>

      <Toast message={state.toast} onClose={actions.dismissToast} />
    </div>
  );
}
