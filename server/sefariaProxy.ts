// Pass-through to the Sefaria API so the client only ever talks to our origin.

import { Hono } from "hono";

const SEFARIA_API = "https://www.sefaria.org/api";
const USER_AGENT = "ChidushBuilder/0.1 (learning app; contact via GitHub)";

export const sefariaProxy = new Hono();

sefariaProxy.all("/*", async (c) => {
  const incoming = new URL(c.req.url);
  const subpath = incoming.pathname.replace(/^\/api\/sefaria/, "");
  const target = `${SEFARIA_API}${subpath}${incoming.search}`;

  const method = c.req.method;
  const hasBody = method !== "GET" && method !== "HEAD";
  const upstream = await fetch(target, {
    method,
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    body: hasBody ? await c.req.text() : undefined,
  });

  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  return new Response(upstream.body, { status: upstream.status, headers });
});
