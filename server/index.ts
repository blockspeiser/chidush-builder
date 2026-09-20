// Entry point. In development Vite proxies /api here; in production this
// process also serves the built client from dist/.

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { anthropicProxy } from "./anthropicProxy";
import { requireAuth } from "./auth";
import { env } from "./env";
import { sefariaProxy } from "./sefariaProxy";
import { sessionRoutes } from "./sessionRoutes";
import { FirestoreSessionStore } from "./sessionStore";
import { usageRoutes } from "./usageRoutes";

const app = new Hono();
app.use(logger());

app.get("/api/health", (c) => c.json({ ok: true }));

// Everything under /api except health requires a signed-in user.
app.use("/api/*", requireAuth);
app.route("/api/anthropic", anthropicProxy);
app.route("/api/sefaria", sefariaProxy);
app.route("/api/sessions", sessionRoutes(new FirestoreSessionStore()));
app.route("/api/usage", usageRoutes);

app.onError((err, c) => {
  console.error("[server] unhandled", err);
  return c.json({ error: "internal error" }, 500);
});

if (env.isProduction) {
  // Static assets, then the SPA shell for any other path (e.g. /s/abc12).
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("/*", serveStatic({ root: "./dist", path: "index.html" }));
}

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`[server] listening on http://localhost:${info.port}`);
});
