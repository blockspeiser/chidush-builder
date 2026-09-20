// Streams Claude responses to the client while keeping the API key and
// request shape on the server.

import { Hono } from "hono";
import { buildMessagesRequest } from "../shared/modelConfig";
import type { AuthVariables } from "./auth";
import { env } from "./env";
import { teeUsage } from "./sseUsage";
import { beginTurn, endTurn, recordUsage, reserveRequest } from "./usage";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// Generous ceiling on the serialized history; a real session is far smaller.
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_MESSAGES = 400;

export const anthropicProxy = new Hono<{ Variables: AuthVariables }>();

/**
 * Shaped like an Anthropic API error so the client SDK surfaces the
 * message. 403 rather than 429 so the SDK does not retry it.
 */
function refuse(message: string) {
  return Response.json(
    { type: "error", error: { type: "permission_error", message } },
    { status: 403 },
  );
}

const LIMIT_MESSAGES = {
  daily_requests:
    "You've reached today's limit on messages. It resets at midnight UTC.",
  daily_output_tokens:
    "You've reached today's limit on assistant output. It resets at midnight UTC.",
};

/**
 * The client uses the Anthropic SDK pointed at this route, so the request
 * arrives as a full Messages API body. Only `messages` is honored.
 */
anthropicProxy.post("/v1/messages", async (c) => {
  const uid = c.get("uid");
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

  const turn = beginTurn(uid);
  let streaming = false;
  try {
    const reserved = await reserveRequest(uid);
    if (!reserved.ok) return refuse(LIMIT_MESSAGES[reserved.reason]);

    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.anthropicApiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(buildMessagesRequest(messages)),
      signal: turn.signal,
    });

    // Pass the SSE stream (or the error JSON) through untouched so the
    // client SDK can parse it exactly as if it had called Anthropic directly.
    const headers = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
    headers.set("Cache-Control", "no-cache");

    if (!upstream.ok || !upstream.body) {
      return new Response(upstream.body, { status: upstream.status, headers });
    }

    // The turn ends (and usage is billed) when the stream finishes.
    streaming = true;
    const body = teeUsage(upstream.body, (usage) => {
      endTurn(uid, turn);
      recordUsage(uid, usage).catch((e) =>
        console.warn("[usage] record failed", e),
      );
    });
    return new Response(body, { status: upstream.status, headers });
  } catch (e) {
    if (turn.signal.aborted) {
      return refuse("This response was superseded by a newer request.");
    }
    throw e;
  } finally {
    if (!streaming) endTurn(uid, turn);
  }
});
