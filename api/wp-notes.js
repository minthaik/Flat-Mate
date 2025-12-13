export default async function handler(req, res) {
  const wpUser = process.env.WP_USER;
  const wpPass = process.env.WP_APP_PW;
  const WP_BASE = process.env.WP_BASE_URL || "https://backend.paxbud.com";

  const incomingAuth = req.headers.authorization; // e.g., Bearer token from frontend
  const basicAuth = wpUser && wpPass ? Buffer.from(`${wpUser}:${wpPass}`).toString("base64") : null;
  const authHeader = incomingAuth || (basicAuth ? `Basic ${basicAuth}` : null);
  if (!authHeader) {
    return res.status(401).json({ error: "Authorization header required" });
  }
  const endpoint = `${WP_BASE.replace(/\/$/, "")}/wp-json/flatmate/v1/notes`;

  // Helper: make a request, and if bearer fails with 401/403, retry once with Basic (if available)
  const fetchWithFallback = async (url, opts = {}) => {
    const resp = await fetch(url, opts);
    if (!resp.ok && (resp.status === 401 || resp.status === 403) && basicAuth && incomingAuth) {
      const retryHeaders = { ...(opts.headers || {}), Authorization: `Basic ${basicAuth}` };
      return fetch(url, { ...opts, headers: retryHeaders });
    }
    return resp;
  };

  try {
    if (req.method === "GET") {
      const houseId = req.query.houseId;
      if (!houseId) return res.status(400).json({ error: "houseId required" });
      const resp = await fetchWithFallback(`${endpoint}?houseId=${encodeURIComponent(houseId)}`, {
        headers: { Authorization: authHeader }
      });
      const data = await resp.json().catch(async () => {
        const t = await resp.text().catch(() => "");
        return { message: t };
      });
      return res.status(resp.status).json(data);
    }

    if (req.method === "POST") {
      const body = req.body || {};
      if (!body.houseId || !body.text) {
        return res.status(400).json({ error: "houseId and text required" });
      }
      const resp = await fetchWithFallback(endpoint, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      const data = await resp.json().catch(async () => {
        const t = await resp.text().catch(() => "");
        return { message: t };
      });
      return res.status(resp.status).json(data);
    }

    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: "id required" });
      let resp = await fetchWithFallback(`${endpoint}/${id}`, {
        method: "DELETE",
        headers: { Authorization: authHeader }
      });
      if (!resp.ok) {
        // Some WP handlers only accept POST for deletes; fallback to POST
        resp = await fetchWithFallback(`${endpoint}/${id}`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ _method: "DELETE" })
        });
      }
      const data = await resp.json().catch(async () => {
        const t = await resp.text().catch(() => "");
        return { message: t };
      });
      return res.status(resp.status).json(data);
    }

    if (req.method === "PATCH") {
      const { id, pinned, text } = req.body || {};
      if (!id) return res.status(400).json({ error: "id required" });
      let resp = await fetchWithFallback(`${endpoint}/${id}`, {
        method: "PATCH",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ pinned, text })
      });
      if (!resp.ok) {
        // Fallback for servers that only accept POST updates
        resp = await fetchWithFallback(`${endpoint}/${id}`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ pinned, text, _method: "PATCH" })
        });
      }
      const data = await resp.json().catch(async () => {
        const t = await resp.text().catch(() => "");
        return { message: t };
      });
      return res.status(resp.status).json(data);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: "WP proxy failed", detail: err?.message || "Unknown error" });
  }
}
