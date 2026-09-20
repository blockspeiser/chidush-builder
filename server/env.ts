// Server configuration from the environment. Loads .env in development.

import { existsSync } from "node:fs";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env and set it.`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 8787),
  isProduction: process.env.NODE_ENV === "production",
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  googleCloudProject: required("GOOGLE_CLOUD_PROJECT"),
  firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID ?? "(default)",
};
