// Exercises reserveRequest/recordUsage against Firestore for a test user.
// Run: npm run check:usage
import { getFirestore } from "firebase-admin/firestore";
import { firebaseApp } from "../auth";
import { env } from "../env";
import { getLimits, getUsage, recordUsage, reserveRequest } from "../usage";

const uid = "smoke-test-usage";
const db = getFirestore(firebaseApp(), env.firestoreDatabaseId);
await db.recursiveDelete(db.collection("users").doc(uid));

console.log("limits:", await getLimits());
console.log("reserve 1:", await reserveRequest(uid));
console.log("reserve 2:", await reserveRequest(uid));
await recordUsage(uid, { inputTokens: 1200, outputTokens: 340, cacheReadTokens: 900 });
await recordUsage(uid, { outputTokens: 60 });
console.log("usage:", await getUsage(uid));

// Push output tokens over the cap and confirm the next reserve is refused.
const { dailyOutputTokens } = await getLimits();
await recordUsage(uid, { outputTokens: dailyOutputTokens });
console.log("reserve over cap:", await reserveRequest(uid));

await db.recursiveDelete(db.collection("users").doc(uid));
console.log("cleaned up");
process.exit(0);
