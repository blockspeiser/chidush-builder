// Keeps a lightweight profile document per user for monitoring and, later,
// an allowlist. Written at most once per process per user.

import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { firebaseApp } from "./auth";
import { env } from "./env";

const seen = new Set<string>();

export async function touchUser(uid: string, email: string | null) {
  if (seen.has(uid)) return;
  seen.add(uid);
  const db = getFirestore(firebaseApp(), env.firestoreDatabaseId);
  await db
    .collection("users")
    .doc(uid)
    .set(
      {
        email,
        lastSeenAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { mergeFields: ["email", "lastSeenAt"] },
    )
    .then(async () => {
      // createdAt only if the doc had none (mergeFields above skipped it).
      const snap = await db.collection("users").doc(uid).get();
      if (!snap.get("createdAt")) {
        await snap.ref.set(
          { createdAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
      }
    })
    .catch((e) => {
      seen.delete(uid);
      console.warn("[users] touch failed", e);
    });
}
