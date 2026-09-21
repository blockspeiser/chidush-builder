// HTTP surface for saved sessions. All routes run behind requireAuth.

import { Hono } from "hono";
import type { AuthVariables } from "./auth";
import {
  isValidSessionId,
  MAX_SESSION_BYTES,
  type SessionStore,
} from "./sessionStore";
import { touchUser } from "./users";

export function sessionRoutes(store: SessionStore) {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.get("/", async (c) => {
    return c.json({ sessions: await store.list(c.get("uid")) });
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    if (!isValidSessionId(id)) return c.json({ error: "invalid id" }, 400);
    const json = await store.get(c.get("uid"), id);
    if (json === null) return c.json({ error: "not found" }, 404);
    return c.body(json, 200, { "Content-Type": "application/json" });
  });

  app.on(["POST", "PUT"], "/:id", async (c) => {
    const id = c.req.param("id");
    if (!isValidSessionId(id)) return c.json({ error: "invalid id" }, 400);
    const body = await c.req.text();
    if (Buffer.byteLength(body) > MAX_SESSION_BYTES) {
      return c.json({ error: "session too large to save" }, 413);
    }
    try {
      JSON.parse(body);
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }
    const uid = c.get("uid");
    await store.put(uid, id, body);
    void touchUser(uid, c.get("email"));
    return c.json({ ok: true, id });
  });

  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    if (!isValidSessionId(id)) return c.json({ error: "invalid id" }, 400);
    const body = (await c.req.json().catch(() => null)) as { title?: unknown } | null;
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (!title || title.length > 120) return c.json({ error: "title required (max 120 chars)" }, 400);
    const found = await store.rename(c.get("uid"), id, title);
    if (!found) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true, id, title });
  });

  app.delete("/:id", async (c) => {
    const id = c.req.param("id");
    if (!isValidSessionId(id)) return c.json({ error: "invalid id" }, 400);
    await store.delete(c.get("uid"), id);
    return c.json({ ok: true, id });
  });

  return app;
}
