// Verifies Firebase ID tokens. Token verification only needs the project ID
// (it uses Google's public keys), so this works without cloud credentials.

import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { MiddlewareHandler } from "hono";
import { env } from "./env";

export type AuthVariables = {
  uid: string;
  email: string | null;
};

export function firebaseApp() {
  return getApps()[0] ?? initializeApp({ projectId: env.googleCloudProject });
}

export const requireAuth: MiddlewareHandler<{ Variables: AuthVariables }> =
  async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return c.json({ error: "sign-in required" }, 401);
    try {
      const decoded = await getAuth(firebaseApp()).verifyIdToken(token);
      c.set("uid", decoded.uid);
      c.set("email", decoded.email ?? null);
    } catch {
      return c.json({ error: "invalid or expired sign-in" }, 401);
    }
    await next();
  };
