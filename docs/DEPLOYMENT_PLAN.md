# Deployment plan: Chidush Builder on Google Cloud

Living document. Claude updates it as work lands. The first section always
says what, if anything, Brett needs to do in GCP right now.

## Your next GCP action

**Status: nothing needed until phase 5.** GCP steps 1–6 are complete
and verified. Steps 7–8 come with the first deploy.

Known quirk seen 2026-09-20: the very first Google sign-in on a fresh
browser landed back on the sign-in screen; the second attempt worked.
Watch for it in prod; if it recurs, the fix is to proxy Firebase's
`/__/auth/*` handler through our own domain.

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
- One in-flight turn per user.
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
- [ ] **Phase 4 — Usage counters + limits.**
  Parse usage from final `message_delta`, transactional daily counter,
  cap check before proxy, one-turn-at-a-time. Client renders limit errors.
  Test: set caps to 2 requests and hit the wall.
- [ ] **Phase 5 — Containerize + deploy.**
  Multi-stage Dockerfile; first `gcloud run deploy`; smoke test prod.
  *Needs GCP steps 5, 7, 8.*
- [ ] **Phase 6 — Hardening.**
  Budget alert, max instances, Anthropic spend limit, uptime check,
  optional allowlist.
- [ ] **Phase 7 — Migrate old sessions.**
  One-off script: `sessions/*.json` → Firestore under Brett's uid. Last.

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
  3. It shows a `firebaseConfig` object. Copy these four values into
     `.env` (they are public identifiers, safe in the client bundle):
     ```
     VITE_FIREBASE_API_KEY=<apiKey>
     VITE_FIREBASE_AUTH_DOMAIN=chidush-builder.firebaseapp.com
     VITE_FIREBASE_PROJECT_ID=chidush-builder
     VITE_FIREBASE_APP_ID=<appId>
     ```
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
- [ ] **7. Deploy (CLI, during phase 5).**
  ```bash
  gcloud run deploy chidush --source . --region us-central1 --project chidush-builder --service-account chidush-run@chidush-builder.iam.gserviceaccount.com --set-secrets ANTHROPIC_API_KEY=anthropic-api-key:latest --set-env-vars GOOGLE_CLOUD_PROJECT=chidush-builder,FIRESTORE_DATABASE_ID=chidush-builder-db --allow-unauthenticated --max-instances 3 --timeout 600 --concurrency 20
  ```
- [ ] **8. Post-deploy (Console).**
  1. Copy the `https://chidush-....run.app` URL the deploy prints.
  2. https://console.firebase.google.com/project/chidush-builder/authentication/settings
     → Authorized domains → Add domain → paste the hostname (no
     `https://`). Without this, Google sign-in fails in prod.
  3. https://console.anthropic.com/settings/limits → set a monthly spend
     limit.
  Custom domain later via Cloud Run domain mapping if wanted.

## Local development

`.env` (gitignored) holds server secrets and public client config:

```
ANTHROPIC_API_KEY=...            # server only
GOOGLE_CLOUD_PROJECT=chidush-builder  # server only, from GCP step 6
FIRESTORE_DATABASE_ID=chidush-builder-db
VITE_FIREBASE_API_KEY=...        # client, from GCP step 3
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
```

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
