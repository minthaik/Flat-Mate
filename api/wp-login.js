export default async function handler(req, res) {
  const WP_BASE = process.env.WP_BASE_URL || "https://backend.paxbud.com";
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username and password required" });

  try {
    const resp = await fetch(`${WP_BASE.replace(/\/$/, "")}/wp-json/jwt-auth/v1/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data?.token) {
      const msg = data?.message || "Login failed";
      return res.status(resp.status || 500).json({ error: msg, detail: data });
    }
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: "Login proxy failed", detail: err?.message || "Unknown error" });
  }
}
