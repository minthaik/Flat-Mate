export function getCurrentUser(state) {
  return state.db.users.find(u => u.id === state.currentUserId) || null;
}

export function getHouse(state, me) {
  if (!me?.houseId) return null;
  return state.db.houses.find(h => h.id === me.houseId) || null;
}

export function getHouseUsers(state, me) {
  const house = getHouse(state, me);
  if (!house) return [];
  return state.db.users.filter(u => house.memberIds.includes(u.id));
}

export function getHouseChores(state, me) {
  if (!me?.houseId) return [];
  return (state.db.chores || []).filter(c => c.houseId === me.houseId);
}

export function getHouseGuests(state, me) {
  if (!me?.houseId) return [];
  return (state.db.guests || []).filter(g => g.houseId === me.houseId);
}

export function getHouseNotes(state, me) {
  if (!me?.houseId) return [];
  return (state.db.notes || []).filter(n => n.houseId === me.houseId);
}

export function getTodoLists(state, me) {
  if (!me) return [];
  return (state.db.todoLists || []).filter(l => {
    if (l.visibility === "personal") return l.ownerId === me.id;
    if (l.visibility === "shared") return l.memberIds?.includes(me.id);
    return false;
  });
}

export function getHouseExpenses(state, me) {
  if (!me?.houseId) return [];
  return (state.db.expenses || []).filter(e => e.houseId === me.houseId);
}
