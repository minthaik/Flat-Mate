const WP_BASE = process.env.WP_BASE_URL || "https://backend.paxbud.com";

function buildAuth(req) {
  const incomingAuth = req.headers.authorization;
  const wpUser = process.env.WP_USER;
  const wpPass = process.env.WP_APP_PW;
  const basic = wpUser && wpPass ? `Basic ${Buffer.from(`${wpUser}:${wpPass}`).toString("base64")}` : null;
  const authHeader = incomingAuth || basic;
  return { authHeader, basic, incomingAuth };
}

async function fetchWithFallback(url, opts, basic, incomingAuth) {
  const resp = await fetch(url, opts);
  if (!resp.ok && (resp.status === 401 || resp.status === 403) && basic && incomingAuth) {
    const retryHeaders = { ...(opts.headers || {}), Authorization: basic };
    return fetch(url, { ...opts, headers: retryHeaders });
  }
  return resp;
}

export default async function handler(req, res) {
  const { authHeader, basic, incomingAuth } = buildAuth(req);
  if (!authHeader) return res.status(401).json({ error: "Authorization header required" });
  const base = WP_BASE.replace(/\/$/, "");
  const endpoint = `${base}/wp-json/flatmate/v1/chores`;

  try {
    if (req.method === "GET") {
      const houseId = req.query.houseId;
      if (!houseId) return res.status(400).json({ error: "houseId required" });
      const url = `${endpoint}?houseId=${encodeURIComponent(houseId)}`;
      const resp = await fetchWithFallback(url, { headers: { Authorization: authHeader } }, basic, incomingAuth);
      const data = await resp.json().catch(() => ({}));
      return res.status(resp.status).json(data);
    }

    if (req.method === "POST") {
      const body = req.body || {};
      if (!body.houseId || !body.title) {
        return res.status(400).json({ error: "houseId and title required" });
      }
      const resp = await fetchWithFallback(endpoint, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }, basic, incomingAuth);
      const data = await resp.json().catch(() => ({}));
      return res.status(resp.status).json(data);
    }

    if (req.method === "PATCH") {
      const { id, ...rest } = req.body || {};
      if (!id) return res.status(400).json({ error: "id required" });
      const resp = await fetchWithFallback(`${endpoint}/${id}`, {
        method: "PATCH",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(rest)
      }, basic, incomingAuth);
      const data = await resp.json().catch(() => ({}));
      return res.status(resp.status).json(data);
    }

    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: "id required" });
      const resp = await fetchWithFallback(`${endpoint}/${id}`, {
        method: "DELETE",
        headers: { Authorization: authHeader }
      }, basic, incomingAuth);
      const data = await resp.json().catch(() => ({}));
      return res.status(resp.status).json(data);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: "WP chores proxy failed", detail: err?.message || "Unknown error" });
  }
}
