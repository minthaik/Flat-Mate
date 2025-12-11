import React, { useEffect, useMemo, useReducer } from "react";
import AuthScreen from "./screens/AuthScreen";
import OnboardingScreen from "./screens/OnboardingScreen";
import Dashboard from "./screens/Dashboard";
import Toast from "./components/Toast";

import { reducer, loadInitial } from "./store/reducer";
import { STORAGE_KEY } from "./store/utils";
import { getCurrentUser, getHouse, getHouseUsers, getHouseChores, getHouseGuests, getTodoLists } from "./store/selectors";
import { uid } from "./store/utils";

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitial);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", state.theme || "light");
  }, [state.theme]);

  const me = getCurrentUser(state);
  const house = getHouse(state, me);
  const houseUsers = getHouseUsers(state, me);
  const houseChores = getHouseChores(state, me);
  const houseGuests = getHouseGuests(state, me);
  const todoLists = getTodoLists(state, me);

  const actions = useMemo(() => ({
    login: (email) => dispatch({ type: "LOGIN", email }),
    signup: (name, email) => dispatch({ type: "SIGNUP", name, email }),
    logout: () => dispatch({ type: "LOGOUT" }),
    createHouse: (name) => dispatch({ type: "CREATE_HOUSE", name }),
    joinHouse: (code) => dispatch({ type: "JOIN_HOUSE", code }),

    addChore: (chore) => dispatch({ type: "ADD_CHORE", chore }),
    setStatus: (userId, status, until, statusNote) => dispatch({ type: "SET_STATUS", userId, status, until, statusNote }),
    addGuest: (guest) => dispatch({ type: "ADD_GUEST", guest }),
    toggleChoreItem: (choreId, itemId) => dispatch({ type: "TOGGLE_CHORE_ITEM", choreId, itemId }),
    completeChore: (choreId, userId) => dispatch({ type: "COMPLETE_CHORE", choreId, userId }),
    setTheme: (theme) => dispatch({ type: "SET_THEME", theme }),
    updateProfile: (userId, patch) => dispatch({ type: "UPDATE_PROFILE", userId, patch }),
    leaveHouse: (userId) => dispatch({ type: "LEAVE_HOUSE", userId }),
    transferAdmin: (fromUserId, toUserId) => dispatch({ type: "TRANSFER_ADMIN", fromUserId, toUserId }),
    regenerateInvite: (userId, houseId) => dispatch({ type: "REGENERATE_INVITE", userId, houseId }),
    renameHouse: (userId, houseId, name) => dispatch({ type: "RENAME_HOUSE", userId, houseId, name }),
    addTodoList: (payload) => dispatch({ type: "ADD_TODO_LIST", list: { id: uid("todo_list"), ...payload } }),
    updateTodoList: (listId, patch) => dispatch({ type: "UPDATE_TODO_LIST", listId, patch }),
    deleteTodoList: (listId) => dispatch({ type: "DELETE_TODO_LIST", listId }),
    addTodoItem: (listId, payload) => dispatch({ type: "ADD_TODO_ITEM", listId, task: { id: uid("todo"), ...payload } }),
    toggleTodoItem: (listId, taskId) => dispatch({ type: "TOGGLE_TODO_ITEM", listId, taskId }),
    deleteTodoItem: (listId, taskId) => dispatch({ type: "DELETE_TODO_ITEM", listId, taskId }),

    checkDndExpiry: () => dispatch({ type: "CHECK_DND_EXPIRY" }),
    dismissToast: () => dispatch({ type: "DISMISS_TOAST" })
  }), [dispatch]);

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand-cluster">
          <img src="/paxbud-logo.png" alt="FlatMate logo" className="logo-img" />
        </div>
        <div className="topbar-right">
          {me && (
            <button className="btn icon-only danger" onClick={actions.logout} aria-label="Logout">
              <span className="material-symbols-outlined">power_settings_new</span>
            </button>
          )}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        {state.view === "AUTH" && <AuthScreen actions={actions} />}
        {state.view === "ONBOARDING" && <OnboardingScreen me={me} actions={actions} />}
        {state.view === "DASHBOARD" && (
          <Dashboard
            state={state}
            me={me}
            house={house}
            houseUsers={houseUsers}
            houseChores={houseChores}
            houseGuests={houseGuests}
            todoLists={todoLists}
            actions={actions}
          />
        )}
      </div>

      <Toast message={state.toast} onClose={actions.dismissToast} />
    </div>
  );
}
