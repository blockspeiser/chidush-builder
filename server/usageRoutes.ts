// Today's counters and the limits that apply, for the signed-in user.

import { Hono } from "hono";
import type { AuthVariables } from "./auth";
import { getLimits, getUsage, todayKey } from "./usage";

export const usageRoutes = new Hono<{ Variables: AuthVariables }>();

usageRoutes.get("/", async (c) => {
  const uid = c.get("uid");
  const [usage, limits] = await Promise.all([getUsage(uid), getLimits()]);
  return c.json({ day: todayKey(), usage, limits });
});
