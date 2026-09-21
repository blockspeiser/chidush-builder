// Per-user daily usage counters and limits, stored in Firestore.
//
// users/{uid}/usage/{YYYY-MM-DD}  { requests, inputTokens, outputTokens,
//                                   cacheReadTokens, cacheWriteTokens }
// config/limits                    { dailyRequests, dailyOutputTokens }

import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { firebaseApp } from "./auth";
import { env } from "./env";

export type Limits = {
  dailyRequests: number;
  dailyOutputTokens: number;
};

export type UsageCounters = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type TokenUsage = Partial<Omit<UsageCounters, "requests">>;

/** Applied when config/limits is missing a field. Roughly $10/user/day. */
export const DEFAULT_LIMITS: Limits = {
  dailyRequests: 300,
  dailyOutputTokens: 300_000,
};

const LIMITS_CACHE_MS = 60_000;
let limitsCache: { value: Limits; fetchedAt: number } | null = null;

function db() {
  return getFirestore(firebaseApp(), env.firestoreDatabaseId);
}

/** UTC calendar day; the counter resets at midnight UTC. */
export function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function usageRef(uid: string, day = todayKey()) {
  return db().collection("users").doc(uid).collection("usage").doc(day);
}

export async function getLimits(): Promise<Limits> {
  if (limitsCache && Date.now() - limitsCache.fetchedAt < LIMITS_CACHE_MS) {
    return limitsCache.value;
  }
  const snap = await db().collection("config").doc("limits").get();
  const data = (snap.exists ? snap.data() : {}) as Partial<Limits>;
  const value: Limits = {
    dailyRequests: positive(data.dailyRequests) ?? DEFAULT_LIMITS.dailyRequests,
    dailyOutputTokens:
      positive(data.dailyOutputTokens) ?? DEFAULT_LIMITS.dailyOutputTokens,
  };
  limitsCache = { value, fetchedAt: Date.now() };
  return value;
}

function positive(n: unknown): number | undefined {
  return typeof n === "number" && n > 0 ? n : undefined;
}

export async function getUsage(uid: string): Promise<UsageCounters> {
  const snap = await usageRef(uid).get();
  return normalize(snap.exists ? snap.data() : undefined);
}

function normalize(data: Record<string, unknown> | undefined): UsageCounters {
  const num = (k: keyof UsageCounters) =>
    typeof data?.[k] === "number" ? (data[k] as number) : 0;
  return {
    requests: num("requests"),
    inputTokens: num("inputTokens"),
    outputTokens: num("outputTokens"),
    cacheReadTokens: num("cacheReadTokens"),
    cacheWriteTokens: num("cacheWriteTokens"),
  };
}

export type ReserveResult =
  | { ok: true }
  | { ok: false; reason: "daily_requests" | "daily_output_tokens" };

/**
 * Atomically checks today's counters against the limits and, if allowed,
 * counts this request. Token totals are added afterwards by recordUsage.
 */
export async function reserveRequest(uid: string): Promise<ReserveResult> {
  const limits = await getLimits();
  const ref = usageRef(uid);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const usage = normalize(snap.exists ? snap.data() : undefined);
    if (usage.requests >= limits.dailyRequests) {
      return { ok: false, reason: "daily_requests" } as const;
    }
    if (usage.outputTokens >= limits.dailyOutputTokens) {
      return { ok: false, reason: "daily_output_tokens" } as const;
    }
    tx.set(
      ref,
      { requests: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return { ok: true } as const;
  });
}

export async function recordUsage(uid: string, usage: TokenUsage): Promise<void> {
  const update: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  for (const [key, value] of Object.entries(usage)) {
    if (typeof value === "number" && value > 0) {
      update[key] = FieldValue.increment(value);
    }
  }
  await usageRef(uid).set(update, { merge: true });
}

// Concurrency: up to MAX_CONCURRENT_TURNS streaming turns per user. Beyond
// that the oldest upstream stream is aborted rather than the new request
// refused, so a dropped connection can never lock a user out. In-memory,
// so it is per instance; with max-instances small that is acceptable.
export const MAX_CONCURRENT_TURNS = 3;
const inFlight = new Map<string, AbortController[]>();

export function beginTurn(uid: string): AbortController {
  const controller = new AbortController();
  const turns = inFlight.get(uid) ?? [];
  turns.push(controller);
  while (turns.length > MAX_CONCURRENT_TURNS) turns.shift()?.abort();
  inFlight.set(uid, turns);
  return controller;
}

export function endTurn(uid: string, controller: AbortController): void {
  const turns = inFlight.get(uid);
  if (!turns) return;
  const remaining = turns.filter((t) => t !== controller);
  if (remaining.length === 0) inFlight.delete(uid);
  else inFlight.set(uid, remaining);
}
