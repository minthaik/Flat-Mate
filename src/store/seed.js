import { uid, addDays } from "./utils";

const houseId = uid("house");

const alexId = uid("user");
const samId = uid("user");
const jordanId = uid("user");

export const SEED_DB = {
  users: [
    { id: alexId, name: "Alex", email: "alex@demo.com", houseId, status: "HOME", dndUntil: null, tagline: "Here to help", avatarColor: "#7ea0ff", notifications: { push: true, email: false } },
    { id: samId, name: "Sam", email: "sam@demo.com", houseId, status: "AWAY", dndUntil: null, tagline: "Back later", avatarColor: "#5c9dff", notifications: { push: true, email: false } },
    { id: jordanId, name: "Jordan", email: "jordan@demo.com", houseId, status: "HOME", dndUntil: null, tagline: "", avatarColor: "#31c48d", notifications: { push: true, email: false } }
  ],
  houses: [
    { id: houseId, name: "Demo House", inviteCode: "123456", memberIds: [alexId, samId, jordanId], adminId: alexId }
  ],
  guests: [
    {
      id: uid("guest"),
      houseId,
      name: "Mom visiting",
      arrivesAt: addDays(new Date().toISOString(), 3),
      note: "Staying for the weekend",
      hostId: alexId
    }
  ],
  chores: [
    {
      id: uid("chore"),
      houseId,
      title: "Trash",
      notes: "",
      createdAt: new Date().toISOString(),
      state: "ACTIVE",
      cadenceDays: 7,
      startAt: new Date().toISOString(),
      endAt: null,
      rotation: [alexId, samId, jordanId],
      rotationIndex: 0,
      assigneeId: alexId,
      dueAt: addDays(new Date().toISOString(), 1),
      checklist: [
        { id: uid("item"), label: "Replace bag", required: true, isDone: false },
        { id: uid("item"), label: "Wipe bin rim", required: true, isDone: false }
      ]
    }
  ],
  todoLists: [
    {
      id: uid("todo_list"),
      title: "My errands",
      ownerId: alexId,
      visibility: "personal",
      memberIds: [alexId],
      tasks: [
        { id: uid("todo"), title: "Buy groceries", isDone: false },
        { id: uid("todo"), title: "Call utilities", isDone: true }
      ]
    },
    {
      id: uid("todo_list"),
      title: "Shared setup",
      ownerId: alexId,
      visibility: "shared",
      memberIds: [alexId, samId, jordanId],
      tasks: [
        { id: uid("todo"), title: "Set up Wi‑Fi", isDone: true, assigneeId: samId },
        { id: uid("todo"), title: "Split bills spreadsheet", isDone: false, assigneeId: jordanId }
      ]
    }
  ]
};
