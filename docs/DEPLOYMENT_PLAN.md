# Deployment plan: Chidush Builder on Google Cloud

Living document. Claude updates it as work lands. The first section always
says what, if anything, Brett needs to do in GCP right now.

## Your next GCP action

**Status: deployed and verified. Two small Console items remain.**

Production smoke test passed 2026-09-20: sign-in, a multi-tool turn, and a
direct `/s/:id` reload on the run.app URL; session and usage counters
confirmed in Firestore; 111/111 API requests 200 in Cloud Run logs.

Still yours:
1. Anthropic console → set a monthly spend limit (https://console.anthropic.com/settings/limits).
2. Confirm a billing budget exists for `chidush-builder` (CLI cannot see budgets).
3. `chidush.torahlabs.org` goes live when DNS + certificate finish.

## Target shape

One Cloud Run service built from this repo. It serves the Vite bundle and
exposes routes under `/api`:

| Route | Purpose |
|---|---|
| `POST /api/anthropic/v1/messages` | Streaming proxy. Server owns model, prompts, tools, max_tokens. Client sends only message history. |
| `GET /api/sefaria/*` | Pass-through to sefaria.org with an identifying User-Agent. |
| `GET/POST /api/sessions[/:id]` | Session CRUD on Firestore, scoped to the signed-in user. |
| `GET /api/usage` | Today's counters for the signed-in user. |

Firebase Authentication (Google sign-in only) gates everything. The
Anthropic key lives in Secret Manager and never reaches the client.

Repo layout after the work:

- `server/` — Node + TypeScript API (Hono). `tsx` in dev, compiled in the container.
- `shared/` — prompts, tool schemas and names, session/usage types. Imported by both client and server.
- `src/` — the React client. The Anthropic SDK points at `/api/anthropic` with a placeholder key and sends the Firebase ID token as a header.
- Vite dev server proxies `/api` to the local server. The old session middleware and Sefaria proxy config are removed.

### Firestore schema (server-written only; client rules deny all)

| Path | Contents |
|---|---|
| `users/{uid}` | email, displayName, createdAt, optional `allowed` flag |
| `users/{uid}/sessions/{id}` | SavedSession fields + denormalized `title`, `updatedAt` |
| `users/{uid}/usage/{YYYY-MM-DD}` | requests, inputTokens, outputTokens |
| `config/limits` | dailyRequests, dailyOutputTokens — editable without redeploy |

### Abuse protection

- Per-user daily caps on requests and output tokens, checked before proxying.
- Up to 3 concurrent streaming turns per user; beyond that the oldest is aborted (never a refusal, so a dropped connection cannot lock anyone out).
- Server-side request shaping (client cannot pick model/prompt/tools).
- Cloud Run max instances ≈ 3, request timeout 10 min.
- GCP billing budget alerts + Anthropic console spend limit.
- Optional email allowlist at sign-in for a soft launch.

## Build phases

Each phase is one commit and is testable locally before moving on.

- [x] **Phase 1 — Server scaffold + proxies (no auth).** *Done 2026-09-20.*
  `server/` (Hono) with Anthropic streaming proxy (server-side body
  rewrite), Sefaria pass-through, and file-backed sessions behind a
  `SessionStore` interface ready for the Firestore swap. Prompts and tool
  schemas moved to `shared/`. Vite proxies `/api`. Key is server-only.
  Verified: greeting, multi-tool turn, autosave all flow through the proxy;
  built bundle contains no key. `npm run dev` starts both processes.
- [x] **Phase 2 — Firebase Auth.** *Done 2026-09-20.*
  Google sign-in screen, sign-out avatar in the header, ID token attached to
  every `/api` call (including the Claude stream via a custom SDK fetch).
  Server `requireAuth` middleware verifies tokens; `/api/health` stays open.
  Verified: 401 when signed out; full flow works signed in.
- [x] **Phase 3 — Firestore sessions.** *Done 2026-09-20.*
  `users/{uid}/sessions/{id}` with the saved JSON stored verbatim plus
  denormalized title/savedAt; `users/{uid}` profile touched once per
  process. 900 KB cap per session (Firestore 1 MiB doc limit). File store
  removed. Verified with `npm run check:firestore` and live use.
  `npm run peek:users` lists what is in the database.
- [x] **Phase 4 — Usage counters + limits.** *Done 2026-09-20.*
  `users/{uid}/usage/{YYYY-MM-DD}` counters (requests, input/output/cache
  tokens) updated from the SSE stream; `reserveRequest` transaction checks
  `config/limits` (set 2026-09-20 to 300 requests / 300k output tokens per UTC day,
  cached 60s) before proxying. Limit errors return 403 in Anthropic error
  shape so the client SDK shows the message without retrying. Up to 3
  concurrent turns per user, oldest aborted beyond that. `GET /api/usage`
  returns today's counters. Verified with `npm run check:usage` and a
  live turn (76 in / 68 out / 11k cache-read tokens recorded).
  To change limits without a redeploy: `npm run set:limits -- <requests>
  <outputTokens>`, or edit `config/limits` in the Firestore console.
- [x] **Phase 5 — Containerize + deploy.** *Done 2026-09-20.* Deployed via `npm run deploy`; prod smoke test passed.
  Multi-stage `Dockerfile` (build client + server, then a slim runtime
  image running `node dist-server/index.js`). Verified locally with
  `NODE_ENV=production`: static bundle, SPA fallback for `/s/:id`, assets,
  open `/api/health`, 401 on protected routes. `.dockerignore` excludes
  `.env`, `sessions/`, `node_modules`. Remaining: GCP steps 7 and 8, then
  a signed-in smoke test on the `run.app` URL.
- [~] **Phase 6 — Hardening.** *In progress.*
  - [x] Max instances (3) and 10-min timeout set in `scripts/deploy.sh`.
  - [x] Prompt caching maximized (2026-09-20): one 1-hour breakpoint on
    the shared tools+system prefix, plus top-level automatic caching so the
    conversation tail is re-read each turn. Verified directly against the
    API: second identical request read 11,392 cached tokens, 2 uncached.
    Per-turn usage is logged (`[usage] ...`) in Cloud Run logs.
  - [ ] Anthropic console monthly spend limit (Brett).
  - [ ] Confirm GCP billing budget exists (Brett).
  - [ ] Optional: email allowlist for a soft launch.
  - [ ] Optional: uptime check on `/api/health`.
  - [ ] Optional: proxy Firebase `/__/auth/*` via custom domain once live.
- [x] **Phase 7 — Migrate old sessions.** *Done 2026-09-20.* Imported the
  four real legacy sessions under Brett's account; skipped two Claude test
  sessions (`3rc75`, `zmo3d`). Script kept: `npm run migrate:sessions --
  <uid> [--apply] [--skip=id,id]`. The `sessions/` folder is now only an
  archive and can be deleted.

## GCP configuration steps (in order)

Project ID: **`chidush-builder`**. Every command below is written for that
ID. Each step is labeled **Console** (do it in a browser) or **CLI** (paste
into a terminal). Steps 1–6 unblock phases 2–3. Steps 7–8 happen during
phase 5.

- [x] **1a. Create the project.** *Done — `chidush-builder`.*
- [x] **1b. Billing (Console).** *Billing linked; budget per Brett.* https://console.cloud.google.com/billing/linkedaccount?project=chidush-builder
  → link a billing account. Then https://console.cloud.google.com/billing/budgets
  → Create budget → scope it to project `chidush-builder`, pick a monthly
  amount you're comfortable with, alert thresholds 50% and 100%.
- [x] **1c. CLI setup (CLI, once).** *Done.* Install the gcloud CLI if you don't
  have it (https://cloud.google.com/sdk/docs/install), then:
  ```bash
  gcloud auth login
  ```
  ```bash
  gcloud config set project chidush-builder
  ```
  Every later `gcloud` command relies on that default. Confirm with
  `gcloud config get project` — it must print `chidush-builder`.
- [x] **2. Enable APIs (CLI).** *Done — all six enabled.*
  ```bash
  gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com firestore.googleapis.com identitytoolkit.googleapis.com --project chidush-builder
  ```
- [x] **3. Firebase Authentication (Console).** *Done — web config in `.env`.*
  1. https://console.firebase.google.com/project/chidush-builder/authentication
     → Get started → Sign-in method → Google → Enable → pick a support
     email → Save.
  2. https://console.firebase.google.com/project/chidush-builder/settings/general
     → under "Your apps" click the web icon `</>` → nickname
     `chidush-web`, leave Hosting unchecked → Register app.
  3. It shows a `firebaseConfig` object. apiKey, authDomain, projectId
     and appId go in `src/auth/firebaseConfig.ts` (public identifiers,
     safe to commit).
  `localhost` is already an authorized domain, so local sign-in works.
- [x] **4. Firestore (Console).** *Done — database ID is `chidush-builder-db` (not `(default)`), so the server reads `FIRESTORE_DATABASE_ID` from `.env` and the deploy command sets it.*
  1. https://console.firebase.google.com/project/chidush-builder/firestore
     → Create database → location `us-central1` (nam5 multi-region is
     also fine) → **Native mode** → start in **production mode** → Create.
  2. Rules tab → replace the contents with the deny-all rules below →
     Publish. Only the server (Admin SDK, bypasses rules) touches data.
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /{document=**} { allow read, write: if false; }
    }
  }
  ```
- [x] **5. Secret Manager (CLI).** *Done.* Reads the key from `.env` so it never
  appears in your shell history:
  ```bash
  grep '^ANTHROPIC_API_KEY=' .env | cut -d= -f2- | tr -d '\n' | gcloud secrets create anthropic-api-key --data-file=- --project chidush-builder
  ```
- [x] **6. Local credentials + service account (CLI).** *Done.*
  Local dev credentials (opens a browser; sign in with the same Google
  account that owns the project):
  ```bash
  gcloud auth application-default login
  ```
  Service account for Cloud Run and its two roles:
  ```bash
  gcloud iam service-accounts create chidush-run --display-name "Chidush Cloud Run" --project chidush-builder
  ```
  ```bash
  gcloud projects add-iam-policy-binding chidush-builder --member serviceAccount:chidush-run@chidush-builder.iam.gserviceaccount.com --role roles/datastore.user
  ```
  ```bash
  gcloud secrets add-iam-policy-binding anthropic-api-key --member serviceAccount:chidush-run@chidush-builder.iam.gserviceaccount.com --role roles/secretmanager.secretAccessor --project chidush-builder
  ```
  `GOOGLE_CLOUD_PROJECT=chidush-builder` is already in `.env`.
- [x] **7. Deploy (CLI, during phase 5).** *Done 2026-09-20 — revision 2, after fixing the Firebase config build issue.* All flags live in
  `scripts/deploy.sh`; edit that file to change region, instance caps, etc.
  ```bash
  npm run deploy
  ```
  Prints the service URL when done.
- [~] **8. Post-deploy (Console).** *Authorized domains done (both run.app hostnames + custom domain). Spend limit pending.*
  1. Copy the `https://chidush-....run.app` URL the deploy prints.
  2. https://console.firebase.google.com/project/chidush-builder/authentication/settings
     → Authorized domains → Add domain → paste the hostname (no
     `https://`). Add every hostname the app is served from:
     `chidush-1085338993481.us-central1.run.app` and
     `chidush.torahlabs.org`. Without this, Google sign-in fails in prod.
  3. https://console.anthropic.com/settings/limits → set a monthly spend
     limit.
  4. Custom domain: Cloud Run domain mapping for `chidush.torahlabs.org`
     is created; it goes live once the DNS records are in place and the
     certificate is issued (Cloud Run console → Domain mappings shows
     status). Once live, consider proxying Firebase's `/__/auth/*` through
     our server and setting `authDomain` to the custom domain to remove
     the cross-site sign-in hop (phase 6).

