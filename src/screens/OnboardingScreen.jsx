import React, { useState } from "react";

export default function OnboardingScreen({ me, actions }) {
  const [houseName, setHouseName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  async function handleCreate() {
    if (!houseName.trim()) return;
    setLoading(true);
    setError("");
    try {
      const invite = code.trim().toUpperCase();
      const resp = await fetch("/api/wp-houses", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ name: houseName.trim() })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || data?.message || "Failed to create house");
      actions.createHouse({
        name: houseName.trim(),
        id: data.id,
        houseId: data.id,
        inviteCode: data.invite_code,
        currency: data.currency
      });
    } catch (err) {
      setError(err.message || "Could not create house");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/wp-houses", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ action: "join", inviteCode: invite })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || data?.message || "Failed to join house");
      actions.joinHouse({
        inviteCode: invite,
        house: data.house || data
      });
    } catch (err) {
      setError(err.message || "Could not join house");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-title">Onboarding</div>
      <div className="h1">Welcome{me?.name ? `, ${me.name}` : ""}</div>
      <div className="small">Create or join a house to start using chores.</div>

      {error && <div className="small" style={{ color: "var(--md-sys-color-danger)", marginTop: 8 }}>{error}</div>}

      <div className="grid two">
        <div className="card">
          <div className="h2">Create House</div>
          <input
            className="input"
            value={houseName}
            onChange={e => setHouseName(e.target.value)}
            placeholder="House name"
          />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" onClick={handleCreate} disabled={loading || !houseName.trim()}>
              Create
            </button>
          </div>
        </div>

        <div className="card">
          <div className="h2">Join House</div>
          <input
            className="input"
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="Invite code"
          />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn secondary" onClick={handleJoin} disabled={loading || !code.trim()}>
              Join
            </button>
          </div>
          <div className="small" style={{ marginTop: 6 }}>Use the invite code from another member.</div>
        </div>
      </div>
    </div>
  );
}
