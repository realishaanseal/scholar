# Varaxis Scholar (web)

AI homework organiser. A **Varaxis** product.

Capture an assignment by typing or speaking it — however messily. The AI rewrites it
into a clean task, works out the subject, resolves the deadline ("next Friday" → an
actual date), estimates effort, and flags urgency. You review and edit before anything
is saved. Overdue and due-today work is pushed to the top of the list.

This is the **Firebase-hosted** build: the same app as the local version, with the data
layer swapped from a local SQLite file to Firestore + Cloud Storage, so anyone can sign
up and use it from a browser without installing anything. See **[DEPLOY.md](./DEPLOY.md)**
for the full, from-scratch setup and deployment runbook.

---

## Run it locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Local development still talks to a real Firebase project (Firestore + Storage) — there's
no local-only mode, since the whole point of this build is the hosted backend. DEPLOY.md
section 6 covers getting a service-account key and `FIREBASE_STORAGE_BUCKET` value for
that. Once `.env.local` is filled in, open http://localhost:3000.

**Generate AUTH_SECRET** (required):

```bash
npx auth secret
```

With no AI key configured at all, the app still works — it falls back to a built-in
offline parser. Add a free AI key (below) for much sharper results.

---

## AI provider

**The easiest way is in the app: sign in, click the gear icon, then Settings → AI settings.**

Pick a provider, click through to its site to grab a key, paste it in, hit **Test connection**
to confirm it works, then **Save**. That's it — no file editing, no restart.

| Provider | Cost | Get a key |
|---|---|---|
| **Google Gemini** *(recommended)* | Free tier | https://aistudio.google.com/apikey |
| **Groq** | Free tier, fastest | https://console.groq.com/keys |
| **OpenRouter** | Free tier, many models | https://openrouter.ai/keys |
| **OpenAI (GPT)** | Paid | https://platform.openai.com/api-keys |
| **Anthropic (Claude)** | Paid | https://console.anthropic.com/settings/keys |
| **Ollama** | Free, fully offline, local dev only | https://ollama.com/download |
| **Built-in offline parser** | Free, no key | — |

From that screen you can also change the model, replace the key, or delete it outright.

**How keys are stored.** Encrypted with AES-256-GCM before they touch Firestore, using a
key derived from `AUTH_SECRET`. The plaintext key is never sent back to the browser — the
UI only ever receives a masked hint like `AIza…GHIJ`. Settings are per account.

**`.env.local` / `apphosting.yaml`** can still set a fallback provider for any account that
hasn't saved its own settings — useful if you want a default for everyone. Anything an
account saves in the app takes priority over it.

---

## Sign-in

Email + password works immediately. Google / GitHub / Facebook one-tap buttons appear on
the login page **only once you add their credentials** — see [SETUP.md](./SETUP.md) for the
step-by-step for each provider, and DEPLOY.md for adding the production callback URL once
you're live.

---

## Voice

Uses the browser's built-in speech recognition where available (Chrome/Edge), and falls
back to server-side transcription through whichever AI provider is configured (Settings →
AI) everywhere else — see `src/lib/ai/transcribe.ts` and `src/lib/audio/wav.ts`.

---

## Project structure

```
src/
  app/
    page.tsx                     landing
    login/  signup/              auth pages
    dashboard/                   the app
    settings/                    AI + account settings
    api/                         every server route — see DEPLOY.md's "known differences"
                                  section for what's async now vs. the local build
  components/                    unchanged from the local build — the UI never talks to
                                  the database directly, only through src/app/api/**
  lib/
    db.ts                        Firebase Admin init (Firestore + Storage) — the one file
                                  that knows how the connection is made
    queries.ts                   all core data access (subjects, homework, attachments)
    settings.ts                  per-user AI settings, env fallback
    crypto.ts                    AES-256-GCM for stored API keys (unchanged)
    adapter.ts                   Auth.js <-> Firestore
    auth.config.ts               edge-safe auth (used by middleware, unchanged)
    auth.ts                      full auth (adapter + password login)
    captureToken.ts              browser-extension bearer token, with a top-level
                                  captureTokens/{token} index for O(1) lookup
    scholar/
      memory.ts                  academic memory — aggregates fetched-all + computed in JS
                                  (Firestore has no server-side GROUP BY)
      analytics.ts                same fetch-all-then-aggregate shape
      snapshot.ts                 assembles the shared state for dashboard/coach/notifications
    ai/
      index.ts                   config resolution + fallback
      catalog.ts                 provider list, links, models (client-safe)
      providers.ts               one adapter per API dialect
      prompt.ts                  the system prompt (tune this first)
      heuristic.ts               offline no-key parser
```

Your data lives in Firestore (`users/{uid}/...`) and Cloud Storage (`attachments/{uid}/...`).

---

## Where to go next

- `src/lib/ai/prompt.ts` is the single highest-leverage file — the whole quality of the
  product lives in that prompt.
- The `subjects` subcollection already exists per-user, so a subjects settings screen
  (rename, recolour, merge) is a small addition.
- `DEPLOY.md`'s "Known differences from the local SQLite version" section lists the small
  set of behavioral edges (cascading deletes, composite indexes) worth knowing about.

---

© Varaxis. Internal development build.
