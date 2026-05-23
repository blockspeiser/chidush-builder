import Anthropic from "@anthropic-ai/sdk";

const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error(
    "Missing VITE_ANTHROPIC_API_KEY. Copy .env.example to .env and set your key.",
  );
}

export const anthropic = new Anthropic({
  apiKey,
  dangerouslyAllowBrowser: true,
});
