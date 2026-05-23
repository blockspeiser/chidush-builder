import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const SESSIONS_DIR = path.resolve(process.cwd(), "sessions");

function safeId(raw: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(raw)) return null;
  return raw;
}

function send(res: ServerResponse, status: number, body?: unknown) {
  res.statusCode = status;
  if (body === undefined) {
    res.end();
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
    );
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sessionsPlugin(): Plugin {
  return {
    name: "chidush-sessions",
    configureServer(server) {
      server.middlewares.use("/sessions", async (req, res, next) => {
        try {
          const url = req.url ?? "/";
          // List: GET /sessions or /sessions/
          if ((url === "/" || url === "") && req.method === "GET") {
            try {
              const entries = await fs.readdir(SESSIONS_DIR);
              const ids = entries
                .filter((e) => e.endsWith(".json"))
                .map((e) => e.slice(0, -".json".length));
              const sessions = await Promise.all(
                ids.map(async (id) => {
                  try {
                    const raw = await fs.readFile(
                      path.join(SESSIONS_DIR, `${id}.json`),
                      "utf8",
                    );
                    const data = JSON.parse(raw) as {
                      sourceSheet?: { title?: unknown };
                      narrativeSheet?: { title?: unknown } | null;
                      savedAt?: unknown;
                    };
                    const narrativeTitle =
                      typeof data?.narrativeSheet?.title === "string"
                        ? (data.narrativeSheet.title as string).trim()
                        : "";
                    const notesTitle =
                      typeof data?.sourceSheet?.title === "string"
                        ? (data.sourceSheet.title as string).trim()
                        : "";
                    const title =
                      narrativeTitle.length > 0
                        ? narrativeTitle
                        : notesTitle.length > 0
                          ? notesTitle
                          : null;
                    const savedAt =
                      typeof data?.savedAt === "string"
                        ? (data.savedAt as string)
                        : null;
                    return { id, title, savedAt };
                  } catch {
                    return { id, title: null, savedAt: null };
                  }
                }),
              );
              sessions.sort((a, b) => {
                if (a.savedAt && b.savedAt)
                  return b.savedAt.localeCompare(a.savedAt);
                if (a.savedAt) return -1;
                if (b.savedAt) return 1;
                return 0;
              });
              send(res, 200, { sessions });
            } catch (e) {
              const code = (e as NodeJS.ErrnoException).code;
              if (code === "ENOENT") send(res, 200, { sessions: [] });
              else throw e;
            }
            return;
          }
          const match = url.match(/^\/([^/?#]+)/);
          if (!match) return next();
          const id = safeId(decodeURIComponent(match[1]));
          if (!id) {
            send(res, 400, { error: "invalid id" });
            return;
          }
          const file = path.join(SESSIONS_DIR, `${id}.json`);

          if (req.method === "GET") {
            try {
              const data = await fs.readFile(file, "utf8");
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(data);
            } catch (e) {
              const code = (e as NodeJS.ErrnoException).code;
              if (code === "ENOENT") send(res, 404, { error: "not found" });
              else throw e;
            }
            return;
          }
          if (req.method === "POST" || req.method === "PUT") {
            const body = await readBody(req);
            try {
              JSON.parse(body);
            } catch {
              send(res, 400, { error: "invalid JSON" });
              return;
            }
            await fs.mkdir(SESSIONS_DIR, { recursive: true });
            await fs.writeFile(file, body, "utf8");
            send(res, 200, { ok: true, id });
            return;
          }
          if (req.method === "DELETE") {
            try {
              await fs.unlink(file);
              send(res, 200, { ok: true });
            } catch (e) {
              const code = (e as NodeJS.ErrnoException).code;
              if (code === "ENOENT") send(res, 404, { error: "not found" });
              else throw e;
            }
            return;
          }
          send(res, 405, { error: "method not allowed" });
        } catch (err) {
          console.error("[sessions] error", err);
          send(res, 500, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), sessionsPlugin()],
  server: {
    proxy: {
      "/sefaria-api": {
        target: "https://www.sefaria.org",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/sefaria-api/, "/api"),
      },
    },
  },
});
