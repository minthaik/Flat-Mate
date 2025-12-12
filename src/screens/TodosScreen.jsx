import React, { useEffect, useMemo, useRef, useState } from "react";

export default function TodosScreen({ me, houseUsers = [], todoLists = [], actions }) {
  const [selectedListId, setSelectedListId] = useState(null);
  const [newListTitle, setNewListTitle] = useState("");
  const [newListItems, setNewListItems] = useState([{ id: "item-1", text: "" }]);
  const [newListShared, setNewListShared] = useState(false);
  const [newListMembers, setNewListMembers] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [taskFilter, setTaskFilter] = useState("all");
  const [pendingSelectNew, setPendingSelectNew] = useState(false);

  const tasksRef = useRef(null);
  const taskInputRef = useRef(null);
  const listTitleRef = useRef(null);
  const prevListCount = useRef(0);

  const genId = () => `todo_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 6)}`;

  const visibleLists = useMemo(() => todoLists, [todoLists]);
  const listsByVisibility = useMemo(() => ({
    personal: visibleLists.filter(l => l.visibility === "personal"),
    shared: visibleLists.filter(l => l.visibility === "shared")
  }), [visibleLists]);

  const selectedList = visibleLists.find(l => l.id === selectedListId) || visibleLists[0] || null;
  const allTasksDone = selectedList ? (selectedList.tasks || []).every(t => t.isDone) : false;
  const selectedProgress = selectedList
    ? Math.round(((selectedList.tasks || []).filter(t => t.isDone).length / Math.max((selectedList.tasks || []).length || 1, 1)) * 100)
    : 0;
  const filteredTasks = useMemo(() => {
    if (!selectedList) return [];
    const tasks = selectedList.tasks || [];
    if (taskFilter === "active") return tasks.filter(t => !t.isDone);
    if (taskFilter === "done") return tasks.filter(t => t.isDone);
    return tasks;
  }, [selectedList, taskFilter]);

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

  function addTask() {
    if (!selectedList || !newTaskTitle.trim()) return;
    actions.addTodoItem(selectedList.id, { title: newTaskTitle.trim(), isDone: false });
    setNewTaskTitle("");
  }

  useEffect(() => {
    const count = visibleLists.length;
    if (prevListCount.current === 0) prevListCount.current = count;
    if (pendingSelectNew && count > prevListCount.current) {
      const last = visibleLists[count - 1];
      if (last) {
        setSelectedListId(last.id);
      }
      setPendingSelectNew(false);
    }
    prevListCount.current = count;
  }, [visibleLists, pendingSelectNew]);

  useEffect(() => {
    if (tasksRef.current) {
      tasksRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (taskInputRef.current) {
      taskInputRef.current.focus();
    }
  }, [selectedListId]);

  useEffect(() => {
    if (listTitleRef.current && showCreateForm) {
      listTitleRef.current.focus();
    }
  }, [showCreateForm]);

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
              {visibleLists.length === 0 && <div className="small">No lists yet.</div>}
              <div className="list">
                {listsByVisibility.personal.length > 0 && (
                  <>
                    <div className="small">My lists</div>
                    {listsByVisibility.personal.map(list => {
                      const done = (list.tasks || []).filter(t => t.isDone).length;
                      const total = (list.tasks || []).length || 1;
                      const pct = Math.round((done / total) * 100);
                      const owner = houseUsers.find(u => u.id === list.ownerId);
                      return (
                        <button
                          key={list.id}
                          className={`todo-list-card ${selectedList?.id === list.id ? "selected" : ""}`}
                          onClick={() => setSelectedListId(list.id)}
                        >
                          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                            <span className="h2" style={{ margin: 0 }}>{list.title}</span>
                            <span className="pill personal">Personal</span>
                          </div>
                          <div className="small">{owner?.name || "Me"} · {list.memberIds?.length || 1} member(s)</div>
                          <div className="progress">
                            <div className="progress-bar" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="small">{done} / {total} done</div>
                        </button>
                      );
                    })}
                  </>
                )}

                {listsByVisibility.shared.length > 0 && (
                  <>
                    <div className="small" style={{ marginTop: "var(--space-3)" }}>Shared with me</div>
                    {listsByVisibility.shared.map(list => {
                      const done = (list.tasks || []).filter(t => t.isDone).length;
                      const total = (list.tasks || []).length || 1;
                      const pct = Math.round((done / total) * 100);
                      const owner = houseUsers.find(u => u.id === list.ownerId);
                      return (
                        <button
                          key={list.id}
                          className={`todo-list-card ${selectedList?.id === list.id ? "selected" : ""}`}
                          onClick={() => setSelectedListId(list.id)}
                        >
                          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                            <span className="h2" style={{ margin: 0 }}>{list.title}</span>
                            <span className="pill shared">Shared</span>
                          </div>
                          <div className="small">Owner: {owner?.name || "Unknown"} · {list.memberIds?.length || 1} member(s)</div>
                          <div className="progress">
                            <div className="progress-bar" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="small">{done} / {total} done</div>
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            </div>

            {selectedList && (
              <div className="card" ref={tasksRef}>
                <div className="panel-title">Tasks</div>
                <div className="stack">
                  <div className="row" style={{ flexWrap: "wrap", gap: "var(--space-2)" }}>
                    <input
                      className="input"
                      placeholder="New task"
                      value={newTaskTitle}
                      onChange={e => setNewTaskTitle(e.target.value)}
                      ref={taskInputRef}
                      style={{ flex: "1 1 200px", minWidth: 0 }}
                    />
                    <button className="btn secondary small" style={{ flexShrink: 0 }} onClick={addTask} disabled={!newTaskTitle.trim()}>
                      <span className="material-symbols-outlined" aria-hidden="true">add</span>
                      <span>Add Task</span>
                    </button>
                  </div>
                  <div className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
                    <div className="progress" style={{ flex: "1 1 120px" }}>
                      <div className="progress-bar" style={{ width: `${selectedProgress}%` }} />
                    </div>
                    <span className="small">{selectedProgress}% complete</span>
                  </div>
                  <div className="row" style={{ flexWrap: "wrap", gap: "var(--space-2)" }}>
                    {["all", "active", "done"].map(f => (
                      <button
                        key={f}
                        className={`btn ghost small ${taskFilter === f ? "selected" : ""}`}
                        onClick={() => setTaskFilter(f)}
                      >
                        {f === "all" ? "All" : f === "active" ? "Active" : "Done"}
                      </button>
                    ))}
                  </div>
                  <div className="list">
                    {filteredTasks.length === 0 && <div className="small">No tasks.</div>}
                    {filteredTasks.map(task => (
                      <div key={task.id} className="row task-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                        <label className="row" style={{ flex: 1, gap: "var(--space-2)" }}>
                          <input
                            type="checkbox"
                            checked={!!task.isDone}
                            onChange={() => actions.toggleTodoItem(selectedList.id, task.id)}
                          />
                          <span className="small" style={{ textDecoration: task.isDone ? "line-through" : "none" }}>
                            {task.title}
                          </span>
                        </label>
                        <div className="row task-actions" style={{ gap: 6 }}>
                          <button
                            className="btn ghost small"
                            onClick={() => actions.toggleTodoItem(selectedList.id, task.id)}
                          >
                            {task.isDone ? "Undo" : "Complete"}
                          </button>
                          <button
                            className="btn ghost small"
                            onClick={() => actions.deleteTodoItem(selectedList.id, task.id)}
                            disabled={!task.isDone}
                            title={!task.isDone ? "Mark complete first" : "Delete task"}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                    <button
                      className="btn danger"
                      onClick={() => actions.deleteTodoList(selectedList.id)}
                      disabled={!allTasksDone}
                      title={allTasksDone ? "Delete list" : "Complete all tasks to delete list"}
                    >
                      Delete list
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
