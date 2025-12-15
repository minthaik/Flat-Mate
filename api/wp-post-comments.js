const getBaseUrl = () => (process.env.WP_BASE_URL || "https://backend.paxbud.com").replace(/\/$/, "");

const buildAuthHeader = (req) => {
  const incoming = req.headers.authorization;
    const wpUser = null;
  const wpPass = null;
  const fallback = null;
  return {
    header: incoming,
    basic: fallback,
    incoming
  };
};

const parseResponse = async (resp) => {
  const contentType = resp.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return resp.json();
  }
  const text = await resp.text().catch(() => "");
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const fetchActorId = async (wpBase, incomingAuth) => {
  if (!incomingAuth || typeof incomingAuth !== "string") {
    return null;
  }
  const lower = incomingAuth.toLowerCase();
  if (!lower.startsWith("bearer ") && !lower.startsWith("flatmate ")) {
    return null;
  }
  try {
    const resp = await fetch(`${wpBase}/wp-json/wp/v2/users/me`, {
      headers: { Authorization: incomingAuth }
    });
    return resp;
};

export default async function handler(req, res) {
  const { header: authHeader, basic: basicAuth, incoming: incomingAuth } = buildAuthHeader(req);
  if (!authHeader) {
    return res.status(401).json({ error: "Authorization header required" });
  }

  const WP_BASE = getBaseUrl();
  const { postId, commentId, page, per_page: perPage } = req.query;
  if (!postId) {
    return res.status(400).json({ error: "postId required" });
  }
  const baseEndpoint = `${WP_BASE}/wp-json/flatmate/v1/posts/${encodeURIComponent(postId)}/comments`;

  try {
    if (req.method === "GET") {
      const qs = new URLSearchParams();
      if (page) qs.set("page", page);
      if (perPage) qs.set("per_page", perPage);
      const suffix = qs.toString() ? `?${qs}` : "";
      const resp = await withFallback(
        `${baseEndpoint}${suffix}`,
        { headers: { Authorization: authHeader } },
        basicAuth,
        incomingAuth
      );
      const data = await parseResponse(resp);
      return res.status(resp.status).json(data);
    }

    if (req.method === "POST") {
      const payload = req.body || {};
      if (!payload.text) {
        return res.status(400).json({ error: "text required" });
      }
      const actorId = await fetchActorId(WP_BASE, incomingAuth);
      const resp = await withFallback(
        baseEndpoint,
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
            ...(actorId ? { "X-Flatmate-Actor": String(actorId) } : {})
          },
          body: JSON.stringify(payload)
        },
        basicAuth,
        incomingAuth
      );
      const data = await parseResponse(resp);
      return res.status(resp.status).json(data);
    }

    if (req.method === "DELETE") {
      if (!commentId) {
        return res.status(400).json({ error: "commentId required" });
      }
      const actorId = await fetchActorId(WP_BASE, incomingAuth);
      const resp = await withFallback(
        `${baseEndpoint}/${encodeURIComponent(commentId)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: authHeader,
            ...(actorId ? { "X-Flatmate-Actor": String(actorId) } : {})
          }
        },
        basicAuth,
        incomingAuth
      );
      const data = await parseResponse(resp);
      return res.status(resp.status).json(data);
    }

    res.setHeader("Allow", "GET,POST,DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: "WP post comments proxy failed", detail: err?.message || "Unknown error" });
  }
}
