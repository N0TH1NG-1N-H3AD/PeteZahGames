import express from "express";
import { createServer } from "node:http";
import { hostname } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createBareServer } from "@tomphttp/bare-server-node";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { createProxyMiddleware } from "http-proxy-middleware";
import session from "express-session";
import BetterSqlite3Session from "better-sqlite3-session-store";
import dotenv from "dotenv";
import db from "./db.js";
import { signupHandler } from "./api/signup.js";
import { signinHandler } from "./api/signin.js";
import { signoutHandler } from "./api/signout.js";
import { getMeHandler, updateProfileHandler, uploadAvatarHandler } from "./api/user.js";
import { getSettingsHandler, saveSettingsHandler } from "./api/settings.js";
import { addCommentHandler, getCommentsHandler, deleteCommentHandler, cleanupMaliciousCommentsHandler } from "./api/comments.js";
import { likeHandler, getLikesHandler } from "./api/likes.js";
import { adminUserActionHandler } from "./api/admin-user-action.js";
import { getChangelogHandler, createChangelogHandler, deleteChangelogHandler } from "./api/changelog.js";
import { getFeedbackHandler, createFeedbackHandler, deleteFeedbackHandler } from "./api/feedback.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env.production") });
console.log("GROQ KEY loaded:", !!process.env.GROQ_API_KEY);

const IS_DEV = process.env.NODE_ENV !== "production";
dotenv.config({ path: path.join(__dirname, ".env.production") });
const VITE_PORT = parseInt(process.env.VITE_PORT || "3000");

const SqliteStore = BetterSqlite3Session(session);
const bare = createBareServer("/bare/");
const app = express();

app.set("trust proxy", 1);

app.use("/epoxy/", express.static(epoxyPath));
app.use("/libcurl/", express.static(libcurlPath));
app.use("/baremux/", express.static(baremuxPath));
app.use("/scram/", express.static(scramjetPath));

app.use("/uploads/", express.static(path.join(__dirname, "../uploads")));

app.use(
  session({
    store: new SqliteStore({ client: db }),
    secret: process.env.SESSION_SECRET || "petezah-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && process.env.FORCE_HTTPS === "true",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  })
);

app.get("/sw.js", (_req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.sendFile(path.join(__dirname, "../dist/sw.js"));
});

const promptCache = new Map();
const CACHE_TTL = 60 * 60 * 1000;
const CACHE_MAX_PROMPT_LENGTH = 120;
const CACHE_MAX_SIZE = 500;

function normalizeCacheKey(prompt) {
  return prompt
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getCached(key) {
  const entry = promptCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    promptCache.delete(key);
    return null;
  }
  return entry.response;
}

function setCache(key, response) {
  if (promptCache.size >= CACHE_MAX_SIZE) {
    const firstKey = promptCache.keys().next().value;
    promptCache.delete(firstKey);
  }
  promptCache.set(key, { response, expires: Date.now() + CACHE_TTL });
}

const aiQueue = (() => {
  const MAX_QUEUE = 25;
  const MAX_CONCURRENT = 5;
  let active = 0;
  const queue = [];

  function next() {
    if (active >= MAX_CONCURRENT || queue.length === 0) return;
    active++;
    const { task, resolve, reject } = queue.shift();
    task()
      .then(resolve)
      .catch(reject)
      .finally(() => {
        active--;
        next();
      });
  }

  return function enqueue(task) {
    return new Promise((resolve, reject) => {
      if (queue.length >= MAX_QUEUE) {
        return reject(Object.assign(new Error("Queue full"), { code: "QUEUE_FULL" }));
      }
      queue.push({ task, resolve, reject });
      next();
    });
  };
})();

const aiLimiter = (() => {
  const requests = new Map();
  return (req, res, next) => {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const windowMs = 60000;
    const max = 20;
    const timestamps = (requests.get(ip) || []).filter((t) => now - t < windowMs);
    if (timestamps.length >= max) return res.status(429).json({ error: "Too many AI requests" });
    timestamps.push(now);
    requests.set(ip, timestamps);
    next();
  };
})();

app.post("/api/generate", aiLimiter, express.json({ limit: "10mb" }), async (req, res) => {
  const { prompt, model, system, groqMessages } = req.body ?? {};
  if (!prompt || typeof prompt !== "string" || prompt.length > 10000)
    return res.status(400).json({ error: "Invalid prompt" });

  const isSimplePrompt = prompt.length <= CACHE_MAX_PROMPT_LENGTH && !groqMessages;
  const cacheKey = isSimplePrompt ? normalizeCacheKey(prompt) : null;

  if (cacheKey) {
    const cached = getCached(cacheKey);
    if (cached) return res.json({ response: cached, cached: true });
  }

  const callGroq = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const messages = groqMessages || [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ];

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: model || "llama-3.1-8b-instant",
          messages,
          max_tokens: 1024,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const data = await response.json();

      if (!response.ok) {
        console.error("Groq API error:", data);
        throw Object.assign(new Error("AI service error"), { code: "GROQ_ERROR" });
      }

      return data.choices?.[0]?.message?.content ?? "No response.";
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  };

  try {
    const result = await aiQueue(callGroq);
    if (cacheKey) setCache(cacheKey, result);
    return res.json({ response: result });
  } catch (error) {
    if (error.code === "QUEUE_FULL") return res.status(503).json({ error: "Server busy, please try again shortly" });
    if (error.name === "AbortError") return res.status(504).json({ error: "Request timeout" });
    if (error.code === "GROQ_ERROR") return res.status(502).json({ error: "AI service error" });
    console.error("AI proxy error:", error.message);
    return res.status(500).json({ error: "AI service unavailable" });
  }
});

app.post("/api/signup", express.json(), signupHandler);
app.post("/api/signin", express.json(), signinHandler);
app.post("/api/signout", signoutHandler);
app.get("/api/me", getMeHandler);
app.put("/api/me", express.json(), updateProfileHandler);
app.post("/api/me/avatar", uploadAvatarHandler);

app.get("/api/settings", getSettingsHandler);
app.put("/api/settings", express.json(), saveSettingsHandler);

app.get("/api/admin/users-full", (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: "Unauthorized" });
  const me = db.prepare("SELECT is_admin FROM users WHERE id = ?").get(req.session.user.id);
  if (!me || me.is_admin < 1) return res.status(403).json({ error: "Forbidden" });
  const users = db.prepare(
    "SELECT id, email, username, avatar_url, is_admin, email_verified, banned, created_at, ip FROM users ORDER BY created_at DESC"
  ).all();
  res.json({ users });
});

