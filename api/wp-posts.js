import { buffer } from "node:stream/consumers";

export const config = {
  api: {
    bodyParser: false
  }
};

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

const withFallback = async (url, opts, basicAuth, incomingAuth) => {
  const resp = await fetch(url, opts);
  if (!resp.ok && (resp.status === 401 || resp.status === 403) && basicAuth && incomingAuth) {
    const retryHeaders = { ...(opts.headers || {}), Authorization: basicAuth };
    return fetch(url, { ...opts, headers: retryHeaders });
  }
  return resp;
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

export default async function handler(req, res) {
  const { header: authHeader, basic: basicAuth, incoming: incomingAuth } = buildAuthHeader(req);
  if (!authHeader) {
    return res.status(401).json({ error: "Authorization header required" });
  }

  const WP_BASE = getBaseUrl();

  try {
    if (req.method === "GET") {
      const { houseId, postId, page, per_page: perPage, withComments } = req.query;
      const qs = new URLSearchParams();
      if (page) qs.set("page", page);
      if (perPage) qs.set("per_page", perPage);
      if (withComments) qs.set("withComments", withComments);
      const suffix = qs.toString() ? `?${qs}` : "";

      let endpoint = "";
      if (postId) {
        endpoint = `${WP_BASE}/wp-json/flatmate/v1/posts/${encodeURIComponent(postId)}${suffix}`;
      } else {
        if (!houseId) {
          return res.status(400).json({ error: "houseId required" });
        }
        endpoint = `${WP_BASE}/wp-json/flatmate/v1/houses/${encodeURIComponent(houseId)}/posts${suffix}`;
      }

      const resp = await withFallback(
        endpoint,
        { headers: { Authorization: authHeader } },
        basicAuth,
        incomingAuth
      );
      const data = await parseResponse(resp);
      return res.status(resp.status).json(data);
    }

    if (req.method === "POST") {
      const { houseId } = req.query;
      if (!houseId) {
        return res.status(400).json({ error: "houseId required" });
      }
      const rawBody = await buffer(req);
      const resp = await withFallback(
        `${WP_BASE}/wp-json/flatmate/v1/houses/${encodeURIComponent(houseId)}/posts`,
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": req.headers["content-type"] || "application/json"
          },
          body: rawBody
        },
        basicAuth,
        incomingAuth
      );
      const data = await parseResponse(resp);
      return res.status(resp.status).json(data);
    }

    if (req.method === "DELETE") {
      const { postId } = req.query;
      if (!postId) {
        return res.status(400).json({ error: "postId required" });
      }
      const resp = await withFallback(
        `${WP_BASE}/wp-json/flatmate/v1/posts/${encodeURIComponent(postId)}`,
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
    return res.status(500).json({ error: "WP posts proxy failed", detail: err?.message || "Unknown error" });
  }
}
