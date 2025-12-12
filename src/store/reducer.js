import { SEED_DB } from "./seed";
import { STORAGE_KEY, uid, nowIso, addDays } from "./utils";

const DEVICE_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_LENGTH = 8;

function pickAdmin(memberIds, fallback) {
  if (memberIds && memberIds.length > 0) return memberIds[0];
  return fallback || null;
}

function findHouseByMember(houses, userId) {
  return houses.find(h => h.memberIds.includes(userId)) || null;
}

function ensureDndUntil(until) {
  if (!until) return null;
  const base = new Date(until);
  if (Number.isNaN(base.getTime())) return null;
  return base.toISOString();
}

function normalizeDb(db) {
  const existingCodes = new Set();
  const normTodoLists = Array.isArray(db?.todoLists) ? db.todoLists : [];
  const normNotes = Array.isArray(db?.notes)
    ? db.notes.map(n => ({ pinned: false, ...n }))
    : [];
  const normUsers = (db?.users ?? SEED_DB.users).map(u => {
    const status = u.status || "HOME";
    const validUntil = u.dndUntil ? new Date(u.dndUntil) : null;
    const hasValidUntil = validUntil && !Number.isNaN(validUntil.getTime());
    const nextStatus = status === "DND" && !hasValidUntil ? "HOME" : status;
    const dndUntil = hasValidUntil ? validUntil.toISOString() : null;
    const notifications = {
      push: u.notifications?.push ?? true,
      email: u.notifications?.email ?? false
    };
    return {
      ...u,
      status: nextStatus,
      dndUntil: nextStatus === "DND" ? dndUntil : null,
      tagline: u.tagline || "",
      avatarColor: u.avatarColor || "#7ea0ff",
      timezone: DEVICE_TIMEZONE,
      notifications,
      photo: u.photo || null
    };
  });
  const normHouses = (db?.houses ?? SEED_DB.houses).map(h => {
    const adminId = h.adminId || pickAdmin(h.memberIds, null);
    const inviteCode = h.inviteCode || genInviteCode(existingCodes);
    existingCodes.add(inviteCode);
    return { ...h, adminId, inviteCode };
  });
  return {
    ...SEED_DB,
    ...db,
    users: normUsers,
    houses: normHouses,
    guests: Array.isArray(db?.guests) ? db.guests : [],
    chores: Array.isArray(db?.chores) ? db.chores : [],
    todoLists: normTodoLists,
    notes: normNotes
  };
}

export function loadInitial() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed?.db && parsed?.view) {
        return {
          ...parsed,
          db: normalizeDb(parsed.db),
          theme: parsed.theme || "light"
        };
      }
    } catch {}
  }
  return { db: SEED_DB, currentUserId: null, view: "AUTH", toast: null, theme: "light" };
}

function toast(state, msg) {
  return { ...state, toast: msg };
}

function clearToast(state) {
  if (!state.toast) return state;
  return { ...state, toast: null };
}

function genInviteCode(existingCodes = new Set()) {
  for (let i = 0; i < 50; i++) {
    let code = "";
    for (let j = 0; j < INVITE_LENGTH; j++) {
      const idx = Math.floor(Math.random() * INVITE_ALPHABET.length);
      code += INVITE_ALPHABET[idx];
    }
    if (!existingCodes.has(code)) return code;
  }
  return uid("INV");
}

function nextAssignee(chore) {
  const rotation = chore.rotation || [];
  if (rotation.length === 0) return { assigneeId: null, rotationIndex: 0 };
  const nextIndex = (Number(chore.rotationIndex || 0) + 1) % rotation.length;
  return { assigneeId: rotation[nextIndex], rotationIndex: nextIndex };
}

