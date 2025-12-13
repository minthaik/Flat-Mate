const getBaseUrl = () => (process.env.WP_BASE_URL || "https://backend.paxbud.com").replace(/\/$/, "");

const buildAuthHeader = (req) => {
  const incoming = req.headers.authorization;
  const wpUser = process.env.WP_USER;
  const wpPass = process.env.WP_APP_PW;
  const fallback = wpUser && wpPass ? `Basic ${Buffer.from(`${wpUser}:${wpPass}`).toString("base64")}` : null;
  return {
    header: incoming || fallback,
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

const withFallback = async (url, opts, basicAuth, incomingAuth) => {
  const resp = await fetch(url, opts);
  if (!resp.ok && (resp.status === 401 || resp.status === 403) && basicAuth && incomingAuth) {
    const retryHeaders = { ...(opts.headers || {}), Authorization: basicAuth };
    return fetch(url, { ...opts, headers: retryHeaders });
  }
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
      const resp = await withFallback(
        baseEndpoint,
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json"
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
      const resp = await withFallback(
        `${baseEndpoint}/${encodeURIComponent(commentId)}`,
        {
          method: "DELETE",
          headers: { Authorization: authHeader }
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
