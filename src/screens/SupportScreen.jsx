import React, { useMemo, useState } from "react";

const categories = [
  { id: "bug", label: "Bug / Issue" },
  { id: "feature", label: "Feature request" },
  { id: "ux", label: "UX / Usability" },
  { id: "other", label: "Other" }
];

const severities = [
  { id: "blocker", label: "Blocking" },
  { id: "high", label: "High" },
  { id: "normal", label: "Normal" }
];

export default function SupportScreen({ me, house, onBack }) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("bug");
  const [severity, setSeverity] = useState("normal");
  const [details, setDetails] = useState("");
  const [email, setEmail] = useState(me?.email || "");
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const deviceMeta = useMemo(() => {
    return `${navigator.userAgent || ""}`;
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitted(false);
    setSending(true);
    try {
      const resp = await fetch("/api/send-support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          category,
          severity,
          details,
          email,
          deviceMeta,
          houseName: house?.name,
          userName: me?.name,
          userEmail: me?.email
        })
      });
      if (!resp.ok) {
        const data = await resp.json().catch(async () => {
          const t = await resp.text().catch(() => "");
          return { detail: t };
        });
        const msg = data.error || data.detail || "Failed to send";
        throw new Error(msg);
      }
      setSubmitted(true);
      setSubject("");
      setDetails("");
    } catch (err) {
      setError(err.message || "Could not send message");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div className="section-title">Support & Feedback</div>
        {onBack && (
          <button className="btn ghost small" onClick={onBack}>
            <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
            <span>Back</span>
          </button>
        )}
      </div>

      <div className="panel">
        <div className="small" style={{ marginTop: 6, marginBottom: 12 }}>
          Tell us what’s not working or what you’d like to see next. Include steps or screenshots if possible.
        </div>

        <form className="stack" onSubmit={handleSubmit}>
          <label className="stack" style={{ gap: 6 }}>
            <span className="small">Subject</span>
            <input
              className="input"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Short summary"
              required
            />
          </label>

          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            <label className="stack" style={{ gap: 6, flex: "1 1 160px" }}>
              <span className="small">Category</span>
              <select value={category} onChange={e => setCategory(e.target.value)}>
                {categories.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
              </select>
            </label>
            <label className="stack" style={{ gap: 6, flex: "1 1 160px" }}>
              <span className="small">Severity</span>
              <select value={severity} onChange={e => setSeverity(e.target.value)}>
                {severities.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
              </select>
            </label>
          </div>

          <label className="stack" style={{ gap: 6 }}>
            <span className="small">Details</span>
            <textarea
              className="input"
              rows={4}
              value={details}
              onChange={e => setDetails(e.target.value)}
              placeholder="Steps to reproduce, expected vs actual, or your idea"
              required
            />
          </label>

          <label className="stack" style={{ gap: 6 }}>
            <span className="small">Contact email (optional)</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>

          <div className="stack" style={{ gap: 6 }}>
            <span className="small">Included automatically</span>
            <div
              className="small muted"
              style={{
                fontSize: 12,
                whiteSpace: "normal",
                wordBreak: "break-word",
                lineHeight: 1.4
              }}
            >
              {house?.name ? `House: ${house.name}` : "No house selected"} · {deviceMeta}
            </div>
          </div>

          <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
            <button type="button" className="btn ghost small" onClick={() => onBack?.()}>Cancel</button>
            <button type="submit" className="btn small" disabled={sending || !subject.trim() || !details.trim()}>
              {sending && <span className="material-symbols-outlined" aria-hidden="true">hourglass_empty</span>}
              <span>Send feedback</span>
            </button>
          </div>

          {error && <div className="small" style={{ color: "var(--md-sys-color-danger)" }}>{error}</div>}
          {submitted && (
            <div className="small" style={{ color: "var(--md-sys-color-primary)" }}>
              Thanks! We received your feedback.
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
