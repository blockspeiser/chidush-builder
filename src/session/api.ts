// Persistence of a study session against the server API, plus URL slugs.

const SESSIONS = "/api/sessions";

import { authFetch } from "../auth/authFetch";
import type { Msg } from "../chat/types";
import type { StudySnapshot } from "../study/useStudyState";

export type SavedSession = Partial<StudySnapshot> & {
  messages?: Msg[];
  savedAt?: string;
};

export type SessionListItem = {
  id: string;
  title: string | null;
  savedAt: string | null;
};

function sessionUrl(id: string): string {
  return `${SESSIONS}/${encodeURIComponent(id)}`;
}

export function shortSessionId(): string {
  // 5 base36 chars (~60M unique). Personal app — plenty.
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0] % 36 ** 5).toString(36).padStart(5, "0");
}

export function sessionPath(id: string): string {
  return `/s/${id}`;
}

export function readSlugFromUrl(): string | null {
  const m = window.location.pathname.match(/^\/s\/([A-Za-z0-9_-]{1,128})\/?$/);
  return m ? m[1] : null;
}

export function replaceUrl(path: string) {
  if (window.location.pathname === path) return;
  window.history.replaceState(null, "", path);
}

/** Throws on a non-2xx response (including 404). */
export async function fetchSession(id: string): Promise<SavedSession> {
  const resp = await authFetch(sessionUrl(id));
  if (!resp.ok) throw new Error(`load ${resp.status}`);
  return (await resp.json()) as SavedSession;
}

export async function saveSession(
  id: string,
  data: Omit<SavedSession, "savedAt">,
): Promise<void> {
  await authFetch(sessionUrl(id), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...data,
      savedAt: new Date().toISOString(),
    } satisfies SavedSession),
  });
}

export async function renameSession(id: string, title: string): Promise<void> {
  const resp = await authFetch(sessionUrl(id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!resp.ok) throw new Error(`rename ${resp.status}`);
}

export async function deleteSession(id: string): Promise<void> {
  const resp = await authFetch(sessionUrl(id), { method: "DELETE" });
  if (!resp.ok) throw new Error(`delete ${resp.status}`);
}

export async function listSessions(): Promise<SessionListItem[]> {
  const resp = await authFetch(SESSIONS);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = (await resp.json()) as { sessions?: SessionListItem[] };
  return Array.isArray(data.sessions) ? data.sessions : [];
}