export function reducer(state, action) {
  state = clearToast(state);

  switch (action.type) {
    case "LOGIN": {
      const email = String(action.email || "").toLowerCase().trim();
      const user = state.db.users.find(u => u.email.toLowerCase() === email);
      if (!user) return toast(state, "Demo user not found.");
      const view = user.houseId ? "DASHBOARD" : "ONBOARDING";
      return { ...state, currentUserId: user.id, view };
    }

    case "SIGNUP": {
      const name = String(action.name || "").trim();
      const email = String(action.email || "").toLowerCase().trim();
      if (!name || !email) return toast(state, "Name and email required.");
      if (state.db.users.some(u => u.email.toLowerCase() === email)) {
        return toast(state, "Email already exists.");
      }
      const newUser = { id: uid("user"), name, email, houseId: null, status: "HOME" };
      return {
        ...state,
        db: { ...state.db, users: [...state.db.users, newUser] },
        currentUserId: newUser.id,
        view: "ONBOARDING"
      };
    }

    case "LOGOUT":
      return { ...state, currentUserId: null, view: "AUTH" };

    case "CREATE_HOUSE": {
      const name = String(action.name || "").trim();
      if (!name) return toast(state, "House name required.");
      const meId = state.currentUserId;
      if (!meId) return state;

      const houseId = uid("house");
      const inviteCode = genInviteCode(new Set(state.db.houses.map(h => h.inviteCode)));
      const newHouse = { id: houseId, name, inviteCode, memberIds: [meId], adminId: meId };

      const users = state.db.users.map(u =>
        u.id === meId ? { ...u, houseId } : u
      );

      return toast({
        ...state,
        db: { ...state.db, houses: [...state.db.houses, newHouse], users },
        view: "DASHBOARD"
      }, "House created.");
    }

    case "JOIN_HOUSE": {
      const code = String(action.code || "").trim();
      const meId = state.currentUserId;
      if (!meId) return state;

      const house = state.db.houses.find(h => h.inviteCode === code);
      if (!house) return toast(state, "Invalid invite code.");

      const houses = state.db.houses.map(h => {
        if (h.id !== house.id) return h;
        const memberIds = Array.from(new Set([...h.memberIds, meId]));
        const adminId = h.adminId || pickAdmin(memberIds, null);
        return { ...h, memberIds, adminId };
      });

      const users = state.db.users.map(u =>
        u.id === meId ? { ...u, houseId: house.id } : u
      );

      return toast({
        ...state,
        db: { ...state.db, houses, users },
        view: "DASHBOARD"
      }, "Joined house.");
    }

    case "ADD_CHORE": {
      const chore = action.chore;
      if (!chore?.houseId) return state;

      return toast({
        ...state,
        db: {
          ...state.db,
          chores: [...state.db.chores, chore]
        }
      }, "Chore created.");
    }

    case "SET_STATUS": {
      const { userId, status, until, statusNote } = action;
      if (!userId || !status) return state;
      const upper = String(status).toUpperCase();
      const users = state.db.users.map(u => {
        if (u.id !== userId) return u;
        const normalizedUntil = upper === "DND" ? ensureDndUntil(until) : null;
        const nextStatus = upper === "DND" && !normalizedUntil ? "HOME" : upper;
        return {
          ...u,
          status: nextStatus,
          dndUntil: nextStatus === "DND" ? normalizedUntil : null,
          statusNote: statusNote !== undefined ? statusNote : (u.statusNote || "")
        };
      });
      return toast({ ...state, db: { ...state.db, users } }, "Status updated.");
    }

    case "ADD_GUEST": {
      const guest = action.guest;
      if (!guest?.houseId || !guest?.name) return state;
      const arrivalTs = new Date(guest.arrivesAt || Date.now()).getTime();
      const host = state.db.users.find(u => u.id === guest.hostId);
      if (host?.status === "DND") {
        const untilTs = host.dndUntil ? new Date(host.dndUntil).getTime() : null;
        if (!untilTs || arrivalTs <= untilTs) {
          return toast(state, "Cannot schedule guest during DND.");
        }
      }
      return toast({
        ...state,
        db: { ...state.db, guests: [...state.db.guests, guest] }
      }, "Guest added.");
    }

    case "ADD_NOTE": {
      const note = action.note;
      if (!note?.houseId || !note?.text) return state;
      const existing = [...(state.db.notes || [])];
      const idx = existing.findIndex(n => n.houseId === note.houseId && n.authorId === note.authorId);
      let nextNotes;
      if (idx >= 0) {
        const current = existing[idx];
        const updated = { ...current, ...note, pinned: current.pinned ?? false };
        nextNotes = [...existing.slice(0, idx), updated, ...existing.slice(idx + 1)];
      } else {
        nextNotes = [...existing, { pinned: false, ...note }];
      }
      const trimmed = nextNotes.slice(-50); // keep most recent 50
      return toast({
        ...state,
        db: { ...state.db, notes: trimmed }
      }, "Note added.");
    }

    case "DELETE_NOTE": {
      const { noteId } = action;
      if (!noteId) return state;
      const notes = (state.db.notes || []).filter(n => n.id !== noteId);
      return toast({ ...state, db: { ...state.db, notes } }, "Note removed.");
    }

    case "UPDATE_NOTE": {
      const { noteId, patch } = action;
      if (!noteId || !patch) return state;
      const notes = (state.db.notes || []).map(n => (n.id === noteId ? { ...n, ...patch } : n));
      return toast({ ...state, db: { ...state.db, notes } }, "Note updated.");
    }

    case "SET_THEME": {
      return { ...state, theme: "dark" };
    }

    case "UPDATE_PROFILE": {
      const { userId, patch } = action;
      if (!userId || !patch) return state;
      const users = state.db.users.map(u => {
        if (u.id !== userId) return u;
        const notifications = {
          push: patch.notifications?.push ?? u.notifications?.push ?? true,
          email: patch.notifications?.email ?? u.notifications?.email ?? false
        };
        return {
          ...u,
          name: patch.name ?? u.name,
          email: patch.email ?? u.email,
          tagline: patch.tagline ?? u.tagline ?? "",
          avatarColor: patch.avatarColor ?? u.avatarColor ?? "#7ea0ff",
          timezone: u.timezone ?? DEVICE_TIMEZONE,
          notifications,
          photo: patch.photo === undefined ? u.photo ?? null : patch.photo
        };
      });
      return toast({ ...state, db: { ...state.db, users } }, "Profile updated.");
    }

    case "LEAVE_HOUSE": {
      const { userId } = action;
      if (!userId) return state;
      const houseForUser = findHouseByMember(state.db.houses, userId);
      if (houseForUser && houseForUser.adminId === userId && houseForUser.memberIds.length > 1) {
        return toast(state, "Transfer house admin before leaving.");
      }
      const users = state.db.users.map(u =>
        u.id === userId ? { ...u, houseId: null, status: "HOME", dndUntil: null } : u
      );
      const houses = state.db.houses.map(h => {
        if (!h.memberIds.includes(userId)) return h;
        const memberIds = h.memberIds.filter(id => id !== userId);
        const adminId = h.adminId === userId ? pickAdmin(memberIds, null) : h.adminId;
        return { ...h, memberIds, adminId };
      });
      return toast({ ...state, db: { ...state.db, users, houses }, view: "ONBOARDING" }, "Left house.");
    }

    case "TRANSFER_ADMIN": {
      const { fromUserId, toUserId } = action;
      if (!fromUserId || !toUserId) return state;
      const house = findHouseByMember(state.db.houses, fromUserId);
      if (!house) return state;
      if (house.adminId !== fromUserId) return toast(state, "Only the house admin can transfer admin.");
      if (!house.memberIds.includes(toUserId)) return toast(state, "Target must be in this house.");
      if (fromUserId === toUserId) return state;
      const houses = state.db.houses.map(h => h.id === house.id ? { ...h, adminId: toUserId } : h);
      return toast({ ...state, db: { ...state.db, houses } }, "Admin transferred.");
    }

    case "REGENERATE_INVITE": {
      const { userId, houseId } = action;
      if (!userId || !houseId) return state;
      const house = state.db.houses.find(h => h.id === houseId);
      if (!house) return state;
      if (house.adminId !== userId) return toast(state, "Only the house admin can regenerate the code.");
      const existing = new Set(state.db.houses.filter(h => h.id !== houseId).map(h => h.inviteCode));
      const inviteCode = genInviteCode(existing);
      const houses = state.db.houses.map(h => h.id === houseId ? { ...h, inviteCode } : h);
      return toast({ ...state, db: { ...state.db, houses } }, "Invite code regenerated.");
    }

    case "RENAME_HOUSE": {
      const { userId, houseId, name } = action;
      const cleanName = String(name || "").trim();
      if (!userId || !houseId || !cleanName) return state;
      const house = state.db.houses.find(h => h.id === houseId);
      if (!house) return state;
      if (house.adminId !== userId) return toast(state, "Only the house admin can rename the house.");
      const houses = state.db.houses.map(h => h.id === houseId ? { ...h, name: cleanName } : h);
      return toast({ ...state, db: { ...state.db, houses } }, "House renamed.");
    }

    case "ADD_TODO_LIST": {
      const { list } = action;
      if (!list?.id || !list?.title || !list?.ownerId) return state;
      const todoLists = [...(state.db.todoLists || []), { ...list, tasks: list.tasks || [] }];
      return toast({ ...state, db: { ...state.db, todoLists } }, "List created.");
    }

    case "UPDATE_TODO_LIST": {
      const { listId, patch } = action;
      if (!listId || !patch) return state;
      const todoLists = (state.db.todoLists || []).map(l =>
        l.id === listId ? { ...l, ...patch, tasks: l.tasks || [] } : l
      );
      return { ...state, db: { ...state.db, todoLists } };
    }

    case "DELETE_TODO_LIST": {
      const { listId } = action;
      if (!listId) return state;
      const todoLists = (state.db.todoLists || []).filter(l => l.id !== listId);
      return toast({ ...state, db: { ...state.db, todoLists } }, "List deleted.");
    }

    case "ADD_TODO_ITEM": {
      const { listId, task } = action;
      if (!listId || !task?.id || !task?.title) return state;
      const todoLists = (state.db.todoLists || []).map(l => {
        if (l.id !== listId) return l;
        const tasks = [...(l.tasks || []), { ...task, isDone: !!task.isDone }];
        return { ...l, tasks };
      });
      return { ...state, db: { ...state.db, todoLists } };
    }

    case "TOGGLE_TODO_ITEM": {
      const { listId, taskId } = action;
      if (!listId || !taskId) return state;
      const todoLists = (state.db.todoLists || []).map(l => {
        if (l.id !== listId) return l;
        const tasks = (l.tasks || []).map(t =>
          t.id === taskId ? { ...t, isDone: !t.isDone } : t
        );
        return { ...l, tasks };
      });
      return { ...state, db: { ...state.db, todoLists } };
    }

    case "DELETE_TODO_ITEM": {
      const { listId, taskId } = action;
      if (!listId || !taskId) return state;
      const todoLists = (state.db.todoLists || []).map(l => {
        if (l.id !== listId) return l;
        const tasks = (l.tasks || []).filter(t => t.id !== taskId);
        return { ...l, tasks };
      });
      return { ...state, db: { ...state.db, todoLists } };
    }

    case "TOGGLE_CHORE_ITEM": {
      const { choreId, itemId } = action;
      const chores = state.db.chores.map(c => {
        if (c.id !== choreId) return c;
        const checklist = (c.checklist || []).map(i =>
          i.id === itemId ? { ...i, isDone: !i.isDone } : i
        );
        return { ...c, checklist };
      });
      return { ...state, db: { ...state.db, chores } };
    }

    case "COMPLETE_CHORE": {
      const { choreId, userId } = action;

      const chores = state.db.chores.map(c => {
        if (c.id !== choreId) return c;
        if (c.state === "ENDED") return c;
        if (c.assigneeId !== userId) return c;

        const cadence = Number(c.cadenceDays || 7);
        const nextDue = addDays(c.dueAt || nowIso(), cadence);

        const resetChecklist = (c.checklist || []).map(i => ({ ...i, isDone: false }));

        const endAt = c.endAt ? new Date(c.endAt).getTime() : null;
        const nextDueTs = new Date(nextDue).getTime();
        if (endAt && nextDueTs > endAt) {
          return {
            ...c,
            state: "ENDED",
            checklist: resetChecklist
          };
        }

        const nx = nextAssignee(c);

        return {
          ...c,
          dueAt: nextDue,
          ...nx,
          checklist: resetChecklist
        };
      });

      return toast({ ...state, db: { ...state.db, chores } }, "Chore completed.");
    }

    case "CHECK_DND_EXPIRY": {
      const users = state.db.users.map(u => {
        if (u.status !== "DND") return u;
        const ts = u.dndUntil ? new Date(u.dndUntil).getTime() : NaN;
        if (Number.isNaN(ts)) return { ...u, status: "HOME", dndUntil: null };
        if (ts > Date.now()) return u;
        return { ...u, status: "HOME", dndUntil: null };
      });
      return { ...state, db: { ...state.db, users } };
    }

    case "DISMISS_TOAST":
      return { ...state, toast: null };

    default:
      return state;
  }
}
