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

function normalizeEmail(email) {
  return typeof email === "string" ? email.toLowerCase().trim() : "";
}

function remoteUserKey(member) {
  if (!member) return null;
  const raw = member.wp_user_id ?? member.wpId ?? member.user_id ?? member.id;
  if (raw === undefined || raw === null) return null;
  return String(raw);
}

function remoteUserId(member) {
  const raw = member?.wp_user_id ?? member?.wpId ?? member?.user_id ?? member?.id;
  if (raw === undefined || raw === null) return null;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

function ensureRemoteUser(users, member, houseId) {
  if (!member) return { users, userId: null };
  const targetEmail = normalizeEmail(member.email);
  const targetWpId = remoteUserId(member);
  const normalizedStatus = (member.status || "HOME").toUpperCase();
  const existingIndex = users.findIndex(u => {
    if (targetWpId && u.wpId && u.wpId === targetWpId) return true;
    if (targetEmail && normalizeEmail(u.email) === targetEmail) return true;
    return false;
  });
  if (existingIndex >= 0) {
    const current = users[existingIndex];
    const updated = {
      ...current,
      name: member.name || current.name,
      wpId: current.wpId || targetWpId,
      houseId: houseId || current.houseId,
      status: normalizedStatus || current.status || "HOME"
    };
    if (
      updated.name === current.name &&
      updated.wpId === current.wpId &&
      updated.houseId === current.houseId &&
      updated.status === current.status
    ) {
      return { users, userId: current.id };
    }
    const next = [...users];
    next[existingIndex] = updated;
    return { users: next, userId: updated.id };
  }
  const fallbackEmail =
    member.email ||
    (targetWpId ? `user${targetWpId}@remote.local` : `member-${uid("wp")}@remote.local`);
  const newUser = {
    id: uid("user"),
    name: member.name || fallbackEmail.split("@")[0],
    email: fallbackEmail,
    houseId,
    status: normalizedStatus,
    dndUntil: null,
    tagline: "",
    avatarColor: "#7ea0ff",
    avatarPreset: null,
    notifications: { push: true, email: false },
    paypal: "",
    venmo: "",
    phone: "",
    wpId: targetWpId,
  };
  return { users: [...users, newUser], userId: newUser.id };
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
      avatarPreset: u.avatarPreset || null,
      timezone: DEVICE_TIMEZONE,
      notifications,
      photo: u.photo || null,
      phone: u.phone || "",
      paypal: u.paypal || "",
      venmo: u.venmo || "",
      wpId: u.wpId ?? null
    };
  });
  const normHouses = (db?.houses ?? SEED_DB.houses).map(h => {
    const adminId = h.adminId || pickAdmin(h.memberIds, null);
    const inviteCode = h.inviteCode || genInviteCode(existingCodes);
    existingCodes.add(inviteCode);
    return { ...h, adminId, inviteCode, currency: h.currency || "USD" };
  });
  return {
    ...SEED_DB,
    ...db,
    users: normUsers,
    houses: normHouses,
    guests: Array.isArray(db?.guests) ? db.guests : [],
    chores: Array.isArray(db?.chores) ? db.chores : [],
    todoLists: normTodoLists,
    notes: normNotes,
    expenses: Array.isArray(db?.expenses) ? db.expenses : []
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
          theme: "light" // force light as default
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

function mergeRemoteHouse(remote, users, fallbackHouse, meId) {
  if (!remote) return { users, house: fallbackHouse };
  const houseId = remote.id || remote.houseId;
  if (!houseId) return { users, house: fallbackHouse };
  const members = Array.isArray(remote.members) ? remote.members : [];
  let workingUsers = users;
  const memberIds = new Set();
  const remoteIdMap = new Map();
  members.forEach(member => {
    const result = ensureRemoteUser(workingUsers, member, houseId);
    workingUsers = result.users;
    if (result.userId) {
      memberIds.add(result.userId);
      const key = remoteUserKey(member);
      if (key) remoteIdMap.set(key, result.userId);
    }
  });
  if (memberIds.size === 0 && fallbackHouse?.memberIds) {
    fallbackHouse.memberIds.forEach(id => memberIds.add(id));
  }
  if (meId && !memberIds.has(meId)) {
    memberIds.add(meId);
  }
  const adminRemote = members.find(m => (m.role || "").toLowerCase() === "admin");
  let adminId = fallbackHouse?.adminId || null;
  if (adminRemote) {
    const key = remoteUserKey(adminRemote);
    if (key && remoteIdMap.has(key)) {
      adminId = remoteIdMap.get(key);
    }
  }
  if (!adminId) {
    adminId = pickAdmin(Array.from(memberIds), fallbackHouse?.adminId || null);
  }
  const inviteCode = remote.invite_code || remote.inviteCode || fallbackHouse?.inviteCode || "";
  const currency = (remote.currency || fallbackHouse?.currency || "USD").toUpperCase();
  const house = {
    id: houseId,
    name: remote.name || fallbackHouse?.name || "House",
    inviteCode,
    currency,
    memberIds: Array.from(memberIds),
    adminId
  };
  return { users: workingUsers, house };
}

export function reducer(state, action) {
  state = clearToast(state);

  switch (action.type) {
    case "LOGIN": {
      const email = String(action.email || "").toLowerCase().trim();
      const user = state.db.users.find(u => u.email.toLowerCase() === email);
      if (!user) return toast(state, "Demo user not found.");
      const view = user.houseId ? "DASHBOARD" : "ONBOARDING";
      let users = state.db.users;
      if (action.profile) {
        users = state.db.users.map(u => {
          if (u.id !== user.id) return u;
          return {
            ...u,
            name: action.profile.name || u.name,
            wpId: action.profile.wpId ?? u.wpId ?? null
          };
        });
      }
      return { ...state, db: { ...state.db, users }, currentUserId: user.id, view };
    }

    case "SIGNUP": {
      const name = String(action.name || "").trim();
      const email = String(action.email || "").toLowerCase().trim();
      if (!name || !email) return toast(state, "Name and email required.");
      if (state.db.users.some(u => u.email.toLowerCase() === email)) {
        return toast(state, "Email already exists.");
      }
      const newUser = {
        id: uid("user"),
        name,
        email,
        houseId: null,
        status: "HOME",
        wpId: action.profile?.wpId ?? null,
        notifications: { push: true, email: false }
      };
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
      const payload = action.payload || {};
      const name = String(payload.name || action.name || "").trim();
      if (!name) return toast(state, "House name required.");
      const meId = state.currentUserId;
      if (!meId) return state;

      const existingCodes = new Set(state.db.houses.map(h => h.inviteCode));
      const houseId = payload.id || payload.houseId || uid("house");
      const inviteCode = payload.inviteCode || genInviteCode(existingCodes);
      const currency = payload.currency || "USD";
      const newHouse = {
        id: houseId,
        name,
        inviteCode,
        currency,
        memberIds: [meId],
        adminId: meId
      };

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
      const payload = action.payload || {};
      const code = String(payload.inviteCode || action.code || "").trim();
      const meId = state.currentUserId;
      if (!meId) return state;

      let house = null;
      if (payload.house) {
        house = {
          id: payload.house.id || payload.house.houseId,
          name: payload.house.name,
          inviteCode: payload.house.invite_code || payload.house.inviteCode || code,
          currency: payload.house.currency || "USD",
          members: payload.house.members || []
        };
      } else {
        house = state.db.houses.find(h => h.inviteCode === code);
      }
      if (!house || !house.id) return toast(state, "Invalid invite code.");

      const remoteMembers = Array.isArray(payload.members)
        ? payload.members
        : Array.isArray(house.members)
        ? house.members
        : [];
      const existing = state.db.houses.find(h => h.id === house.id);
      let users = state.db.users;
      const memberIdsSet = new Set(existing?.memberIds || []);
      const remoteIdMap = new Map();
      remoteMembers.forEach(member => {
        const result = ensureRemoteUser(users, member, house.id);
        users = result.users;
        if (result.userId) {
          memberIdsSet.add(result.userId);
          const key = remoteUserKey(member);
          if (key) remoteIdMap.set(key, result.userId);
        }
      });
      memberIdsSet.add(meId);

      const memberIds = Array.from(memberIdsSet);
      const baseHouse = existing
        ? { ...existing }
        : {
            id: house.id,
            name: house.name,
            inviteCode: house.inviteCode,
            currency: house.currency || "USD",
            memberIds,
            adminId: null
          };
      baseHouse.name = house.name || baseHouse.name;
      baseHouse.inviteCode = house.inviteCode || baseHouse.inviteCode;
      baseHouse.currency = (house.currency || baseHouse.currency || "USD").toUpperCase();
      baseHouse.memberIds = memberIds;

      const adminRemote = remoteMembers.find(m => (m.role || "").toLowerCase() === "admin");
      let adminId = baseHouse.adminId || null;
      if (adminRemote) {
        const key = remoteUserKey(adminRemote);
        if (key && remoteIdMap.has(key)) {
          adminId = remoteIdMap.get(key);
        }
      }
      if (!adminId && remoteMembers.length === 0 && !baseHouse.adminId) {
        adminId = meId;
      }
      baseHouse.adminId = adminId || baseHouse.adminId || pickAdmin(memberIds, null);

      const houses = existing
        ? state.db.houses.map(h => (h.id === baseHouse.id ? baseHouse : h))
        : [...state.db.houses, baseHouse];

      const normalizedUsers = users.map(u =>
        u.id === meId ? { ...u, houseId: baseHouse.id } : u
      );

      return toast({
        ...state,
        db: { ...state.db, houses, users: normalizedUsers },
        view: "DASHBOARD"
      }, "Joined house.");
    }

    case "SYNC_REMOTE_HOUSES": {
      const remoteHouses = Array.isArray(action.houses) ? action.houses : [];
      const meId = state.currentUserId;
      if (!meId || remoteHouses.length === 0) return state;
      let users = state.db.users;
      const remoteIds = new Set();
      const remoteMap = new Map();
      remoteHouses.forEach(remote => {
        const existing = state.db.houses.find(h => h.id === (remote?.id || remote?.houseId));
        const { users: mergedUsers, house } = mergeRemoteHouse(remote, users, existing, meId);
        users = mergedUsers;
        if (house?.id) {
          remoteIds.add(house.id);
          remoteMap.set(house.id, house);
        }
      });
      if (remoteMap.size === 0) return state;
      let updatedHouses = state.db.houses.map(h => {
        if (remoteMap.has(h.id)) {
          return remoteMap.get(h.id);
        }
        const memberIds = (h.memberIds || []).filter(id => id !== meId);
        const adminId = h.adminId === meId ? pickAdmin(memberIds, null) : h.adminId;
        return { ...h, memberIds, adminId };
      });
      remoteMap.forEach((house, id) => {
        if (!updatedHouses.some(h => h.id === id)) {
          updatedHouses.push(house);
        }
      });
      updatedHouses = updatedHouses.filter(h => remoteMap.has(h.id) || (h.memberIds || []).length > 0);
      const remoteHouse = Array.from(remoteMap.values()).find(h => h.memberIds.includes(meId));
      const currentUser = users.find(u => u.id === meId) || state.db.users.find(u => u.id === meId);
      const nextHouseId = remoteHouse ? remoteHouse.id : currentUser?.houseId || null;
      const normalizedUsers = users.map(u =>
        u.id === meId ? { ...u, houseId: nextHouseId } : u
      );
      return {
        ...state,
        db: { ...state.db, houses: updatedHouses, users: normalizedUsers }
      };
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

    case "UPDATE_CHORE": {
      const { choreId, patch } = action;
      if (!choreId || !patch) return state;
      const chores = state.db.chores.map(c => {
        if (c.id !== choreId) return c;
        return { ...c, ...patch };
      });
      return toast({ ...state, db: { ...state.db, chores } }, "Chore updated.");
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
      return { ...state, theme: action.theme || "light" };
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
          avatarPreset: patch.avatarPreset === undefined ? u.avatarPreset ?? null : patch.avatarPreset,
          timezone: u.timezone ?? DEVICE_TIMEZONE,
          notifications,
          photo: patch.photo === undefined ? u.photo ?? null : patch.photo,
          phone: patch.phone === undefined ? u.phone ?? "" : patch.phone,
          paypal: patch.paypal === undefined ? u.paypal ?? "" : patch.paypal,
          venmo: patch.venmo === undefined ? u.venmo ?? "" : patch.venmo
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
      let houses = state.db.houses.map(h => {
        if (!h.memberIds.includes(userId)) return h;
        const memberIds = h.memberIds.filter(id => id !== userId);
        const adminId = h.adminId === userId ? pickAdmin(memberIds, null) : h.adminId;
        return { ...h, memberIds, adminId };
      });
      houses = houses.filter(h => (h.memberIds || []).length > 0);
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
      const { userId, houseId, inviteCode: providedCode } = action;
      if (!userId || !houseId) return state;
      const house = state.db.houses.find(h => h.id === houseId);
      if (!house) return state;
      if (house.adminId !== userId) return toast(state, "Only the house admin can regenerate the code.");
      const existing = new Set(state.db.houses.filter(h => h.id !== houseId).map(h => h.inviteCode));
      const inviteCode = (providedCode || "").trim().toUpperCase() || genInviteCode(existing);
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

    case "SET_HOUSE_CURRENCY": {
      const { userId, houseId, currency } = action;
      const clean = String(currency || "").trim().toUpperCase();
      if (!userId || !houseId || !clean) return state;
      const house = state.db.houses.find(h => h.id === houseId);
      if (!house) return state;
      if (house.adminId !== userId) return toast(state, "Only the house admin can change currency.");
      if (house.currency === clean) return state;
      const houses = state.db.houses.map(h => h.id === houseId ? { ...h, currency: clean } : h);
      return toast({ ...state, db: { ...state.db, houses } }, "Currency updated.");
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

    case "ADD_EXPENSE": {
      const { expense } = action;
      if (!expense?.id || !expense?.title || !expense?.amount) return state;
      const expenses = [...(state.db.expenses || []), expense];
      return toast({ ...state, db: { ...state.db, expenses } }, "Expense added.");
    }

    case "DELETE_EXPENSE": {
      const { expenseId } = action;
      if (!expenseId) return state;
      const expenses = (state.db.expenses || []).filter(e => e.id !== expenseId);
      return toast({ ...state, db: { ...state.db, expenses } }, "Expense removed.");
    }

    case "DISMISS_TOAST":
      return { ...state, toast: null };

    default:
      return state;
  }
}
