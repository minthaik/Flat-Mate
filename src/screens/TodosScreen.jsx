import React, { useMemo, useState } from "react";

export default function TodosScreen({ me, houseUsers = [], todoLists = [], actions }) {
  const [selectedListId, setSelectedListId] = useState(null);
  const [newListTitle, setNewListTitle] = useState("");
  const [newListShared, setNewListShared] = useState(false);
  const [newListMembers, setNewListMembers] = useState([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const visibleLists = useMemo(() => todoLists, [todoLists]);
  const selectedList = visibleLists.find(l => l.id === selectedListId) || visibleLists[0] || null;
  const allTasksDone = selectedList ? (selectedList.tasks || []).every(t => t.isDone) : false;

  function createList() {
    if (!newListTitle.trim() || !me) return;
    const memberIds = newListShared
      ? Array.from(new Set([me.id, ...(newListMembers || [])]))
      : [me.id];
    actions.addTodoList({
      title: newListTitle.trim(),
      ownerId: me.id,
      visibility: newListShared ? "shared" : "personal",
      memberIds,
      tasks: []
    });
    setNewListTitle("");
    setNewListShared(false);
    setNewListMembers([]);
    setShowCreateForm(false);
  }

  function addTask() {
    if (!selectedList || !newTaskTitle.trim()) return;
    actions.addTodoItem(selectedList.id, { title: newTaskTitle.trim(), isDone: false });
    setNewTaskTitle("");
  }

  return (
    <>
      <div className="section-title">To-Dos</div>
      <div className="panel">
        <div className="stack">
          <div className="card">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
              <div className="panel-title" style={{ margin: 0, paddingBottom: 0, borderBottom: "none" }}>Create list</div>
              {!showCreateForm && (
                <button className="btn secondary small" onClick={() => setShowCreateForm(true)}>
                  <span className="material-symbols-outlined" aria-hidden="true">add</span>
                  <span>New List</span>
                </button>
              )}
            </div>
            {showCreateForm && (
              <div className="stack">
                <input
                  className="input"
                  placeholder="List title"
                  value={newListTitle}
                  onChange={e => setNewListTitle(e.target.value)}
                />
                <label className="check">
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
                <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                  <button className="btn secondary small" onClick={() => { setShowCreateForm(false); setNewListTitle(""); setNewListShared(false); setNewListMembers([]); }}>
                    Cancel
                  </button>
                  <button className="btn secondary small" onClick={createList} disabled={!newListTitle.trim()}>
                    <span className="material-symbols-outlined" aria-hidden="true">add</span>
                    <span>Create List</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="panel-title">Lists</div>
            <div className="row" style={{ flexWrap: "wrap", gap: "8px" }}>
              {visibleLists.map(list => (
                <button
                  key={list.id}
                  className={`btn ghost todo-chip ${list.visibility === "shared" ? "shared" : "personal"} ${selectedList?.id === list.id ? "selected" : ""}`}
                  onClick={() => setSelectedListId(list.id)}
                  style={{ flex: "0 0 auto" }}
                >
                  {list.title} {list.visibility === "shared" ? "ƒ?› Shared" : "ƒ?› Personal"}
                </button>
              ))}
              {visibleLists.length === 0 && <div className="small">No lists yet.</div>}
            </div>
          </div>

          {selectedList && (
            <div className="card">
              <div className="panel-title">Tasks</div>
              <div className="stack">
                <div className="row">
                  <input
                    className="input"
                    placeholder="New task"
                    value={newTaskTitle}
                    onChange={e => setNewTaskTitle(e.target.value)}
                  />
                  <button className="btn secondary small" onClick={addTask} disabled={!newTaskTitle.trim()}>
                    <span className="material-symbols-outlined" aria-hidden="true">add</span>
                    <span>Add Task</span>
                  </button>
                </div>
                <div className="list">
                  {selectedList.tasks?.length === 0 && <div className="small">No tasks.</div>}
                  {selectedList.tasks?.map(task => (
                    <div key={task.id} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <label className="row" style={{ flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={!!task.isDone}
                          onChange={() => actions.toggleTodoItem(selectedList.id, task.id)}
                        />
                        <span className="small" style={{ textDecoration: task.isDone ? "line-through" : "none" }}>
                          {task.title}
                        </span>
                      </label>
                      <div className="row" style={{ gap: 6 }}>
                        <button
                          className="btn ghost"
                          onClick={() => actions.toggleTodoItem(selectedList.id, task.id)}
                        >
                          {task.isDone ? "Undo" : "Complete"}
                        </button>
                        <button
                          className="btn ghost"
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
    </>
  );
}