app.post("/api/admin/user-action", express.json(), adminUserActionHandler);
app.post("/api/admin/cleanup-comments", express.json(), cleanupMaliciousCommentsHandler);

app.post("/api/comment", express.json(), addCommentHandler);
app.get("/api/comments", getCommentsHandler);
app.post("/api/comment/delete", express.json(), deleteCommentHandler);

app.post("/api/likes", express.json(), likeHandler);
app.get("/api/likes", getLikesHandler);

app.get("/api/changelog", getChangelogHandler);
app.post("/api/changelog", express.json(), createChangelogHandler);
app.delete("/api/changelog/:id", deleteChangelogHandler);

app.get("/api/feedback", getFeedbackHandler);
app.post("/api/feedback", express.json(), createFeedbackHandler);
app.delete("/api/feedback/:id", deleteFeedbackHandler);

app.get("/api/admin/users", (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: "Unauthorized" });
  const admin = db.prepare("SELECT is_admin FROM users WHERE id = ?").get(req.session.user.id);
  if (!admin || admin.is_admin < 1) return res.status(403).json({ error: "Forbidden" });
  const users = db.prepare("SELECT id, email, username, is_admin, banned, email_verified, created_at, ip FROM users ORDER BY created_at DESC").all();
  res.json({ users });
});

if (IS_DEV) {
  app.use("/", createProxyMiddleware({ target: `http://localhost:${VITE_PORT}`, changeOrigin: true, ws: false }));
} else {
  app.use(express.static(path.join(__dirname, "../dist")));
  app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "../dist", "index.html")));
}

const server = createServer();

server.on("request", (req, res) => {
  if (bare.shouldRoute(req)) bare.routeRequest(req, res);
  else app(req, res);
});

server.on("upgrade", (req, socket, head) => {
  const url = req.url ?? "";

  if (bare.shouldRoute(req)) {
    bare.routeUpgrade(req, socket, head);
  } else if (
    url.startsWith("/wisp/") ||
    url.startsWith("/api/alt-wisp-1/") ||
    url.startsWith("/api/alt-wisp-2/") ||
    url.startsWith("/api/alt-wisp-3/") ||
    url.startsWith("/api/alt-wisp-4/") ||
    url.startsWith("/api/alt-wisp-5/")
  ) {
    if (url.startsWith("/api/alt-wisp-")) {
      req.url = "/wisp/" + url.replace(/^\/api\/alt-wisp-\d+\//, "");
    }
    wisp.routeRequest(req, socket, head);
  } else {
    socket.end();
  }
});

let port = parseInt(process.env.PORT || "");
if (isNaN(port)) port = 3000;

server.on("listening", () => {
  const address = server.address();
  console.log("Listening on:");
  console.log(`\thttp://localhost:${address.port}`);
  console.log(`\thttp://${hostname()}:${address.port}`);
  if (IS_DEV) console.log(`\tProxying to Vite on port ${VITE_PORT}`);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close();
  bare.close();
  process.exit(0);
}

server.listen({ port });