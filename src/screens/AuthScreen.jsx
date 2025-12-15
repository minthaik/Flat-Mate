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
        headers: { Authorization: `Flatmate ${data.token}` }
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
          headers: { Authorization: `Flatmate ${token}` }
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
    <section className="auth-screen">
      <div className="auth-shell">
        <div className="auth-hero">
          <div className="auth-logo">
            <img src="/paxbud-logo.svg" alt="Paxbud logo" />
          </div>
          <div className="auth-hero__text">
            <p className="eyebrow">Paxbud</p>
            <h1 className="auth-headline">Live better together</h1>
            <p className="small muted">
              Keep bills, chores, and conversations in sync for every roommate. Sign in to open the home base.
            </p>
          </div>
        </div>

        <div className="auth-card panel">
          <div className="auth-toggle" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              className={`auth-toggle__btn ${!isSignup ? "is-active" : ""}`}
              onClick={() => setMode("login")}
              aria-pressed={!isSignup}
            >
              Login
            </button>
            <button
              type="button"
              className={`auth-toggle__btn ${isSignup ? "is-active" : ""}`}
              onClick={() => setMode("signup")}
              aria-pressed={isSignup}
            >
              Sign up
            </button>
          </div>

          <form className="auth-form" onSubmit={onSubmit}>
            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-username">Username</label>
              <input
                id="auth-username"
                className="input"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="roommate123"
                required
              />
            </div>

            {isSignup && (
              <>
                <div className="auth-field">
                  <label className="auth-label" htmlFor="auth-email">Email</label>
                  <input
                    id="auth-email"
                    className="input"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    required
                  />
                </div>
                <div className="auth-field auth-field--split">
                  <div>
                    <label className="auth-label" htmlFor="auth-first">First name</label>
                    <input
                      id="auth-first"
                      className="input"
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      placeholder="Ava"
                      required
                    />
                  </div>
                  <div>
                    <label className="auth-label" htmlFor="auth-last">Last name</label>
                    <input
                      id="auth-last"
                      className="input"
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      placeholder="Lee"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                className="input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="auth-error" role="alert">
                {error}
              </div>
            )}

            <button className="btn auth-submit" type="submit" disabled={submitDisabled}>
              <span>{isSignup ? "Create account" : "Continue"}</span>
            </button>
            <div className="auth-hint small muted">
              {isSignup
                ? "Your housemates will be notified when you join the space."
                : "Forgot credentials? Ping your house admin to reset access."}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
