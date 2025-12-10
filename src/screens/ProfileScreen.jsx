import React, { useEffect, useState } from "react";
import { processProfilePhoto } from "../utils/media";

const COLORS = ["#7ea0ff", "#31c48d", "#f5c44f", "#ff7b7b", "#5c9dff"];

export default function ProfileScreen({ me, house, houseUsers = [], actions }) {
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [avatarColor, setAvatarColor] = useState(COLORS[0]);
  const [notifyPush, setNotifyPush] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [photoError, setPhotoError] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [houseName, setHouseName] = useState("");

  useEffect(() => {
    if (!me) return;
    setName(me.name || "");
    setTagline(me.tagline || "");
    setAvatarColor(me.avatarColor || COLORS[0]);
    setNotifyPush(me.notifications?.push ?? true);
    setNotifyEmail(me.notifications?.email ?? false);
    setPhoto(me.photo || null);
    setPhotoError("");
    const firstOther = houseUsers.find(u => u.id !== me.id);
    setTransferTo(firstOther?.id || "");
    setHouseName(house?.name || "");
  }, [me, houseUsers, house]);

  if (!me) {
    return <div className="panel"><div className="small">Please sign in to edit your profile.</div></div>;
  }

  function save() {
    actions.updateProfile(me.id, {
      name: name.trim() || me.name,
      tagline: tagline.trim(),
      avatarColor,
      notifications: { push: notifyPush, email: notifyEmail },
      photo
    });
  }

  function leaveHouse() {
    actions.leaveHouse(me.id);
  }

  function transferAdmin() {
    if (!transferTo) return;
    actions.transferAdmin(me.id, transferTo);
  }

  function regenerateInvite() {
    if (!house) return;
    actions.regenerateInvite(me.id, house.id);
  }

  function renameHouse() {
    if (!house) return;
    const clean = houseName.trim();
    if (!clean) return;
    actions.renameHouse(me.id, house.id, clean);
  }

  return (
    <div className="panel">
      <div className="panel-title">Profile</div>
      <div className="stack">
        <div className="row" style={{ alignItems: "center", gap: 12 }}>
          <div
            className="logo-mark"
            aria-hidden="true"
            style={{
              background: photo ? "transparent" : avatarColor,
              width: 100,
              height: 100,
              color: "#0b1b3a",
              border: "1px solid rgba(255,255,255,0.25)",
              overflow: "hidden",
              padding: 0
            }}
          >
            {photo ? (
              <img src={photo} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              me.name?.[0]?.toUpperCase() || "?"
            )}
          </div>
          <div className="stack">
            <div className="h2" style={{ margin: 0 }}>{me.name}</div>
            <div className="small">{me.email}</div>
            <div className="small">{house ? `House: ${house.name}` : "No house joined"}</div>
          </div>
        </div>

        <div>
          <div className="small">Name</div>
          <input className="input" value={name} onChange={e => setName(e.target.value)} />
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

        {house && (
          <div className="card">
            <div className="panel-title">House</div>
            {house.adminId === me.id && (
              <div className="stack">
                <div className="small">House name</div>
                <input className="input" value={houseName} onChange={e => setHouseName(e.target.value)} />
                <div className="row">
                  <button className="btn secondary" onClick={renameHouse} disabled={!houseName.trim()}>Save name</button>
                </div>
              </div>
            )}
            <div className="divider" />
            <div className="kv">
              <span>Name</span>
              <span>{house.name}</span>
            </div>
            <div className="divider" />
            <div className="kv">
              <span>Invite code</span>
              <span>{house.inviteCode}</span>
            </div>
            {house.adminId === me.id && (
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn secondary" onClick={regenerateInvite}>Regenerate code</button>
              </div>
            )}
            <div className="divider" />
            <div className="kv">
              <span>House admin</span>
              <span>
                {house.adminId === me.id
                  ? "You"
                  : (houseUsers.find(u => u.id === house.adminId)?.name || "Unassigned")}
              </span>
            </div>
            {house.adminId === me.id && houseUsers.length > 1 && (
              <>
                <div className="divider" />
                <div className="stack" style={{ marginTop: 6 }}>
                  <div className="small">Transfer admin to</div>
                  <select value={transferTo} onChange={e => setTransferTo(e.target.value)}>
                    <option value="">Select member</option>
                    {houseUsers.filter(u => u.id !== me.id).map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  <div className="row" style={{ marginTop: 6 }}>
                    <button className="btn secondary" onClick={transferAdmin} disabled={!transferTo}>Transfer admin</button>
                  </div>
                </div>
              </>
            )}
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn danger" onClick={leaveHouse}>Leave house</button>
            </div>
          </div>
        )}

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
