export default async function handler(req, res) {
  const WP_BASE = process.env.WP_BASE_URL || "https://backend.paxbud.com";
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Authorization header required" });

  try {
    const resp = await fetch(`${WP_BASE.replace(/\/$/, "")}/wp-json/wp/v2/users/me`, {
      headers: { Authorization: authHeader }
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = data?.message || "Failed to load profile";
      return res.status(resp.status || 500).json({ error: msg, detail: data });
    }
    // Shape down fields we care about
    return res.status(200).json({
      id: data?.id,
      name: data?.name,
      email: data?.email || data?.user_email,
      username: data?.slug || data?.username,
    });
  } catch (err) {
    return res.status(500).json({ error: "Profile proxy failed", detail: err?.message || "Unknown error" });
  }
}
