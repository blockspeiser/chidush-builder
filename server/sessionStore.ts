// Session persistence. The file-backed store is a stopgap until Firestore
// lands in phase 3; the interface is what the routes depend on.

import { promises as fs } from "node:fs";
import path from "node:path";

export type SessionListItem = {
  id: string;
  title: string | null;
  savedAt: string | null;
};

export interface SessionStore {
  list(): Promise<SessionListItem[]>;
  /** Returns the raw saved JSON, or null if the session does not exist. */
  get(id: string): Promise<string | null>;
  put(id: string, json: string): Promise<void>;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidSessionId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/** Pulls a display title and timestamp out of a saved session body. */
export function summarize(id: string, json: string): SessionListItem {
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
    return { id, title, savedAt };
  } catch {
    return { id, title: null, savedAt: null };
  }
}

export function sortNewestFirst(items: SessionListItem[]): SessionListItem[] {
  return [...items].sort((a, b) => {
    if (a.savedAt && b.savedAt) return b.savedAt.localeCompare(a.savedAt);
    if (a.savedAt) return -1;
    if (b.savedAt) return 1;
    return 0;
  });
}

export class FileSessionStore implements SessionStore {
  constructor(private readonly dir: string) {}

  private file(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }

  async list(): Promise<SessionListItem[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.dir);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
    const ids = entries
      .filter((e) => e.endsWith(".json"))
      .map((e) => e.slice(0, -".json".length));
    const items = await Promise.all(
      ids.map(async (id) => {
        const json = await this.get(id);
        return json ? summarize(id, json) : { id, title: null, savedAt: null };
      }),
    );
    return sortNewestFirst(items);
  }

  async get(id: string): Promise<string | null> {
    try {
      return await fs.readFile(this.file(id), "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async put(id: string, json: string): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.file(id), json, "utf8");
  }
}
