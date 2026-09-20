// HTTP surface for saved sessions.

import { Hono } from "hono";
import { isValidSessionId, type SessionStore } from "./sessionStore";

export function sessionRoutes(store: SessionStore) {
  const app = new Hono();

  app.get("/", async (c) => c.json({ sessions: await store.list() }));

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    if (!isValidSessionId(id)) return c.json({ error: "invalid id" }, 400);
    const json = await store.get(id);
    if (json === null) return c.json({ error: "not found" }, 404);
    return c.body(json, 200, { "Content-Type": "application/json" });
  });

  app.on(["POST", "PUT"], "/:id", async (c) => {
    const id = c.req.param("id");
    if (!isValidSessionId(id)) return c.json({ error: "invalid id" }, 400);
    const body = await c.req.text();
    try {
      JSON.parse(body);
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }
    await store.put(id, body);
    return c.json({ ok: true, id });
  });

  return app;
}
