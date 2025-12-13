import React, { useMemo, useState } from "react";
import { uid } from "../store/utils";

const categories = ["Rent", "Utilities", "Groceries", "Supplies", "Transport", "Other"];

export default function FinanceScreen({ me, house, houseUsers = [], expenses = [], actions, onBack }) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Other");
  const [isShared, setIsShared] = useState(true);
  const [note, setNote] = useState("");
  const [showForm, setShowForm] = useState(false);

  const currency = (house?.currency || "USD").toUpperCase();
  const currencySymbols = {
    USD: "$",
    EUR: "EUR ",
    GBP: "GBP ",
    AUD: "AUD ",
    CAD: "CAD ",
    JPY: "JPY ",
    INR: "INR ",
    CNY: "CNY ",
    KRW: "KRW ",
    SGD: "SGD ",
    NZD: "NZD ",
    CHF: "CHF ",
    SEK: "SEK ",
    NOK: "NOK ",
    DKK: "DKK ",
    HKD: "HKD ",
    MXN: "MXN ",
    BRL: "BRL ",
    ZAR: "ZAR ",
    TRY: "TRY ",
    IDR: "IDR ",
    PHP: "PHP ",
    TWD: "TWD ",
    THB: "THB ",
    PLN: "PLN ",
    AED: "AED "
  };
  const currencySymbol = currencySymbols[currency] || `${currency} `;
  const fmt = (amt) => `${currencySymbol}${Number(amt || 0).toFixed(2)}`;

  const userLookup = useMemo(() => {
    const map = new Map();
    houseUsers.forEach(u => map.set(u.id, u));
    return map;
  }, [houseUsers]);

  function renderPayLinks(handles, amount) {
    const links = [];
    if (handles?.paypal) {
      const paypalUrl = handles.paypal.startsWith("http")
        ? handles.paypal
        : `https://paypal.me/${handles.paypal.replace(/^https?:\/\/paypal\.me\//, "")}/${amount.toFixed(2)}`;
      links.push(
        <a className="btn secondary small" key="pp" href={paypalUrl} target="_blank" rel="noreferrer">
          <span className="material-symbols-outlined" aria-hidden="true">payments</span>
          <span>PayPal</span>
        </a>
      );
    }
    if (handles?.venmo) {
      const venmoUser = handles.venmo.replace("@", "");
      const venmoUrl = `https://venmo.com/u/${venmoUser}`;
      links.push(
        <a className="btn ghost small" key="vm" href={venmoUrl} target="_blank" rel="noreferrer">
          <span className="material-symbols-outlined" aria-hidden="true">send_money</span>
          <span>Venmo</span>
        </a>
      );
    }
    if (links.length === 0) return null;
    return (
      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 6 }}>
        {links}
      </div>
    );
  }

  const participants = houseUsers.filter(u => isShared ? house?.memberIds?.includes(u.id) : u.id === me?.id);

  const debts = useMemo(() => {
    const items = [];
    expenses.forEach(exp => {
      if (exp.type !== "shared" || !exp.participantIds?.length) return;
      const participants = Array.from(new Set(exp.participantIds));
      const share = participants.length ? exp.amount / participants.length : 0;
      participants.forEach(pid => {
        if (pid === exp.payerId) return;
        items.push({
          from: pid,
          to: exp.payerId,
          amount: share,
          title: exp.title
        });
      });
    });
    return items;
  }, [expenses]);

  const owes = useMemo(() => {
    const map = new Map();
    debts.filter(d => d.from === me?.id).forEach(d => {
      map.set(d.to, (map.get(d.to) || 0) + d.amount);
    });
    return Array.from(map.entries()).map(([to, total]) => ({ user: userLookup.get(to), total }));
  }, [debts, me?.id, userLookup]);

  const owedToMe = useMemo(() => {
    const map = new Map();
    debts.filter(d => d.to === me?.id).forEach(d => {
      map.set(d.from, (map.get(d.from) || 0) + d.amount);
    });
    return Array.from(map.entries()).map(([from, total]) => ({ user: userLookup.get(from), total }));
  }, [debts, me?.id, userLookup]);

  const monthOverview = useMemo(() => {
    const now = new Date();
    const startTs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const monthLabel = now.toLocaleString("default", { month: "short", year: "numeric" });
    const thisMonth = expenses.filter(e => {
      const ts = e.createdAt ? new Date(e.createdAt).getTime() : 0;
      return ts >= startTs;
    });
    const shared = thisMonth.filter(e => e.type === "shared");
    const personal = thisMonth.filter(e => e.type === "personal" && e.payerId === me?.id);
    const sum = arr => arr.reduce((acc, e) => acc + Number(e.amount || 0), 0);
    return {
      monthLabel,
      sharedTotal: sum(shared),
      personalTotal: sum(personal),
      sharedCount: shared.length,
      personalCount: personal.length
    };
  }, [expenses, me?.id]);

  function addExpense(e) {
    e.preventDefault();
    const amt = Number(amount);
    if (!me || !house || !title.trim() || !amt) return;
    const participantIds = isShared
      ? Array.from(new Set([...(house.memberIds || []), me.id]))
      : [me.id];
    actions.addExpense({
      id: uid("expense"),
      houseId: house.id,
      title: title.trim(),
      amount: amt,
      category,
      type: isShared ? "shared" : "personal",
      payerId: me.id,
      participantIds,
      createdAt: new Date().toISOString(),
      note: note.trim()
    });
    setTitle("");
    setAmount("");
    setNote("");
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="section-title" style={{ margin: 0 }}>Finance</div>
        {onBack && (
          <button className="btn ghost small" onClick={onBack}>
            <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
            <span>Back</span>
          </button>
        )}
      </div>
      <div className="panel">
        <div className="panel-title" style={{ marginTop: 0, marginBottom: 12 }}>Overview</div>
        <div className="grid two">
          <div className="card" style={{ padding: "18px 12px", border: "1px solid var(--md-field-border-strong)", borderRadius: "12px", background: "linear-gradient(135deg, var(--md-sys-color-primary-container), var(--md-sys-color-secondary-container))", color: "var(--md-sys-color-on-primary-container)", display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="small muted" style={{ color: "inherit", opacity: 0.9 }}>{monthOverview.monthLabel} shared</div>
            <div className="h2" style={{ margin: "4px 0", color: "inherit" }}>{fmt(monthOverview.sharedTotal)}</div>
            <div className="small muted" style={{ color: "inherit", opacity: 0.9 }}>{monthOverview.sharedCount} shared expenses</div>
          </div>
          <div className="card" style={{ padding: "18px 12px", border: "1px solid var(--md-field-border-strong)", borderRadius: "12px", background: "linear-gradient(135deg, var(--md-sys-color-secondary-container), var(--md-sys-color-surface-variant))", color: "var(--md-sys-color-on-secondary-container)", display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="small muted" style={{ color: "inherit", opacity: 0.9 }}>{monthOverview.monthLabel} personal</div>
            <div className="h2" style={{ margin: "4px 0", color: "inherit" }}>{fmt(monthOverview.personalTotal)}</div>
            <div className="small muted" style={{ color: "inherit", opacity: 0.9 }}>{monthOverview.personalCount} personal expenses</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className="panel-title" style={{ margin: 0 }}>Add expense</div>
          <button className="btn ghost small" onClick={() => setShowForm(v => !v)}>
            <span className="material-symbols-outlined" aria-hidden="true">{showForm ? "expand_less" : "expand_more"}</span>
            <span>{showForm ? "Hide" : "Show"}</span>
          </button>
        </div>
        {showForm && (
          <form className="stack" onSubmit={addExpense}>
            <label className="stack" style={{ gap: 6 }}>
              <span className="small">Title</span>
              <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., Power bill" required />
            </label>
            <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
              <label className="stack" style={{ gap: 6, flex: "1 1 120px" }}>
                <span className="small">Amount</span>
                <input className="input" type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required />
              </label>
              <label className="stack" style={{ gap: 6, flex: "1 1 120px" }}>
                <span className="small">Category</span>
                <select value={category} onChange={e => setCategory(e.target.value)}>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <div className="row" style={{ gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <label className="row" style={{ gap: 6 }}>
                <input type="radio" checked={isShared} onChange={() => setIsShared(true)} />
                <span className="small">Shared</span>
              </label>
              <label className="row" style={{ gap: 6 }}>
                <input type="radio" checked={!isShared} onChange={() => setIsShared(false)} />
                <span className="small">Personal</span>
              </label>
            </div>
            <label className="stack" style={{ gap: 6 }}>
              <span className="small">Notes (optional)</span>
              <textarea className="input" rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Add context" />
            </label>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
              <div className="small muted">
                Payer: {me?.name || "You"} - Participants: {participants.length}
              </div>
              <button className="btn small" type="submit" disabled={!title.trim() || !Number(amount)}>
                <span className="material-symbols-outlined" aria-hidden="true">add</span>
                <span>Add expense</span>
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="section-title" style={{ marginTop: 8 }}>Balances</div>
      <div className="panel stack" style={{ gap: 20 }}>
        <div className="stack" style={{ gap: 12 }}>
          <div className="panel-title" style={{ margin: 0 }}>You owe</div>
          {owes.length === 0 && <div className="small muted">Nothing owed right now.</div>}
          {owes.map(({ user, total }, idx) => {
            const debtsToUser = debts.filter(d => d.from === me?.id && d.to === user?.id);
            return (
              <div
                key={user?.id || idx}
                className="card"
                style={{ padding: "10px 0", borderBottom: idx === owes.length - 1 ? "none" : "1px solid var(--md-sys-color-outline)" }}
              >
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <div className="row" style={{ gap: 10, alignItems: "center" }}>
                    <div className="avatar-mark" style={{ width: 32, height: 32 }}>
                      <img src={(user?.photo || "/avatars/avatar-happy.svg")} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                    <span className="h3" style={{ margin: 0 }}>{user?.name || "Unknown"}</span>
                  </div>
                  <span className="small" style={{ color: "var(--md-sys-color-danger)" }}>
                    You owe {fmt(total)}
                  </span>
                </div>
                {debtsToUser.length > 0 && (
                  <div className="stack" style={{ marginTop: 8, gap: 6 }}>
                    {debtsToUser.map((d, i) => {
                      const linePay = renderPayLinks(user, d.amount);
                      return (
                        <div key={i} className="stack" style={{ gap: 4 }}>
                          <div className="small muted">
                            {d.title}: {fmt(d.amount)} to {user?.name || "payer"}
                          </div>
                          {linePay && (
                            <div style={{ marginTop: 6 }}>
                              {linePay}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="stack" style={{ gap: 12 }}>
          <div className="panel-title" style={{ margin: 0 }}>Owed to you</div>
          {owedToMe.length === 0 && <div className="small muted">No one owes you right now.</div>}
          {owedToMe.map(({ user, total }, idx) => {
            const debtsFromUser = debts.filter(d => d.to === me?.id && d.from === user?.id);
            return (
              <div
                key={user?.id || idx}
                className="card"
                style={{ padding: "10px 0", borderBottom: idx === owedToMe.length - 1 ? "none" : "1px solid var(--md-sys-color-outline)" }}
              >
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <div className="row" style={{ gap: 10, alignItems: "center" }}>
                    <div className="avatar-mark" style={{ width: 32, height: 32 }}>
                      <img src={(user?.photo || "/avatars/avatar-happy.svg")} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                    <span className="h3" style={{ margin: 0 }}>{user?.name || "Unknown"}</span>
                  </div>
                  <span className="small" style={{ color: "var(--md-sys-color-primary)" }}>
                    Owes you {fmt(total)}
                  </span>
                </div>
                {debtsFromUser.length > 0 && (
                  <div className="stack" style={{ marginTop: 8, gap: 6 }}>
                    {debtsFromUser.map((d, i) => (
                      <div key={i} className="small muted">
                        {d.title}: {fmt(d.amount)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="section-title" style={{ marginTop: 8 }}>Recent expenses</div>
      <div className="panel">
        <div className="stack">
          {expenses.slice().reverse().slice(0, 6).map((exp, idx, arr) => (
            <div
              key={exp.id}
              className="card"
              style={{ padding: "10px 0", borderBottom: idx === arr.length - 1 ? "none" : "1px solid var(--md-sys-color-outline)" }}
            >
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <div className="stack" style={{ gap: 4 }}>
                    <div className="h3" style={{ margin: 0 }}>{exp.title}</div>
                    <div className="small muted">
                      {exp.type === "shared" ? "Shared" : "Personal"} - {exp.category} - {new Date(exp.createdAt).toLocaleDateString()}
                    </div>
                    <div className="small muted">
                      Upfront by {userLookup.get(exp.payerId)?.name || "Unknown"}
                    </div>
                    {exp.note && <div className="small muted">{exp.note}</div>}
                  </div>
                  <div className="stack" style={{ alignItems: "flex-end", gap: 6 }}>
                  <div className="h3" style={{ margin: 0 }}>{fmt(Number(exp.amount))}</div>
                    <button className="btn ghost small" onClick={() => actions.deleteExpense(exp.id)}>
                      <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                      <span>Delete</span>
                    </button>
                  </div>
              </div>
            </div>
          ))}
          {expenses.length === 0 && <div className="small muted">No expenses yet.</div>}
        </div>
      </div>
    </div>
  );
}
