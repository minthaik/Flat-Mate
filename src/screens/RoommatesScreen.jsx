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

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div className="section-title">Roommates</div>
        {onBack && (
          <button className="btn ghost small" onClick={onBack}>
            <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
            <span>Back</span>
          </button>
        )}
      </div>
      <div className="panel">
        <div className="small" style={{ marginTop: 6, marginBottom: 12 }}>
          Tap to email or call your housemates. Respect DND/away before calling.
        </div>

        <div className="stack">
          {list.map((u, idx) => {
            const isAdmin = domainIsHouseAdmin(u, house);
            const statusClass = u.status === "DND" ? "dnd" : u.status === "AWAY" ? "away" : u.status === "OUT" ? "out" : "home";
            const phone = (u.phone || "").trim();
            const phoneHref = phone ? `tel:${phone.replace(/[^+0-9]/g, "") || phone}` : null;
            return (
              <div
                key={u.id}
                className="card"
                style={{
                  padding: "14px 0",
                  borderBottom: idx === list.length - 1 ? "none" : "1px solid var(--md-sys-color-outline)"
                }}
              >
                <div className="row" style={{ gap: 12, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div className="row" style={{ gap: 12, alignItems: "center", flex: "1 1 220px", minWidth: 0 }}>
                    <div className="avatar-mark" style={{ width: 56, height: 56 }}>
                      <img src={avatarSrc(u)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                    <div className="stack" style={{ gap: 6, minWidth: 0 }}>
                      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <div className="h3" style={{ margin: 0 }}>{u.name}</div>
                        {isAdmin && (
                          <span
                            className="pill"
                            style={{
                              background: "rgba(220, 38, 38, 0.12)",
                              color: "#b91c1c",
                              border: "1px solid rgba(185, 28, 28, 0.3)",
                              fontSize: 11,
                              padding: "4px 10px"
                            }}
                          >
                            Admin
                          </span>
                        )}
                      </div>
                      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                        <span className={`pill ${statusClass}`} style={{ fontSize: 11, padding: "4px 10px" }}>
                          {u.status || "HOME"}
                        </span>
                        {u.email && <span className="small muted">{u.email}</span>}
                      </div>
                      <div className="small muted" style={{ lineHeight: 1.4, wordBreak: "break-word" }}>
                        {u.statusNote || u.tagline || "No note set"}
                      </div>
                    </div>
                  </div>
                  <div className="row" style={{ gap: 8, minWidth: "200px", justifyContent: "flex-end", flex: "0 0 auto" }}>
                    <a className="btn secondary small" href={`mailto:${u.email || ""}`} aria-label={`Email ${u.name}`}>
                      <span className="material-symbols-outlined" aria-hidden="true">mail</span>
                      <span>Email</span>
                    </a>
                    <a
                      className="btn ghost small"
                      href={phoneHref || undefined}
                      aria-label={phone ? `Call ${u.name}` : "Phone unavailable"}
                      style={!phone ? { opacity: 0.5, cursor: "not-allowed" } : {}}
                      onClick={e => { if (!phone) e.preventDefault(); }}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">call</span>
                      <span>Call</span>
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
