// Verifies local credentials and the Firestore store end to end.
// Run: npm run check:firestore

import { FirestoreSessionStore } from "../sessionStore";
import { getFirestore } from "firebase-admin/firestore";
import { firebaseApp } from "../auth";
import { env } from "../env";

const uid = "smoke-test-user";
const store = new FirestoreSessionStore();
await store.put(uid, "aaaaa", JSON.stringify({ messages: [], sourceSheet: { title: "First", items: [] }, savedAt: "2026-09-20T10:00:00.000Z" }));
await store.put(uid, "bbbbb", JSON.stringify({ messages: [], narrativeSheet: { title: "Second", items: [] }, savedAt: "2026-09-20T11:00:00.000Z" }));
console.log("list:", await store.list(uid));
console.log("get aaaaa:", await store.get(uid, "aaaaa"));
console.log("get missing:", await store.get(uid, "zzzzz"));
console.log("other user sees:", await store.list("someone-else"));
const db = getFirestore(firebaseApp(), env.firestoreDatabaseId);
await db.recursiveDelete(db.collection("users").doc(uid));
console.log("cleaned up; remaining:", await store.list(uid));
process.exit(0);
