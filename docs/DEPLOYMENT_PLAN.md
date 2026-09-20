# Deployment plan: Chidush Builder on Google Cloud

Living document. Claude updates it as work lands. The first section always
says what, if anything, Brett needs to do in GCP right now.

## Your next GCP action

**Status: READY FOR YOU — do GCP steps 1 through 6.**

Phase 1 is complete and committed. Phases 2 and 3 (auth, Firestore) cannot
be built or tested until the Firebase project exists. When you finish,
Claude needs three things from you:

1. The project ID.
2. The Firebase web app config (apiKey, authDomain, projectId, appId) —
   paste it into `.env` as `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
   `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`. These are public
   identifiers, safe in the client bundle.
3. Confirmation that `gcloud auth application-default login` succeeded and
   `GOOGLE_CLOUD_PROJECT=<id>` is in `.env`.

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
- [ ] **Phase 2 — Firebase Auth.**
  Sign-in screen; ID token on every request; server verifies with Admin SDK.
  Test: signed out → all API 401; signed in → works.
  *Needs GCP steps 1–3 and 6 (ADC login).*
- [ ] **Phase 3 — Firestore sessions.**
  Replace file middleware with Firestore routes scoped to uid. Client
  `session/api.ts` changes URLs/headers only.
  Test: create, autosave, list, reload from URL, switch.
  *Needs GCP steps 4 and 6.*
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

Steps 1–6 unblock phases 2–3. Steps 7–8 happen during phase 5.

- [ ] **1. Project + billing.** Create the project in the Firebase console
  (creates the GCP project too). Link billing. Create a budget with alerts
  at 50% and 100% of a monthly amount you're comfortable with.
- [ ] **2. Enable APIs.**
  ```bash
  gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com firestore.googleapis.com identitytoolkit.googleapis.com
  ```
- [ ] **3. Firebase Authentication.** Enable the Google provider. Register a
  Web app; copy its public config (apiKey, authDomain, projectId, appId)
  into `.env` as `VITE_FIREBASE_*`. `localhost` is already authorized.
- [ ] **4. Firestore.** Create the default database, Native mode, same region
  as Cloud Run (recommend `us-central1`). Publish deny-all rules:
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /{document=**} { allow read, write: if false; }
    }
  }
  ```
- [ ] **5. Secret Manager.** Create secret `anthropic-api-key` with your key.
- [ ] **6. Local credentials + service account.**
  ```bash
  gcloud auth application-default login
  gcloud iam service-accounts create chidush-run --display-name "Chidush Cloud Run"
  gcloud projects add-iam-policy-binding PROJECT_ID --member serviceAccount:chidush-run@PROJECT_ID.iam.gserviceaccount.com --role roles/datastore.user
  gcloud secrets add-iam-policy-binding anthropic-api-key --member serviceAccount:chidush-run@PROJECT_ID.iam.gserviceaccount.com --role roles/secretmanager.secretAccessor
  ```
  Put `GOOGLE_CLOUD_PROJECT=PROJECT_ID` in the server `.env`.
- [ ] **7. Deploy.**
  ```bash
  gcloud run deploy chidush --source . --region us-central1 --service-account chidush-run@PROJECT_ID.iam.gserviceaccount.com --set-secrets ANTHROPIC_API_KEY=anthropic-api-key:latest --set-env-vars GOOGLE_CLOUD_PROJECT=PROJECT_ID --allow-unauthenticated --max-instances 3 --timeout 600 --concurrency 20
  ```
- [ ] **8. Post-deploy.** Add the `*.run.app` hostname to Firebase Auth
  authorized domains. Set the Anthropic console spend limit. Custom domain
  later via Cloud Run domain mapping if wanted.

## Local development

`.env` (gitignored) holds server secrets and public client config:

```
ANTHROPIC_API_KEY=...            # server only
GOOGLE_CLOUD_PROJECT=...         # server only, from GCP step 6
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
