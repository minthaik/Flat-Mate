import React, { forwardRef, useImperativeHandle, useMemo, useState } from "react";

const ChoreDetailDialog = forwardRef(function ChoreDetailDialog({ me, houseUsers, chores, actions }, ref) {
  const [open, setOpen] = useState(false);
  const [choreId, setChoreId] = useState(null);

  useImperativeHandle(ref, () => ({
    open: (id) => {
      setChoreId(id);
      setOpen(true);
    }
  }), []);

  const chore = useMemo(() => (chores || []).find(c => c.id === choreId) || null, [chores, choreId]);
  const assignee = useMemo(() => houseUsers.find(u => u.id === chore?.assigneeId), [houseUsers, chore?.assigneeId]);

  if (!open) return null;

  const isMe = !!(chore && me && chore.assigneeId === me.id);
  const isEnded = chore?.state === "ENDED";

  const required = (chore?.checklist || []).filter(i => i.required);
  const requiredDone = required.every(i => i.isDone);
  const canComplete = required.length === 0 ? true : requiredDone;

  function toggleItem(itemId) {
    if (!chore) return;
    actions.toggleChoreItem(chore.id, itemId);
  }

  function complete() {
    if (!chore || !me) return;
    actions.completeChore(chore.id, me.id);
    setOpen(false);
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <div className="h2">{chore?.title || "Chore"}</div>
          <button className="btn secondary" onClick={() => setOpen(false)}>Close</button>
        </div>

        {!chore && <div className="small">Chore not found.</div>}

        {chore && (
          <div className="stack">
            <div className="card">
              <div className="kv"><span>Assignee</span><span>{assignee?.name || "Unassigned"}</span></div>
              <div className="kv"><span>Due</span><span>{chore.dueAt ? new Date(chore.dueAt).toLocaleDateString() : "-"}</span></div>
              <div className="kv"><span>Cadence</span><span>{chore.cadenceDays} days</span></div>
              <div className="kv"><span>Status</span><span>{chore.state}</span></div>
            </div>

            {chore.notes && (
              <div className="card">
                <div className="panel-title">Notes</div>
                <div className="small">{chore.notes}</div>
              </div>
            )}

            <div className="card">
              <div className="panel-title">Checklist</div>
              <div className="list">
                {(chore.checklist || []).length === 0 && (
                  <div className="small">No checklist items.</div>
                )}
                {(chore.checklist || []).map(item => (
                  <label key={item.id} className="check">
                    <input
                      type="checkbox"
                      checked={!!item.isDone}
                      onChange={() => toggleItem(item.id)}
                      disabled={isEnded}
                    />
                    <div>
                      <div>
                        {item.label}{" "}
                        {item.required && <span className="pill">required</span>}
                      </div>
                      {!item.required && <div className="small">Optional</div>}
                    </div>
                  </label>
                ))}
              </div>

              {required.length > 0 && !requiredDone && !isEnded && (
                <div className="small" style={{ marginTop: 8 }}>
                  Complete all required items to finish this chore.
                </div>
              )}
            </div>
          </div>
        )}

        <div className="modal-actions">
          {chore && me && chore.assigneeId !== me.id && !isEnded && (
            <div className="small" style={{ marginRight: "auto" }}>
              Only the assignee can complete this chore.
            </div>
          )}

          <button className="btn secondary" onClick={() => setOpen(false)}>Close</button>

          {chore && isMe && (
            <button
              className="btn"
              onClick={complete}
              disabled={!canComplete || isEnded}
            >
              Complete
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

export default ChoreDetailDialog;
