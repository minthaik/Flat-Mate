export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const WP_BASE = process.env.WP_BASE_URL || "https://backend.paxbud.com";
  const wpUser = process.env.WP_USER;
  const wpPass = process.env.WP_APP_PW;
  if (!wpUser || !wpPass) {
    return res.status(500).json({ error: "WP creds not set (WP_USER / WP_APP_PW)" });
  }

  const { username, email, password, firstName, lastName } = req.body || {};
  if (!username || !email || !password) {
    return res.status(400).json({ error: "username, email, and password required" });
  }

  const authHeader = `Basic ${Buffer.from(`${wpUser}:${wpPass}`).toString("base64")}`;
  const base = WP_BASE.replace(/\/$/, "");
  const createEndpoint = `${base}/wp-json/wp/v2/users`;

  try {
    const createResp = await fetch(createEndpoint, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username,
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        name: [firstName, lastName].filter(Boolean).join(" ")
      })
    });

    const created = await createResp.json().catch(() => ({}));
    if (!createResp.ok) {
      const msg = created?.message || "Signup failed";
      return res.status(createResp.status || 500).json({ error: msg, detail: created });
    }

    // Attempt to log in to return a token immediately.
    let tokenData = null;
    try {
      const tokenResp = await fetch(`${base}/wp-json/flatmate/v1/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const tokenJson = await tokenResp.json().catch(() => ({}));
      if (tokenResp.ok && tokenJson?.token) tokenData = tokenJson;
    } catch {}

    return res.status(200).json({
      ok: true,
      user: {
        id: created?.id,
        username: created?.slug || created?.username || username,
        email: created?.email || email,
        firstName: created?.first_name || firstName,
        lastName: created?.last_name || lastName,
        name: created?.name || [firstName, lastName].filter(Boolean).join(" ")
      },
      token: tokenData?.token,
      tokenData: tokenData || undefined
    });
  } catch (err) {
    return res.status(500).json({ error: "Signup failed", detail: err?.message || "Unknown error" });
  }
}
