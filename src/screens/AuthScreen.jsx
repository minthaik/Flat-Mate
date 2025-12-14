import React, { useState } from "react";

export default function AuthScreen({ actions, onAuthToken }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const resp = await fetch("/api/wp-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await resp.json();
      if (!resp.ok || !data?.token) {
        throw new Error(data?.error || data?.message || "Login failed");
      }
      if (onAuthToken) {
        onAuthToken(data.token);
      }
      // fetch profile
      const meResp = await fetch("/api/wp-me", {
        headers: { Authorization: `Bearer ${data.token}` }
      });
      const meData = await meResp.json();
      // map to existing demo user or create one if needed
      const email = meData?.email || `${data.user_nicename || username}@unknown`;
      const name = meData?.name || data.user_display_name || data.user_nicename || username;
      const profile = { name, wpId: meData?.id || data?.user?.id || data?.user_id };
      const existing = actions?.login ? actions.login(email, profile) : false;
      if (!existing && actions?.signup) {
        actions.signup(name, email, profile);
      }
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const resp = await fetch("/api/wp-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password, firstName, lastName })
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error || data?.message || "Signup failed");
      }

      // If we got a token, store it and load profile for consistency.
      const token = data?.token;
      if (token && onAuthToken) {
        onAuthToken(token);
      }

      let profile = null;
      if (token) {
        const meResp = await fetch("/api/wp-me", {
          headers: { Authorization: `Bearer ${token}` }
        });
        profile = await meResp.json().catch(() => null);
      }

      const finalEmail = (profile?.email || email || data?.user?.email || "").trim();
      const displayName =
        profile?.name ||
        [firstName, lastName].filter(Boolean).join(" ").trim() ||
        data?.user?.name ||
        username;

      const nextProfile = { name: displayName, wpId: profile?.id || data?.user?.id || null };
      if (actions?.signup) {
        actions.signup(displayName, finalEmail, nextProfile);
      }
      if (actions?.login) {
        actions.login(finalEmail, nextProfile);
      }
    } catch (err) {
      setError(err.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  const isSignup = mode === "signup";
  const submitDisabled = loading || !password || (!username && !email) || (isSignup && (!email || !firstName));
  const onSubmit = isSignup ? handleSignup : handleLogin;

  return (
    <div className="panel">
      <div className="panel-title">Account</div>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          className={`btn small ${!isSignup ? "" : "ghost"}`}
          onClick={() => setMode("login")}
          disabled={mode === "login"}
        >
          Login
        </button>
        <button
          type="button"
          className={`btn small ${isSignup ? "" : "ghost"}`}
          onClick={() => setMode("signup")}
          disabled={mode === "signup"}
        >
          Sign up
        </button>
      </div>
      <form className="stack" onSubmit={onSubmit}>
        <input
          className="input"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="Username"
          required
        />
        {isSignup && (
          <>
            <input
              className="input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              required
            />
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="First name"
                required
              />
              <input
                className="input"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Last name"
              />
            </div>
          </>
        )}
        <input
          className="input"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          required
        />
        {error && <div className="small" style={{ color: "var(--md-sys-color-danger)" }}>{error}</div>}
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn" type="submit" disabled={submitDisabled}>
            <span>{isSignup ? "Sign up" : "Login"}</span>
          </button>
        </div>
        <div className="small muted">
          {isSignup
            ? "Create your account with name and password."
            : "Use your account username/email and password."}
        </div>
      </form>
    </div>
  );
}
