import React, { useEffect, useState } from "react";

const PRESETS = [
  { id: "happy", label: "Happy", src: "/avatars/avatar-happy.svg", accent: "#7ea0ff" },
  { id: "cool", label: "Cool", src: "/avatars/avatar-cool.svg", accent: "#31c48d" },
  { id: "cat", label: "Cat", src: "/avatars/avatar-cat.svg", accent: "#f5c44f" },
  { id: "dog", label: "Dog", src: "/avatars/avatar-dog.svg", accent: "#ff7b7b" },
  { id: "astro", label: "Astro", src: "/avatars/avatar-astro.svg", accent: "#5c9dff" },
  { id: "leaf", label: "Leaf", src: "/avatars/avatar-leaf.svg", accent: "#60b37a" }
];

const DEFAULT_PRESET_ID = PRESETS[0].id;

export default function ProfileScreen({ me, house, houseUsers = [], actions }) {
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [avatarColor, setAvatarColor] = useState(PRESETS.find(p => p.id === DEFAULT_PRESET_ID)?.accent || "#7ea0ff");
  const [notifyPush, setNotifyPush] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [transferTo, setTransferTo] = useState("");
  const [houseName, setHouseName] = useState("");
  const [avatarPreset, setAvatarPreset] = useState(DEFAULT_PRESET_ID);
  const [copied, setCopied] = useState(false);
  const [paypal, setPaypal] = useState("");
  const [venmo, setVenmo] = useState("");
  const [phone, setPhone] = useState("");
  const [dirty, setDirty] = useState(false);
  const [houseCurrency, setHouseCurrency] = useState("USD");
  const [houseError, setHouseError] = useState("");
  const [houseSaving, setHouseSaving] = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    if (!me) return;
    setName(me.name || "");
    setTagline(me.tagline || "");
    const presetId = me.avatarPreset || DEFAULT_PRESET_ID;
    setAvatarPreset(presetId);
    const presetAccent = PRESETS.find(p => p.id === presetId)?.accent;
    setAvatarColor(me.avatarColor || presetAccent || PRESETS[0].accent);
    setNotifyPush(me.notifications?.push ?? true);
    setNotifyEmail(me.notifications?.email ?? false);
    const firstOther = houseUsers.find(u => u.id !== me.id);
    setTransferTo(firstOther?.id || "");
    setHouseName(house?.name || "");
    setPaypal(me.paypal || "");
    setVenmo(me.venmo || "");
    setPhone(me.phone || "");
    setHouseCurrency(house?.currency || "USD");
  }, [me, houseUsers, house]);

  useEffect(() => {
    if (!me) return;
    const baseName = me.name || "";
    const baseTagline = me.tagline || "";
    const basePaypal = me.paypal || "";
    const baseVenmo = me.venmo || "";
    const basePhone = me.phone || "";
    const baseHouseCurrency = house?.currency || "USD";
    const baseAvatarPreset = me.avatarPreset || DEFAULT_PRESET_ID;
    const baseAvatarColor = me.avatarColor || PRESETS.find(p => p.id === baseAvatarPreset)?.accent || "#7ea0ff";
    const isDirty =
      name.trim() !== baseName ||
      tagline.trim() !== baseTagline ||
      paypal.trim() !== basePaypal ||
      venmo.trim() !== baseVenmo ||
      phone.trim() !== basePhone ||
      avatarPreset !== baseAvatarPreset ||
      avatarColor !== baseAvatarColor ||
      notifyPush !== (me.notifications?.push ?? true) ||
      notifyEmail !== (me.notifications?.email ?? false) ||
      (houseCurrency || "USD").toUpperCase() !== (baseHouseCurrency || "USD").toUpperCase();
    setDirty(isDirty);
  }, [name, tagline, paypal, venmo, phone, avatarPreset, avatarColor, notifyPush, notifyEmail, houseCurrency, me, house]);

  useEffect(() => {
    function handleBeforeUnload(e) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    if (dirty) {
      window.addEventListener("beforeunload", handleBeforeUnload);
    }
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [dirty]);

  if (!me) {
    return <div className="panel"><div className="small">Please sign in to edit your profile.</div></div>;
  }

  function saveProfile() {
    actions.updateProfile(me.id, {
      name: name.trim() || me.name,
      tagline: tagline.trim(),
      avatarColor,
      avatarPreset,
      notifications: { push: notifyPush, email: notifyEmail },
      paypal: paypal.trim(),
      venmo: venmo.trim(),
      phone: phone.trim()
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

  function copyInvite() {
    if (!house?.inviteCode || !navigator?.clipboard) return;
    navigator.clipboard.writeText(house.inviteCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  function renameHouse() {
    if (!house) return;
    const clean = houseName.trim();
    if (!clean) return;
    setHouseSaving(true);
    setHouseError("");
    fetch("/api/wp-houses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ id: house.id, name: clean })
    })
      .then(async resp => {
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data?.error || data?.message || "Failed to rename house");
        actions.renameHouse(me.id, house.id, clean);
      })
      .catch(err => setHouseError(err?.message || "Could not rename house"))
      .finally(() => setHouseSaving(false));
  }

  function updateCurrency() {
    if (!house) return;
    const clean = (houseCurrency || "USD").toUpperCase();
    setHouseSaving(true);
    setHouseError("");
    fetch("/api/wp-houses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ id: house.id, currency: clean })
    })
      .then(async resp => {
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data?.error || data?.message || "Failed to update currency");
        actions.setHouseCurrency?.(me.id, house.id, clean);
      })
      .catch(err => setHouseError(err?.message || "Could not update currency"))
      .finally(() => setHouseSaving(false));
  }

  const isAdmin = house?.adminId === me.id;
  const canSaveName = house && houseName.trim() && houseName.trim() !== house.name;
  const canSaveCurrency = house && (houseCurrency || "USD").toUpperCase() !== (house.currency || "USD");

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div className="section-title">Profile</div>
        {actions?.onBack && (
          <button
            className="btn ghost small"
            onClick={() => {
              if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) return;
              actions.onBack();
            }}
          >
            <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
            <span>Back</span>
          </button>
        )}
      </div>
      <div className="panel">
        <div className="stack">
        <div className="row" style={{ alignItems: "center", gap: 12 }}>
          <div
            className="logo-mark"
            aria-hidden="true"
            style={{
            background: "#f0f3fc",
            width: 100,
            height: 100,
            color: "#0b1b3a",
            border: "1px solid rgba(255,255,255,0.25)",
            overflow: "hidden",
                padding: 0,
                display: "grid",
            placeItems: "center",
            fontSize: avatarPreset ? 40 : 32,
            fontWeight: 700
          }}
          >
          {avatarPreset ? (
            <img src={PRESETS.find(p => p.id === avatarPreset)?.src} alt={avatarPreset} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
            <div className="small">Phone</div>
            <input
              className="input"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+1 555 123 4567"
            />
          </div>

          <div className="card">
            <div className="panel-title">Avatar</div>
            <div className="stack">
              <div className="small">Choose a character</div>
              <div className="row" style={{ flexWrap: "wrap", gap: "var(--space-2)" }}>
                {PRESETS.map(p => (
                  <button
                    key={p.id}
                    className={`btn ghost small ${avatarPreset === p.id ? "selected" : ""}`}
                    onClick={() => {
                      setAvatarPreset(p.id);
                      setAvatarColor(p.accent);
                    }}
                    style={{ padding: "6px 10px" }}
                  >
                    <img src={p.src} alt={p.label} style={{ width: 32, height: 32, borderRadius: "50%" }} />
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="panel-title">Notifications</div>
            <div className="stack" style={{ gap: "var(--space-2)" }}>
            <label className="check">
              <input type="checkbox" checked={notifyPush} onChange={e => setNotifyPush(e.target.checked)} />
              <div className="small" style={{ fontWeight: 400 }}>Push notifications</div>
            </label>
            <label className="check">
              <input type="checkbox" checked={notifyEmail} onChange={e => setNotifyEmail(e.target.checked)} />
              <div className="small" style={{ fontWeight: 400 }}>Email summaries</div>
            </label>
            </div>
          </div>

          <div className="card">
            <div className="panel-title">Payment handles</div>
            <div className="stack" style={{ gap: "var(--space-3)" }}>
              <div>
                <div className="small">PayPal.me link</div>
                <input
                  className="input"
                  value={paypal}
                  onChange={e => setPaypal(e.target.value)}
                  placeholder="https://paypal.me/yourname"
                />
              </div>
              <div>
                <div className="small">Venmo username</div>
                <input
                  className="input"
                  value={venmo}
                  onChange={e => setVenmo(e.target.value)}
                  placeholder="@yourname"
                />
              </div>
              <div className="small muted">Shared with roommates for direct payments. Funds flow via PayPal/Venmo; this app does not handle money.</div>
            </div>
          </div>

          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={saveProfile}>Save</button>
          </div>
        </div>
      </div>

      {house && (
        <div className="panel">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div className="panel-title">House</div>
            <span className={`pill ${isAdmin ? "ok" : "muted"}`} style={{ textTransform: "uppercase" }}>
              {isAdmin ? "Admin" : "Member"}
            </span>
          </div>

          <div className="stack" style={{ gap: "var(--space-3)" }}>
            <div className="stack">
              <div className="small" style={{ fontWeight: 600 }}>Name</div>
              <div className="row" style={{ alignItems: "center", gap: 8 }}>
                <span>{house.name}</span>
              </div>
              {isAdmin && (
                <div className="row" style={{ gap: 8 }}>
                  <input className="input" value={houseName} onChange={e => setHouseName(e.target.value)} placeholder="Rename house" />
                  <button className="btn secondary" onClick={renameHouse} disabled={!canSaveName || houseSaving}>Save</button>
                </div>
              )}
            </div>

            <div className="stack">
              <div className="small" style={{ fontWeight: 600 }}>Invite code</div>
              <div className="row" style={{ alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "monospace" }}>{house.inviteCode}</span>
                <button className="btn ghost small" onClick={copyInvite}>{copied ? "Copied" : "Copy"}</button>
                {isAdmin && (
                  <button className="btn ghost small" onClick={regenerateInvite}>Regenerate</button>
                )}
              </div>
              <div className="small" style={{ color: "var(--text-muted)" }}>Share this code to let roommates join.</div>
            </div>

            {isAdmin && (
              <div className="stack">
                <div className="small" style={{ fontWeight: 600 }}>Currency</div>
                <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    className="input"
                    list="currency-options"
                    value={houseCurrency}
                    onChange={e => setHouseCurrency(e.target.value.toUpperCase())}
                    placeholder="USD"
                    style={{ width: 160 }}
                  />
                  <datalist id="currency-options">
                    {["USD","EUR","GBP","AUD","CAD","JPY","INR","CNY","KRW","SGD","NZD","CHF","SEK","NOK","DKK","HKD","MXN","BRL","ZAR","TRY","IDR","PHP","TWD","THB","PLN","AED"].map(code => (
                      <option key={code} value={code} />
                    ))}
                  </datalist>
                  <button
                    className="btn ghost small"
                    style={{ minWidth: 160, height: 38 }}
                    onClick={updateCurrency}
                    disabled={!canSaveCurrency || houseSaving}
                  >
                    Save currency
                  </button>
                </div>
                <div className="small muted">Use a 3-letter code (ISO). Applies to amounts shown in Finance.</div>
              </div>
            )}

            {houseError && <div className="small" style={{ color: "var(--md-sys-color-danger)" }}>{houseError}</div>}

            <div className="stack">
              <div className="kv">
                <span>House admin</span>
                <span>
                  {house.adminId === me.id
                    ? "You"
                    : (houseUsers.find(u => u.id === house.adminId)?.name || "Unassigned")}
                </span>
              </div>

              {isAdmin && houseUsers.length > 1 && (
                <div className="stack">
                  <div className="small" style={{ fontWeight: 600 }}>Transfer admin to</div>
                  <select value={transferTo} onChange={e => setTransferTo(e.target.value)}>
                    <option value="">Select member</option>
                    {houseUsers.filter(u => u.id !== me.id).map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  <div className="stack" style={{ marginTop: 6, gap: 6, alignItems: "flex-start" }}>
                    <div className="small" style={{ color: "var(--text-muted)" }}>Transfers ownership immediately.</div>
                    <button className="btn secondary" style={{ width: "auto" }} onClick={transferAdmin} disabled={!transferTo}>Transfer admin</button>
                  </div>
                </div>
              )}
            </div>

            <div className="divider" />

            <div className="row" style={{ marginTop: 4 }}>
              <button className="btn danger" onClick={leaveHouse}>Leave house</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
