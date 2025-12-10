import React, { useState } from "react";

export default function AuthScreen({ actions }) {
  const [email, setEmail] = useState("alex@demo.com");
  const [name, setName] = useState("");

  return (
    <div className="panel">
      <div className="panel-title">Demo Authentication</div>

      <div className="stack">
        <div className="card">
          <div className="h2">Login</div>
          <input
            className="input"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="alex@demo.com"
          />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" onClick={() => actions.login(email)}>Login</button>
          </div>
          <div className="small" style={{ marginTop: 6 }}>
            Seed users: alex@demo.com, sam@demo.com, jordan@demo.com
          </div>
        </div>

        <div className="card">
          <div className="h2">Signup (demo)</div>
          <input
            className="input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Name"
          />
          <input
            className="input"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email"
            style={{ marginTop: 8 }}
          />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn secondary" onClick={() => actions.signup(name, email)}>
              Create demo account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
