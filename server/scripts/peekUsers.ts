// Read-only: lists users and how many sessions each has. Run: npm run peek:users
import { getFirestore } from "firebase-admin/firestore";
import { firebaseApp } from "../auth";
import { env } from "../env";

const db = getFirestore(firebaseApp(), env.firestoreDatabaseId);
const users = await db.collection("users").get();
for (const u of users.docs) {
  const sessions = await u.ref.collection("sessions").select("title", "savedAt").get();
  console.log(u.id, u.get("email"), `${sessions.size} session(s)`);
  for (const s of sessions.docs) console.log("   ", s.id, s.get("title"), s.get("savedAt"));
}
process.exit(0);
