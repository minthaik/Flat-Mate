import { uid } from "../store/utils";

export function pickAdmin(memberIds, fallback) {
  if (memberIds && memberIds.length > 0) return memberIds[0];
  return fallback || null;
}

function normalizeEmail(email) {
  return typeof email === "string" ? email.toLowerCase().trim() : "";
}

function normalizeWpId(value) {
  if (value === undefined || value === null) return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

function extractUserWpId(user) {
  if (!user) return null;
  return (
    normalizeWpId(user.wpId) ??
    normalizeWpId(user.wp_id) ??
    normalizeWpId(user.wpUserId) ??
    normalizeWpId(user.wp_user_id) ??
    null
  );
}

function extractHouseAdminWpId(house) {
  if (!house) return null;
  return (
    normalizeWpId(house.adminWpId) ??
    normalizeWpId(house.admin_user_id) ??
    normalizeWpId(house.adminUserId) ??
    normalizeWpId(house.admin_wp_id) ??
    normalizeWpId(house?.admin_member?.wp_user_id) ??
    normalizeWpId(house?.admin_member?.wpId) ??
    normalizeWpId(house?.adminMember?.wp_user_id) ??
    normalizeWpId(house?.adminMember?.wpId) ??
    null
  );
}

export function isHouseAdmin(user, house) {
  if (!user || !house) return false;
  if (house.adminId && house.adminId === user.id) return true;
  const adminWpId = extractHouseAdminWpId(house);
  const userWpId = extractUserWpId(user);
  if (adminWpId && userWpId && adminWpId === userWpId) return true;
  const adminEmail =
    house?.admin_member?.email ||
    house?.adminMember?.email ||
    house?.adminEmail ||
    null;
  if (adminEmail && user.email && normalizeEmail(adminEmail) === normalizeEmail(user.email)) {
    return true;
  }
  return false;
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
  const targetEmail = normalizeEmail(member.email || member.user_email);
  const targetWpId = remoteUserId(member);
  const normalizedWpId = normalizeWpId(targetWpId);
  const normalizedStatus = (member.status || "HOME").toUpperCase();
  const memberName = member.name || member.display_name || member.displayName || null;
  const existingIndex = users.findIndex(u => {
    const userWpId = normalizeWpId(u.wpId ?? u.wp_user_id ?? u.wpUserId);
    if (normalizedWpId && userWpId && userWpId === normalizedWpId) {
      return true;
    }
    if (targetEmail && normalizeEmail(u.email) === targetEmail) return true;
    return false;
  });
  if (existingIndex >= 0) {
    const current = users[existingIndex];
    const updated = {
      ...current,
      name: memberName || current.name,
      wpId: current.wpId || normalizedWpId,
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
    member.user_email ||
    (targetWpId ? `user${targetWpId}@remote.local` : `member-${uid("wp")}@remote.local`);
  const newUser = {
    id: uid("user"),
    name: memberName || fallbackEmail.split("@")[0],
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
    wpId: normalizedWpId,
  };
  return { users: [...users, newUser], userId: newUser.id };
}

export function mergeRemoteHouse(remote, users, fallbackHouse, meId) {
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
  const adminRemote =
    members.find(m => (m.role || "").toLowerCase() === "admin") ||
    (Array.isArray(remote.members) && remote.members.length === 1 ? remote.members[0] : null);
  let adminId = fallbackHouse?.adminId || null;
  const adminWpId =
    remote.admin_user_id ||
    remote.adminUserId ||
    remote.admin_wp_id ||
    remote?.admin_member?.wp_user_id;
  if (!adminId && adminWpId) {
    const numericWpId = Number(adminWpId);
    const match = workingUsers.find(u => u.wpId && !Number.isNaN(numericWpId) && u.wpId === numericWpId);
    if (match) {
      adminId = match.id;
    }
  }
  if (!adminId && adminRemote) {
    const key = remoteUserKey(adminRemote);
    if (key && remoteIdMap.has(key)) {
      adminId = remoteIdMap.get(key);
    } else if (adminRemote.email) {
      const match = workingUsers.find(u => normalizeEmail(u.email) === normalizeEmail(adminRemote.email));
      if (match) adminId = match.id;
    }
  }
  if (!adminId && adminWpId) {
    const numericWpId = Number(adminWpId);
    const currentUser = workingUsers.find(u => u.id === meId);
    if (
      currentUser?.wpId &&
      !Number.isNaN(numericWpId) &&
      !Number.isNaN(Number(currentUser.wpId)) &&
      Number(currentUser.wpId) === numericWpId
    ) {
      adminId = meId;
    }
  }
  if (!adminId) {
    adminId = pickAdmin(Array.from(memberIds), fallbackHouse?.adminId || null);
  }
  const adminWpNumeric = adminWpId !== undefined && adminWpId !== null ? Number(adminWpId) : null;
  const adminWpClean = Number.isNaN(adminWpNumeric)
    ? fallbackHouse?.adminWpId ?? null
    : adminWpNumeric;
  const inviteCode = remote.invite_code || remote.inviteCode || fallbackHouse?.inviteCode || "";
  const currency = (remote.currency || fallbackHouse?.currency || "USD").toUpperCase();
  const house = {
    id: houseId,
    name: remote.name || fallbackHouse?.name || "House",
    inviteCode,
    currency,
    memberIds: Array.from(memberIds),
    adminId,
    adminWpId: adminWpClean
  };
  return { users: workingUsers, house };
}

export function detachUserFromOtherHouses(houses, userId, keepHouseId, users = []) {
  return houses
    .filter(h => h.id !== keepHouseId)
    .map(h => {
      if (!Array.isArray(h.memberIds) || !h.memberIds.includes(userId)) return h;
      const memberIds = h.memberIds.filter(id => id !== userId);
      const adminId = h.adminId === userId ? pickAdmin(memberIds, null) : h.adminId;
      let adminWpId = h.adminWpId;
      if (h.adminId === userId) {
        const nextAdmin = users.find(u => u.id === adminId);
        adminWpId = nextAdmin?.wpId ?? null;
      }
      return { ...h, memberIds, adminId, adminWpId };
    })
    .filter(h => (h.memberIds || []).length > 0);
}
