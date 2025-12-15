import React, { useMemo } from "react";
import { isHouseAdmin as domainIsHouseAdmin } from "../domain/houses";

const AVATAR_PRESETS = [
  { id: "happy", src: "/avatars/avatar-happy.svg", accent: "#7ea0ff" },
  { id: "cool", src: "/avatars/avatar-cool.svg", accent: "#31c48d" },
  { id: "cat", src: "/avatars/avatar-cat.svg", accent: "#f5c44f" },
  { id: "dog", src: "/avatars/avatar-dog.svg", accent: "#ff7b7b" }
];

function avatarSrc(user) {
  if (user?.photo) return user.photo;
  const preset = AVATAR_PRESETS.find(p => p.id === user?.avatarPreset) || AVATAR_PRESETS[0];
  return preset?.src || "/avatars/avatar-happy.svg";
}

export default function RoommatesScreen({ me, house, houseUsers = [], onBack }) {
  const list = useMemo(() => {
    const sorted = [...houseUsers];
    sorted.sort((a, b) => {
      const aAdmin = domainIsHouseAdmin(a, house);
      const bAdmin = domainIsHouseAdmin(b, house);
      if (aAdmin && !bAdmin) return -1;
      if (!aAdmin && bAdmin) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });
    return sorted;
  }, [houseUsers, house?.adminId, house?.adminWpId]);

  const formatDndCountdown = useMemo(() => {
    return (until) => {
      if (!until) return null;
      const target = new Date(until).getTime();
      if (Number.isNaN(target)) return null;
      const diff = target - Date.now();
      if (diff <= 0) return "wraps now";
      const mins = Math.max(1, Math.round(diff / 60000));
      const hours = Math.floor(mins / 60);
      const rem = mins % 60;
      if (hours > 0) return `${hours}h ${rem}m left`;
      return `${rem}m left`;
    };
  }, []);

  return (
    <div className="roommates-screen stack">
      <div className="roommates-header">
        <div className="section-title">Roommates</div>
        {onBack && (
          <button className="btn ghost small" onClick={onBack}>
            <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
            <span>Back</span>
          </button>
        )}
      </div>

      <div className="stack" style={{ gap: 16 }}>
        {list.length === 0 && (
          <div className="panel roommates-empty">
            <span className="material-symbols-outlined" aria-hidden="true">group</span>
            <div>
              <div className="h3" style={{ margin: 0 }}>No roommates yet</div>
              <p className="small muted" style={{ margin: "4px 0 0" }}>Invite your crew to Paxbud to collaborate.</p>
            </div>
          </div>
        )}

        {list.map(u => {
          const isAdmin = domainIsHouseAdmin(u, house);
          const status = (u.status || "HOME").toUpperCase();
          const statusClass =
            status === "DND" ? "dnd" :
            status === "AWAY" ? "away" :
            status === "OUT" ? "out" : "home";
          const phone = (u.phone || "").trim();
          const phoneHref = phone ? `tel:${phone.replace(/[^+0-9]/g, "") || phone}` : null;
          const dndCountdown = status === "DND" ? formatDndCountdown(u.dndUntil) : null;
          return (
            <article key={u.id} className="panel roommate-panel">
              <div className="roommate-panel__body">
                <div className="roommate-avatar">
                  <img src={avatarSrc(u)} alt="" />
                </div>
                <div className="roommate-info">
                  <div className="roommate-name-row">
                    <span className="roommate-name">{u.name || "Housemate"}</span>
                    {isAdmin && <span className="chip chip-admin">Admin</span>}
                  </div>
                  <div className="roommate-status-row">
                    <span className={`pill ${statusClass}`}>{status}</span>
                    {dndCountdown && <span className="roommate-dnd">{dndCountdown}</span>}
                  </div>
                  <p className="roommate-note small muted">
                    {u.statusNote || u.tagline || "No note shared yet."}
                  </p>
                </div>
              </div>
              <div className="roommate-panel__actions">
                <a className="chip-button" href={`mailto:${u.email || ""}`} aria-label={`Email ${u.name || "housemate"}`}>
                  <span className="material-symbols-outlined" aria-hidden="true">mail</span>
                  <span>Email</span>
                </a>
                <a
                  className={`chip-button ${!phone ? "is-disabled" : ""}`}
                  href={phoneHref || undefined}
                  aria-label={phone ? `Call ${u.name || "housemate"}` : "Phone unavailable"}
                  onClick={e => { if (!phone) e.preventDefault(); }}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">call</span>
                  <span>Call</span>
                </a>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
