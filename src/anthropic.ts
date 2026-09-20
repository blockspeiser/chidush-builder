import Anthropic from "@anthropic-ai/sdk";
import { authHeaders } from "./auth/authFetch";

// All Claude traffic goes through our server, which holds the real key and
// owns the request shape. The SDK still needs a non-empty key string. A
// custom fetch attaches the user's ID token, which rotates hourly.
export const anthropic = new Anthropic({
  apiKey: "proxied",
  baseURL: `${window.location.origin}/api/anthropic`,
  dangerouslyAllowBrowser: true,
  fetch: async (url, init) =>
    fetch(url, { ...init, headers: await authHeaders(init?.headers) }),
});