## Local development

`.env` (gitignored) holds server secrets and public client config:

```
ANTHROPIC_API_KEY=...            # server only
GOOGLE_CLOUD_PROJECT=chidush-builder  # server only, from GCP step 6
FIRESTORE_DATABASE_ID=chidush-builder-db
```

The public Firebase web config is committed in `src/auth/firebaseConfig.ts`
(it must be in source: `.env` is excluded from the container build, and
Vite bakes these values in at build time). `VITE_FIREBASE_*` env vars
override it only if you want local dev on a different Firebase project.

Two processes, one command (`npm run dev`): Vite on 5173 proxying `/api` to
the server on 8787. The server reads `.env` for `ANTHROPIC_API_KEY` and
`GOOGLE_CLOUD_PROJECT` and uses Application Default Credentials, so the same
code runs unchanged in Cloud Run. Dev and prod share one Firestore database
and one Firebase user pool for now.

When you want to split dev from prod later: Firestore supports multiple named
databases per project, so a `dev` database is a config change, not a new
project. That is also when to stop using ADC and give the local server its
own limited service account.

## Decisions log

- 2026-09-20: Google sign-in required; no anonymous use.
- 2026-09-20: Keep the Sefaria proxy (insulates from CORS policy changes, allows caching + User-Agent).
- 2026-09-20: Dev and prod share one Firestore database for now.
- 2026-09-20: Session migration is last priority.
