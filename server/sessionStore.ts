// Session persistence in Firestore, scoped to the signed-in user.
//
// Layout: users/{uid}/sessions/{id}. The client's saved-session JSON is
// stored verbatim in `json` so it round-trips exactly; `title` and
// `savedAt` are denormalized for the list view.

import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { firebaseApp } from "./auth";
import { env } from "./env";

export type SessionListItem = {
  id: string;
  title: string | null;
  savedAt: string | null;
};

export interface SessionStore {
  list(uid: string): Promise<SessionListItem[]>;
  /** Returns the raw saved JSON, or null if the session does not exist. */
  get(uid: string, id: string): Promise<string | null>;
  put(uid: string, id: string, json: string): Promise<void>;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
// Firestore documents cap at 1 MiB; leave headroom for the metadata fields.
export const MAX_SESSION_BYTES = 900 * 1024;

export function isValidSessionId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/** Pulls a display title and timestamp out of a saved session body. */
export function summarize(json: string): Omit<SessionListItem, "id"> {
  try {
    const data = JSON.parse(json) as {
      sourceSheet?: { title?: unknown };
      narrativeSheet?: { title?: unknown } | null;
      savedAt?: unknown;
    };
    const pick = (t: unknown) =>
      typeof t === "string" && t.trim().length > 0 ? t.trim() : null;
    const title =
      pick(data.narrativeSheet?.title) ?? pick(data.sourceSheet?.title);
    const savedAt = typeof data.savedAt === "string" ? data.savedAt : null;
    return { title, savedAt };
  } catch {
    return { title: null, savedAt: null };
  }
}

export class FirestoreSessionStore implements SessionStore {
  private readonly db: Firestore;

  constructor(db?: Firestore) {
    this.db = db ?? getFirestore(firebaseApp(), env.firestoreDatabaseId);
  }

  private sessions(uid: string) {
    return this.db.collection("users").doc(uid).collection("sessions");
  }

  async list(uid: string): Promise<SessionListItem[]> {
    const snap = await this.sessions(uid)
      .select("title", "savedAt")
      .orderBy("savedAt", "desc")
      .get();
    return snap.docs.map((d) => {
      const { title, savedAt } = d.data() as {
        title?: string | null;
        savedAt?: string | null;
      };
      return { id: d.id, title: title ?? null, savedAt: savedAt ?? null };
    });
  }

  async get(uid: string, id: string): Promise<string | null> {
    const snap = await this.sessions(uid).doc(id).get();
    if (!snap.exists) return null;
    const { json } = snap.data() as { json?: unknown };
    return typeof json === "string" ? json : null;
  }

  async put(uid: string, id: string, json: string): Promise<void> {
    const { title, savedAt } = summarize(json);
    await this.sessions(uid).doc(id).set({
      json,
      title,
      // Fall back to server time so unsaved-at sessions still sort.
      savedAt: savedAt ?? new Date().toISOString(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}
