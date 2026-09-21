// One-off: imports legacy sessions/*.json files into Firestore under a user.
// Usage: npm run migrate:sessions -- <uid> [--apply] [--skip=id,id]
// Without --apply it only prints what it would do. Existing ids are skipped.

import { promises as fs } from "node:fs";
import path from "node:path";
import { FirestoreSessionStore, summarize } from "../sessionStore";

const [uid, ...flags] = process.argv.slice(2);
if (!uid) {
  console.error("usage: migrateSessions <uid> [--apply] [--skip=id,id]");
  process.exit(1);
}
const apply = flags.includes("--apply");
const skip = new Set(
  flags.find((f) => f.startsWith("--skip="))?.slice(7).split(",") ?? [],
);
const dir = path.resolve("sessions");
const store = new FirestoreSessionStore();
const existing = new Set((await store.list(uid)).map((s) => s.id));

const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
for (const file of files) {
  const id = file.slice(0, -".json".length);
  const json = await fs.readFile(path.join(dir, file), "utf8");
  const { title, savedAt } = summarize(json);
  const size = Buffer.byteLength(json);
  const status = skip.has(id)
    ? "skip (flag)"
    : existing.has(id)
      ? "skip (exists)"
      : apply
        ? "import"
        : "would import";
  console.log(`${status.padEnd(14)} ${id}  ${(size / 1024).toFixed(0).padStart(4)} KB  ${savedAt ?? "-"}  ${title ?? "(untitled)"}`);
  if (apply && !existing.has(id) && !skip.has(id)) await store.put(uid, id, json);
}
console.log(apply ? "done" : "dry run only; add --apply to write");
process.exit(0);
