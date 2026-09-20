import Anthropic from "@anthropic-ai/sdk";

// All Claude traffic goes through our server, which holds the real key and
// owns the request shape. The SDK still needs a non-empty key string.
export const anthropic = new Anthropic({
  apiKey: "proxied",
  baseURL: `${window.location.origin}/api/anthropic`,
  dangerouslyAllowBrowser: true,
});
