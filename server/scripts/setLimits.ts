// Sets per-user daily limits in Firestore (config/limits). Takes effect within
// a minute, no redeploy. Usage: npm run set:limits -- <dailyRequests> <dailyOutputTokens>
import { getFirestore } from "firebase-admin/firestore";
import { firebaseApp } from "../auth";
import { env } from "../env";

const [req, out] = process.argv.slice(2).map(Number);
if (!Number.isFinite(req) || !Number.isFinite(out) || req <= 0 || out <= 0) {
  console.error("usage: setLimits <dailyRequests> <dailyOutputTokens>");
  process.exit(1);
}
const db = getFirestore(firebaseApp(), env.firestoreDatabaseId);
await db.collection("config").doc("limits").set({ dailyRequests: req, dailyOutputTokens: out });
console.log("config/limits =", (await db.collection("config").doc("limits").get()).data());
process.exit(0);
