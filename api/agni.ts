/**
 * Server-side proxy for the Agni (api.ravan.ai) calls the widget used to make
 * directly from the browser.
 *
 * Why: the X-Api-Key was shipped inside react-widget-uv.iife.js, which is a
 * public file — anyone could read the key out of the bundle and spend the
 * account's call credits. The key now lives only in this function's env vars.
 *
 * What this does NOT do: hide the fact that a request happens. The browser
 * still shows a POST to /api/agni, and the LiveKit url/token in the response
 * are still visible — the browser needs them to join the room. They are
 * short-lived and scoped to a single room, which is why that's acceptable.
 *
 * Everything is one function (rather than /api/create-call + /api/tools) so
 * the agent registry and CORS logic have a single home and no shared-module
 * bundling to get wrong.
 *
 * Required env vars (Vercel → Project → Settings → Environment Variables):
 *   AGNI_API_KEY_COMPANY1   key for agent 514e1c5a-…
 *   AGNI_API_KEY_JWAN       key for agent c95a3759-…
 *   LEAD_WEBHOOK_JWAN       GoHighLevel webhook-trigger URL for c95a3759-…
 *   ALLOWED_ORIGINS         optional, comma-separated (e.g. "https://a.com,https://b.com")
 */

const AGNI_BASE = "https://api.ravan.ai/api/v1";

/**
 * Snowie agent_id → Agni agent + the env var holding its key.
 *
 * The agni agent id is chosen HERE, never accepted from the request body —
 * otherwise a caller could point your key at any agent they like.
 */
const AGENTS: Record<
  string,
  { agniAgentId: string; keyEnv: string; leadWebhookEnv?: string }
> = {
  "514e1c5a-72c8-4670-a2f7-3851f7b49bae": {
    agniAgentId: "019e9315-e11e-7580-a785-5dc14877d996",
    keyEnv: "AGNI_API_KEY_COMPANY1",
  },
  "c95a3759-bb70-4463-a3b1-390910ed46e8": {
    agniAgentId: "019ff206-1c8a-7a23-b22e-33a33901c38b",
    keyEnv: "AGNI_API_KEY_JWAN",
    leadWebhookEnv: "LEAD_WEBHOOK_JWAN",
  },
};

/**
 * Best-effort rate limit. This lives in the memory of one warm instance, so
 * it slows down a single abuser but is NOT a real limit across the fleet —
 * that needs Vercel KV / Upstash. Treat it as a speed bump, not a guarantee.
 */
const RATE_LIMIT = { windowMs: 5 * 60 * 1000, max: 20 };
const hits = new Map<string, { count: number; resetAt: number }>();

const isRateLimited = (key: string): boolean => {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT.max;
};

const originAllowed = (origin: string | undefined): boolean => {
  if (!origin) return true; // non-browser caller; no Origin header to check
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;

  const configured = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  // Unset ALLOWED_ORIGINS means "allow any site" so a missing env var can't
  // take every embed down. Set it in production — see the warning below.
  if (configured.length === 0) {
    console.warn(
      "[agni] ALLOWED_ORIGINS is not set — accepting request from",
      origin,
    );
    return true;
  }
  return configured.includes(origin);
};

export default async function handler(req: any, res: any) {
  const origin: string | undefined = req.headers.origin;
  const allowed = originAllowed(origin);

  // Reflect the caller's origin rather than "*", so the allowlist above is
  // what actually decides access.
  if (origin && allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!allowed) {
    return res.status(403).json({ error: "Origin not allowed" });
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
    "unknown";

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const { action, agent_id } = body;

  const config = AGENTS[agent_id];
  if (!config) {
    return res.status(404).json({ error: "Unknown agent" });
  }

  if (isRateLimited(`${ip}:${action}`)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  const apiKey = process.env[config.keyEnv];
  if (!apiKey) {
    console.error(`[agni] missing env var ${config.keyEnv}`);
    return res.status(500).json({ error: "Server not configured" });
  }

  try {
    // ── Start a web call ──────────────────────────────────────────────
    if (action === "create-call") {
      const upstream = await fetch(`${AGNI_BASE}/calling/create-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
        body: JSON.stringify({
          agent_id: config.agniAgentId,
          metadata: {},
          prompt_dynamic_variables: {},
          type: "web_call",
          caller_name: body.caller_name,
          caller_email: body.caller_email,
          to_phone_number: body.to_phone_number,
        }),
      });

      const json = await upstream.json();
      if (!upstream.ok) {
        console.error("[agni] create-call failed:", upstream.status, json);
        return res.status(upstream.status).json({ error: "Upstream error" });
      }

      // Return only what the browser needs to join the room — not the full
      // upstream payload, which may carry fields the client has no business
      // seeing.
      const data = json.data || {};
      return res.status(200).json({
        data: {
          url: data.url,
          access_token: data.access_token,
          call_id: data.call_id || data.room_id || "active",
        },
      });
    }

    // ── List the agent's client-side tools ────────────────────────────
    if (action === "tools") {
      const params = new URLSearchParams({
        limit: "100",
        offset: "0",
        agent_id: config.agniAgentId,
      });
      const upstream = await fetch(`${AGNI_BASE}/tools?${params}`, {
        headers: { "X-Api-Key": apiKey },
      });

      const json = await upstream.json();
      if (!upstream.ok) {
        console.error("[agni] tools failed:", upstream.status, json);
        return res.status(upstream.status).json({ error: "Upstream error" });
      }

      const tools: Array<{ name: string; type: string }> = json.data ?? [];
      return res.status(200).json({
        data: tools
          .filter((t) => t.type === "client")
          .map((t) => ({ name: t.name, type: t.type })),
      });
    }

    // ── Forward a form lead to the client's CRM webhook ───────────────
    if (action === "lead") {
      const webhookUrl = config.leadWebhookEnv
        ? process.env[config.leadWebhookEnv]
        : undefined;
      // Agents without a webhook configured simply have nowhere to send it.
      if (!webhookUrl) return res.status(204).end();

      const rawPhone = (body.to_phone_number || "").trim();
      const phone =
        rawPhone && !rawPhone.startsWith("+") ? `+${rawPhone}` : rawPhone;

      const upstream = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: body.caller_name || "",
          email: body.caller_email || "",
          phone,
          agent_id,
          schema_name: body.schema_name,
          source_url: body.source_url,
        }),
      });

      if (!upstream.ok) {
        console.error("[agni] lead webhook failed:", upstream.status);
      }
      // A failed webhook must never block the call, so this always succeeds.
      return res.status(204).end();
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    console.error("[agni] handler error:", err);
    return res.status(502).json({ error: "Upstream request failed" });
  }
}
