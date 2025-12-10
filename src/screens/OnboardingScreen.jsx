import React, { useState } from "react";

export default function OnboardingScreen({ me, actions }) {
  const [houseName, setHouseName] = useState("");
  const [code, setCode] = useState("");

  return (
    <div className="panel">
      <div className="panel-title">Onboarding</div>
      <div className="h1">Welcome{me?.name ? `, ${me.name}` : ""}</div>
      <div className="small">Create or join a house to start using chores.</div>

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
            <button className="btn" onClick={() => actions.createHouse(houseName)}>
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
            placeholder="6-digit code"
          />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn secondary" onClick={() => actions.joinHouse(code)}>
              Join
            </button>
          </div>
          <div className="small" style={{ marginTop: 6 }}>Demo code: 123456</div>
        </div>
      </div>
    </div>
  );
}
