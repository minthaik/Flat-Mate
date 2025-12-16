import fs from "node:fs/promises";
import path from "node:path";

const STORE_PATH = process.env.STATE_STORE_PATH || path.join(process.cwd(), ".data", "paxbud-state.json");
const WP_BASE = (process.env.WP_BASE_URL || "https://backend.paxbud.com").replace(/\/$/, "");

async function ensureStoreFile() {
  const dir = path.dirname(STORE_PATH);
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
  try {
    await fs.access(STORE_PATH);
  } catch {
    await fs.writeFile(STORE_PATH, "{}", "utf8").catch(() => {});
  }
}

async function readStore() {
  await ensureStoreFile();
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writeStore(store) {
  await ensureStoreFile();
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

async function fetchWpProfile(authHeader) {
  const resp = await fetch(`${WP_BASE}/wp-json/wp/v2/users/me?context=edit`, {
    headers: { Authorization: authHeader }
  });
  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({}));
    const message = detail?.message || "Unable to verify user";
    const error = new Error(message);
    error.status = resp.status;
    throw error;
  }
  const data = await resp.json().catch(() => ({}));
  return {
    id: data?.id,
    email: data?.email || data?.user_email,
    name: data?.name
  };
}

function sanitizeIncomingState(payload = {}) {
  if (!payload || typeof payload !== "object") return null;
  const shape = {
    db: payload.db || null,
    view: payload.view || "AUTH",
    currentUserId: payload.currentUserId ?? null,
    theme: payload.theme || "light",
    leftHouseIds: Array.isArray(payload.leftHouseIds) ? payload.leftHouseIds : []
  };
  if (!shape.db) return null;
  return shape;
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Authorization header required" });
  }

  let userProfile;
  try {
    userProfile = await fetchWpProfile(authHeader);
  } catch (err) {
    return res
      .status(err?.status || 401)
      .json({ error: err?.message || "Unable to verify user" });
  }
  const userKey = `user_${userProfile.id || userProfile.email}`;

  if (req.method === "GET") {
    const store = await readStore();
    const payload = store[userKey] || null;
    return res.status(200).json(payload);
  }

  if (req.method === "PUT" || req.method === "POST") {
    const incoming = sanitizeIncomingState(req.body?.state || req.body);
    if (!incoming) {
      return res.status(400).json({ error: "state payload with db is required" });
    }
    const store = await readStore();
    store[userKey] = {
      ...incoming,
      updatedAt: new Date().toISOString()
    };
    await writeStore(store);
    return res.status(204).end();
  }

  return res.status(405).json({ error: "Method not allowed" });
}
