import express from "express";
import helmet from "helmet";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import { registerPlaidRoutes } from "./plaid-routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(helmet());
app.use(express.json({ limit: "2mb" }));

// CORS for native Capacitor app
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-pp-secret, x-pp-user, x-pp-tier");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  return next();
});
app.get("/privacy", (_req, res) => {
  res.sendFile(path.join(__dirname, "public/privacy.html"));
});
app.get("/cards", (_req, res) => {
  res.sendFile(path.join(__dirname, "cards.json"));
});

const PORT = process.env.PORT || 8080;
const APP_PROXY_SECRET = process.env.APP_PROXY_SECRET || "";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const TIER_LIMITS = {
  starter: 5,
  basic: 10,
  standard: 25,
  plus: 50,
  power: 100
};

const usage = new Map();
const monthKey = () => new Date().toISOString().slice(0, 7); // YYYY-MM

function getUserId(req) {
  return req.headers["x-pp-user"] || req.ip || "anonymous";
}

function getTier(req) {
  const raw = (req.headers["x-pp-tier"] || req.body?.tier || "starter").toString().toLowerCase();
  return TIER_LIMITS[raw] ? raw : "starter";
}

function requireAuth(req, res, next) {
  if (!APP_PROXY_SECRET) return next();
  const provided = req.headers["x-pp-secret"] || "";
  if (provided !== APP_PROXY_SECRET) return res.status(401).json({ error: "Unauthorized" });
  return next();
}

function checkLimit(req, res, next) {
  const user = getUserId(req);
  const tier = getTier(req);
  const limit = TIER_LIMITS[tier] || 0;
  const key = `${user}:${monthKey()}`;
  const count = usage.get(key) || 0;
  if (count >= limit) return res.status(402).json({ error: "Monthly limit reached", tier, limit });
  req._pp_usage_key = key;
  req._pp_usage_next = count + 1;
  return next();
}

function bumpUsage(req) {
  if (req._pp_usage_key) usage.set(req._pp_usage_key, req._pp_usage_next || 1);
}

function downshiftModel(provider, model, tier, count, limit) {
  // Cost-aware downshift when near limit (>= 80%)
  if (!limit) return model;
  const ratio = count / limit;
  if (ratio < 0.8) return model;

  if (provider === "openai") return "gpt-4o";
  if (provider === "gemini") return "gemini-2.0-flash";
  if (provider === "claude") return "claude-haiku-3-5";
  return model;
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/audit/openai", requireAuth, checkLimit, async (req, res) => {
  if (!OPENAI_API_KEY) return res.status(503).json({ error: "OpenAI key not configured" });
  try {
    const user = getUserId(req);
    const tier = getTier(req);
    const limit = TIER_LIMITS[tier] || 0;
    const count = (usage.get(`${user}:${monthKey()}`) || 0) + 1;
    const model = downshiftModel("openai", req.body?.model || "gpt-5.2", tier, count, limit);

    const body = {
      model,
      messages: req.body?.messages || [],
      stream: false,
      max_tokens: req.body?.max_tokens || 12000
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    bumpUsage(req);
    return res.json({ provider: "openai", model, data });
  } catch (e) {
    return res.status(500).json({ error: e.message || "OpenAI proxy failed" });
  }
});


app.post("/audit/gemini", requireAuth, checkLimit, async (req, res) => {
  if (!GEMINI_API_KEY) return res.status(503).json({ error: "Gemini key not configured" });
  try {
    const user = getUserId(req);
    const tier = getTier(req);
    const limit = TIER_LIMITS[tier] || 0;
    const count = (usage.get(`${user}:${monthKey()}`) || 0) + 1;
    const model = downshiftModel("gemini", req.body?.model || "gemini-2.5-flash", tier, count, limit);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    const body = {
      contents: req.body?.contents || [],
      systemInstruction: req.body?.systemInstruction,
      generationConfig: req.body?.generationConfig || { maxOutputTokens: 12000 }
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    bumpUsage(req);
    return res.json({ provider: "gemini", model, data });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Gemini proxy failed" });
  }
});

// ── Plaid Routes ─────────────────────────────────────────────
registerPlaidRoutes(app, requireAuth);

app.listen(PORT, () => {
  console.log(`Catalyst Cash proxy running on :${PORT}`);
});
