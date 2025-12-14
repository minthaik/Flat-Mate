const WP_BASE = process.env.WP_BASE_URL || "https://backend.paxbud.com";

const getAuthHeader = (req) => req.headers.authorization;

const parseJsonOrText = async (resp) => {
  const text = await resp.text().catch(() => "");
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

export default async function handler(req, res) {
  const authHeader = getAuthHeader(req);
  if (!authHeader) {
    return res.status(401).json({ error: "Authorization header required" });
  }
  const endpoint = `${WP_BASE.replace(/\/$/, "")}/wp-json/flatmate/v1/notes`;

  try {
    if (req.method === "GET") {
      const houseId = req.query.houseId;
      if (!houseId) return res.status(400).json({ error: "houseId required" });
      const resp = await fetch(`${endpoint}?houseId=${encodeURIComponent(houseId)}`, {
        headers: { Authorization: authHeader }
      });
      const data = await parseJsonOrText(resp);
      return res.status(resp.status).json(data);
    }

    if (req.method === "POST") {
      const body = req.body || {};
      if (!body.houseId || !body.text) {
        return res.status(400).json({ error: "houseId and text required" });
      }
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      const data = await parseJsonOrText(resp);
      return res.status(resp.status).json(data);
    }

    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: "id required" });
      let resp = await fetch(`${endpoint}/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: authHeader }
      });
      if (!resp.ok) {
        resp = await fetch(`${endpoint}/${encodeURIComponent(id)}`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ _method: "DELETE" })
        });
      }
      const data = await parseJsonOrText(resp);
      return res.status(resp.status).json(data);
    }

    if (req.method === "PATCH") {
      const { id, pinned, text } = req.body || {};
      if (!id) return res.status(400).json({ error: "id required" });
      let resp = await fetch(`${endpoint}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ pinned, text })
      });
      if (!resp.ok) {
        resp = await fetch(`${endpoint}/${encodeURIComponent(id)}`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ pinned, text, _method: "PATCH" })
        });
      }
      const data = await parseJsonOrText(resp);
      return res.status(resp.status).json(data);
    }

    res.setHeader("Allow", "GET,POST,DELETE,PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: "WP proxy failed", detail: err?.message || "Unknown error" });
  }
}
