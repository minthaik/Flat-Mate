import React, { useEffect, useMemo, useRef, useState } from "react";

export default function TodosScreen({ me, houseUsers = [], todoLists = [], actions }) {
  const [newListTitle, setNewListTitle] = useState("");
  const [newListItems, setNewListItems] = useState([{ id: "item-1", text: "" }]);
  const [newListShared, setNewListShared] = useState(false);
  const [newListMembers, setNewListMembers] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [listFilter, setListFilter] = useState("all");
  const [taskInputs, setTaskInputs] = useState({});
  const [pendingSelectNew, setPendingSelectNew] = useState(false);

  const listTitleRef = useRef(null);
  const prevListCount = useRef(0);

  const genId = () => `todo_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 6)}`;

  const filteredLists = useMemo(() => {
    if (listFilter === "my") return todoLists.filter(l => l.visibility === "personal");
    if (listFilter === "shared") return todoLists.filter(l => l.visibility === "shared");
    return todoLists;
  }, [todoLists, listFilter]);

  useEffect(() => {
    if (listTitleRef.current && showCreateForm) {
      listTitleRef.current.focus();
    }
  }, [showCreateForm]);

  useEffect(() => {
    const count = todoLists.length;
    if (pendingSelectNew && count > prevListCount.current) {
      const last = todoLists[count - 1];
      if (last) {
        setTaskInputs(prev => ({ ...prev, [last.id]: "" }));
      }
      setPendingSelectNew(false);
    }
    prevListCount.current = count;
  }, [todoLists, pendingSelectNew]);

  function createList() {
    const items = newListItems.map(i => (i.text || "").trim()).filter(Boolean);
    if (!newListTitle.trim() || items.length === 0 || !me) return;

    const memberIds = newListShared
      ? Array.from(new Set([me.id, ...(newListMembers || [])]))
      : [me.id];
    const tasks = items.map(text => ({ id: genId(), title: text, isDone: false }));

    actions.addTodoList({
      title: newListTitle.trim(),
      ownerId: me.id,
      visibility: newListShared ? "shared" : "personal",
      memberIds,
      tasks
    });

    setNewListTitle("");
    setNewListItems([{ id: genId(), text: "" }]);
    setNewListShared(false);
    setNewListMembers([]);
    setShowCreateForm(false);
    setPendingSelectNew(true);
  }

  function addTask(listId) {
    const title = (taskInputs[listId] || "").trim();
    if (!title) return;
    actions.addTodoItem(listId, { id: genId(), title, isDone: false });
    setTaskInputs(prev => ({ ...prev, [listId]: "" }));
  }

  return (
    <>
      <div className="section-title">To-Dos</div>
      <div className="stack">
        <div className="panel">
          <div className="stack">
            <div className="create-list-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)" }}>
              <div className="panel-title" style={{ margin: 0, paddingBottom: 0, borderBottom: "none" }}>Create list</div>
              {!showCreateForm && (
                <button className="btn secondary small" onClick={() => setShowCreateForm(true)}>
                  <span className="material-symbols-outlined" aria-hidden="true">add</span>
                  <span>New List</span>
                </button>
              )}
            </div>
            {showCreateForm && (
              <div className="stack" style={{ gap: "var(--space-3)" }}>
                <div className="row" style={{ flexWrap: "wrap", gap: "var(--space-2)" }}>
                  <input
                    className="input"
                    placeholder="List title"
                    value={newListTitle}
                    onChange={e => setNewListTitle(e.target.value)}
                    ref={listTitleRef}
                    style={{ flex: "1 1 240px", minWidth: 0 }}
                  />
                </div>
                <div className="stack">
                  <div className="small">List items</div>
                  <div className="list">
                    {newListItems.map((item, idx) => (
                      <div key={item.id} className="row" style={{ gap: "var(--space-2)" }}>
                        <input
                          className="input"
                          placeholder={`Item ${idx + 1}`}
                          value={item.text}
                          onChange={e => {
                            const text = e.target.value;
                            setNewListItems(prev => prev.map(it => it.id === item.id ? { ...it, text } : it));
                          }}
                          style={{ flex: "1 1 240px", minWidth: 0 }}
                        />
                        {newListItems.length > 1 && (
                          <button
                            className="btn ghost small"
                            onClick={() => setNewListItems(prev => prev.filter(it => it.id !== item.id))}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="row" style={{ gap: "var(--space-2)" }}>
                    <button
                      className="btn ghost small"
                      onClick={() => setNewListItems(prev => [...prev, { id: genId(), text: "" }])}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">add</span>
                      <span>Add item</span>
                    </button>
                  </div>
                </div>
                <label className="check" style={{ marginTop: "var(--space-2)" }}>
                  <input
                    type="checkbox"
                    checked={newListShared}
                    onChange={e => setNewListShared(e.target.checked)}
                  />
                  <div className="small" style={{ fontWeight: 400 }}>Shared with roommates</div>
                </label>
                {newListShared && (
                  <div className="stack">
                    <div className="small">Select members</div>
                    <div className="list">
                      {houseUsers.filter(u => u.id !== me?.id).map(u => (
                        <label key={u.id} className="check">
                          <input
                            type="checkbox"
                            checked={(newListMembers || []).includes(u.id)}
                            onChange={e => {
                              const checked = e.target.checked;
                              setNewListMembers(prev => {
                                if (checked) return Array.from(new Set([...prev, u.id]));
                                return prev.filter(id => id !== u.id);
                              });
                            }}
                          />
                          <div className="small" style={{ fontWeight: 400 }}>{u.name}</div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div className="row" style={{ justifyContent: "flex-end", gap: "var(--space-2)" }}>
                  <button
                    className="btn danger"
                    onClick={() => {
                      setShowCreateForm(false);
                      setNewListTitle("");
                      setNewListItems([{ id: "item-1", text: "" }]);
                      setNewListShared(false);
                      setNewListMembers([]);
                    }}
                  >
                    Cancel
                  </button>
                  <button className="btn" onClick={createList} disabled={!newListTitle.trim() || newListItems.every(i => !i.text.trim())}>
                    <span>Save</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="stack">
            <div className="card">
              <div className="panel-title">Lists</div>
              <div className="row" style={{ flexWrap: "wrap", gap: "var(--space-2)" }}>
                {["all", "my", "shared"].map(f => (
                  <button
                    key={f}
                    className={`btn ghost small ${listFilter === f ? "selected" : ""}`}
                    onClick={() => setListFilter(f)}
                  >
                    {f === "all" ? "All" : f === "my" ? "My lists" : "Shared with me"}
                  </button>
                ))}
              </div>
              <div style={{ height: "var(--space-3)" }} />
              {filteredLists.length === 0 && <div className="small">No lists found.</div>}
              <div className="list">
                {filteredLists.map(list => {
                  const done = (list.tasks || []).filter(t => t.isDone).length;
                  const total = (list.tasks || []).length || 1;
                  const pct = Math.round((done / total) * 100);
                  const owner = houseUsers.find(u => u.id === list.ownerId);
                  return (
                    <div key={list.id} className="todo-list-card">
                      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                        <span className="h2" style={{ margin: 0 }}>{list.title}</span>
                        <span className={`pill ${list.visibility === "shared" ? "shared" : "personal"}`}>
                          {list.visibility === "shared" ? "Shared" : "Personal"}
                        </span>
                      </div>
                      <div className="small">
                        {list.visibility === "shared"
                          ? `Owner: ${owner?.name || "Unknown"} · ${list.memberIds?.length || 1} member(s)`
                          : `${owner?.name || "Me"} · ${list.memberIds?.length || 1} member(s)`}
                      </div>
                      <div className="progress">
                        <div className="progress-bar" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="small">{done} / {total} done</div>

                      <div className="stack" style={{ marginTop: "var(--space-3)" }}>
                        <div className="row" style={{ flexWrap: "wrap", gap: "var(--space-2)" }}>
                          <input
                            className="input"
                            placeholder="New task"
                            value={taskInputs[list.id] || ""}
                            onChange={e => setTaskInputs(prev => ({ ...prev, [list.id]: e.target.value }))}
                            style={{ flex: "1 1 200px", minWidth: 0 }}
                          />
                          <button className="btn secondary small" style={{ flexShrink: 0 }} onClick={() => addTask(list.id)} disabled={!((taskInputs[list.id] || "").trim())}>
                            <span className="material-symbols-outlined" aria-hidden="true">add</span>
                            <span>Add Task</span>
                          </button>
                        </div>
                        <div className="list">
                          {(list.tasks || []).length === 0 && <div className="small">No tasks.</div>}
                          {(list.tasks || []).map(task => (
                            <div key={task.id} className="row task-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                              <label className="row" style={{ flex: 1, gap: "var(--space-2)" }}>
                                <input
                                  type="checkbox"
                                  checked={!!task.isDone}
                                  onChange={() => actions.toggleTodoItem(list.id, task.id)}
                                />
                                <span className="small" style={{ textDecoration: task.isDone ? "line-through" : "none" }}>
                                  {task.title}
                                </span>
                              </label>
                              <div className="row task-actions" style={{ gap: 6 }}>
                                <button
                                  className="btn ghost small"
                                  onClick={() => actions.toggleTodoItem(list.id, task.id)}
                                >
                                  {task.isDone ? "Undo" : "Complete"}
                                </button>
                                <button
                                  className="btn ghost small"
                                  onClick={() => actions.deleteTodoItem(list.id, task.id)}
                                  disabled={!task.isDone}
                                  title={!task.isDone ? "Mark complete first" : "Delete task"}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="row" style={{ justifyContent: "flex-end", gap: "var(--space-2)" }}>
                          <button
                            className="btn danger"
                            onClick={() => actions.deleteTodoList(list.id)}
                            disabled={(list.tasks || []).some(t => !t.isDone)}
                            title={(list.tasks || []).some(t => !t.isDone) ? "Complete all tasks to delete list" : "Delete list"}
                          >
                            Delete list
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
