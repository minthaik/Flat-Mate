export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { subject, category, severity, details, email, deviceMeta, houseName, userName, userEmail } = req.body || {};
  if (!subject || !details) return res.status(400).json({ error: "Missing required fields" });

  const apiKey = process.env.MAILEROO_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Server not configured" });

  const payload = {
    from: { address: "support@mail.paxbud.com", display_name: "Paxbud Support" }, // must be a verified/allowed sender
    to: [{ address: "minthaik.ep@gmail.com", display_name: "Support Inbox" }], // TODO: set your real destination(s)
    reply_to: email ? { address: email, display_name: userName || "User" } : undefined,
    subject: `[Support] ${(severity || "normal").toUpperCase()} - ${subject}`.slice(0, 255),
    plain: `Category: ${category || "unspecified"}
Severity: ${severity || "normal"}
From user: ${userName || "Unknown"} (${userEmail || email || "no email"})
House: ${houseName || "N/A"}
Device: ${deviceMeta || "N/A"}

Message:
${details}`
  };

  const endpoint = "https://smtp.maileroo.com/api/v2/emails";

  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json().catch(async () => {
      const t = await resp.text().catch(() => "");
      return { message: t };
    });

    if (!resp.ok || data?.success === false) {
      const msg = data?.message || data?.detail || "Send failed";
      const status = resp.status || 500;
      return res.status(status).json({ error: msg });
    }

    return res.status(200).json({ ok: true, message: data?.message || "Sent" });
  } catch (err) {
    return res.status(500).json({ error: "Send failed", detail: err?.message || "Unknown error" });
  }
}
