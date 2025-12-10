import React, { useEffect, useState } from "react";
import { processProfilePhoto } from "../utils/media";

const COLORS = ["#7ea0ff", "#31c48d", "#f5c44f", "#ff7b7b", "#5c9dff"];

export default function ProfileModal({ open, onClose, user, house, actions }) {
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [avatarColor, setAvatarColor] = useState(COLORS[0]);
  const [notifyPush, setNotifyPush] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [photoError, setPhotoError] = useState("");

  useEffect(() => {
    if (!open || !user) return;
    setName(user.name || "");
    setTagline(user.tagline || "");
    setAvatarColor(user.avatarColor || COLORS[0]);
    setNotifyPush(user.notifications?.push ?? true);
    setNotifyEmail(user.notifications?.email ?? false);
    setPhoto(user.photo || null);
    setPhotoError("");
  }, [open, user]);

  if (!open || !user) return null;

  function save() {
    actions.updateProfile(user.id, {
      name: name.trim() || user.name,
      tagline: tagline.trim(),
      avatarColor,
      notifications: { push: notifyPush, email: notifyEmail },
      photo
    });
    onClose();
  }

  function leaveHouse() {
    actions.leaveHouse(user.id);
    onClose();
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <div className="h2">Profile</div>
          <button className="btn secondary" onClick={onClose}>Close</button>
        </div>

        <div className="stack">
          <div className="row" style={{ alignItems: "center", gap: 12 }}>
            <div
              className="logo-mark"
              aria-hidden="true"
              style={{
                background: photo ? "transparent" : avatarColor,
                width: 44,
                height: 44,
                color: "#0b1b3a",
                border: "1px solid rgba(255,255,255,0.25)",
                overflow: "hidden",
                padding: 0
              }}
            >
              {photo ? (
                <img src={photo} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                user.name?.[0]?.toUpperCase() || "?"
              )}
            </div>
            <div className="small">
              {house ? `House: ${house.name}` : "No house joined"}
            </div>
          </div>

          <div>
            <div className="small">Name</div>
            <input className="input" value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div>
            <div className="small">Email</div>
            <input className="input" value={user.email} readOnly />
          </div>

          <div>
            <div className="small">Tagline</div>
            <input className="input" value={tagline} onChange={e => setTagline(e.target.value)} placeholder="Add a short status" />
          </div>

          <div>
            <div className="small" style={{ marginBottom: 6 }}>Avatar color</div>
            <div className="row">
              {COLORS.map(c => (
                <button
                  key={c}
                  className={`btn ghost ${avatarColor === c ? "selected" : ""}`}
                  onClick={() => setAvatarColor(c)}
                  style={{
                    width: 42,
                    height: 42,
                    padding: 0,
                    borderRadius: "50%",
                    borderColor: avatarColor === c ? "var(--md-field-border-strong)" : "var(--md-sys-color-outline)",
                    background: c,
                    boxShadow: avatarColor === c ? "0 0 0 2px var(--md-state-focus)" : "none"
                  }}
                  aria-label={`Choose color ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="card">
            <div className="panel-title">Notifications</div>
            <label className="check">
              <input type="checkbox" checked={notifyPush} onChange={e => setNotifyPush(e.target.checked)} />
              <div className="small" style={{ fontWeight: 400 }}>Push notifications</div>
            </label>
            <label className="check">
              <input type="checkbox" checked={notifyEmail} onChange={e => setNotifyEmail(e.target.checked)} />
              <div className="small" style={{ fontWeight: 400 }}>Email summaries</div>
            </label>
          </div>

          <div className="card">
            <div className="panel-title">Profile photo</div>
            <div className="stack">
              <input
                type="file"
                accept="image/*"
                onChange={async e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    setPhotoError("");
                    const processed = await processProfilePhoto(file);
                    setPhoto(processed);
                  } catch (err) {
                    setPhotoError(err?.message || "Unable to process image");
                  }
                }}
              />
              {photo && (
                <div className="row">
                  <button className="btn ghost" onClick={() => setPhoto(null)}>
                    Remove
                  </button>
                </div>
              )}
            </div>
            {photoError && <div className="small emphasis" style={{ color: "var(--md-sys-color-danger)" }}>{photoError}</div>}
          </div>

          {house && (
            <div className="card">
              <div className="panel-title">House</div>
              <div className="kv">
                <span>Name</span>
                <span>{house.name}</span>
              </div>
              <div className="kv">
                <span>Invite code</span>
                <span>{house.inviteCode}</span>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn danger" onClick={leaveHouse}>Leave house</button>
              </div>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
