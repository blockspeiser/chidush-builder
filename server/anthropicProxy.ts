// Streams Claude responses to the client while keeping the API key and
// request shape on the server.

import { Hono } from "hono";
import { buildMessagesRequest } from "../shared/modelConfig";
import { env } from "./env";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// Generous ceiling on the serialized history; a real session is far smaller.
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_MESSAGES = 400;

export const anthropicProxy = new Hono();

/**
 * The client uses the Anthropic SDK pointed at this route, so the request
 * arrives as a full Messages API body. Only `messages` is honored.
 */
anthropicProxy.post("/v1/messages", async (c) => {
  const raw = await c.req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return c.json({ error: "request too large" }, 413);
  }

  let messages: unknown;
  try {
    messages = (JSON.parse(raw) as { messages?: unknown }).messages;
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }
  if (!Array.isArray(messages) || messages.length > MAX_MESSAGES) {
    return c.json({ error: "messages must be an array" }, 400);
  }

  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.anthropicApiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(buildMessagesRequest(messages)),
  });

  // Pass the SSE stream (or the error JSON) through untouched so the
  // client SDK can parse it exactly as if it had called Anthropic directly.
  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  headers.set("Cache-Control", "no-cache");
  return new Response(upstream.body, { status: upstream.status, headers });
});
