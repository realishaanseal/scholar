# Varaxis Scholar

AI homework organiser. A **Varaxis** product.

Capture an assignment by typing or speaking it — however messily. The AI rewrites it
into a clean task, works out the subject, resolves the deadline ("next Friday" → an
actual date), estimates effort, and flags urgency. You review and edit before anything
is saved. Overdue and due-today work is pushed to the top of the list.

Two ways to run this: locally on your own machine (data in a local Postgres
database — see below), or deployed as a real hosted site anyone can sign into,
on Vercel + Neon (free, no card required) — see `DEPLOY.md`. Either way,
nothing is sent anywhere except the AI provider you choose.

---

## Run it

After one-time setup (below), from any terminal:

```
scholar
```

That starts the dev server and opens http://localhost:3000 in your browser.

| Command | What it does |
|---|---|
| `scholar` | start the dev server and open the browser |
| `scholar build` | production build, then serve it |
| `scholar stop` | stop whatever Scholar is running |
| `scholar status` | is it running, and where |
| `scholar open` | just open the browser |
| `scholar update` | reinstall dependencies |
| `scholar help` | the full list |

Port defaults to 3000; override with `$env:SCHOLAR_PORT = 4000`.

### One-time setup for the `scholar` command

Double-click **`Install Scholar Command.cmd`** in the `bin` folder, or run:

```powershell
cd "$HOME\Desktop\Varaxis AI\bin"
.\install-scholar.ps1
```

It adds that folder to your *user* PATH — no admin rights, nothing system-wide.
Undo it any time with `.\install-scholar.ps1 -Uninstall`.

The launcher installs dependencies on first run and generates `AUTH_SECRET`
if it is missing, so there is nothing else to do.

### Or run it manually

This build talks to Postgres rather than a local SQLite file, so you need a
`DATABASE_URL` pointing at one. The zero-install option is a free Neon
project (see `DEPLOY.md` step 1 for exactly how) — a "dev" database there
works fine for local use, no need for a separate one per environment unless
you want that separation. If you'd rather run Postgres locally instead,
that works too (`postgres://postgres:<pw>@localhost:5432/scholar`).

```bash
npm install
cp .env.example .env.local
# edit .env.local: set DATABASE_URL, and AUTH_SECRET (see below)
npm run dev
```

Open http://localhost:3000

With no AI API keys at all the app still works — it falls back to a built-in
offline parser. Add a free AI key (below) for much sharper results.

**Generate AUTH_SECRET** (required):

```bash
npx auth secret
```
or
```bash
openssl rand -base64 32
```
Paste the value into `AUTH_SECRET` in `.env.local`.

**To deploy this as a real hosted site** instead of running it locally, see
`DEPLOY.md` — Vercel + Neon, free, no credit card required.

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
| **Ollama** | Free, fully offline | https://ollama.com/download |
| **Built-in offline parser** | Free, no key | — |

From that screen you can also change the model, replace the key, or delete it outright.

**How keys are stored.** Encrypted with AES-256-GCM before they touch the database, using a
key derived from `AUTH_SECRET`. The plaintext key is never sent back to the browser — the UI
only ever receives a masked hint like `AIza…GHIJ`. Settings are per account.

**`.env.local` still works** and acts as the fallback for any account that hasn't saved its own
settings — useful if you want a default for everyone. See `.env.example` for every variable.
Anything saved in the app takes priority over it.

**Nothing configured at all?** The app still runs on a built-in offline parser. If your chosen
provider is down, rate-limited, or the key is wrong, Scholar falls back to that parser and marks
the result as degraded rather than losing what you typed.

---

## Sign-in

Email + password works immediately. Google / GitHub one-tap buttons appear on
the login page **only once you add their credentials** — see [SETUP.md](./SETUP.md) for the
step-by-step for each provider (about 5 minutes each).

---

## Voice

Uses the browser's built-in speech recognition — no API, no upload, no cost. Works in
**Chrome and Edge**. Other browsers keep full typing support and simply hide the mic.
Hit the mic, talk, hit it again. The transcript lands in the box; you can edit it before
sending it to the AI.

---

## Project structure

```
src/
  app/
    page.tsx                     landing
    login/  signup/              auth pages
    dashboard/                   the app
    settings/                    AI + account settings
    api/
      auth/[...nextauth]/        Auth.js handlers
      signup/                    email account creation
      ai/parse/                  raw note  ->  structured homework
      homework/                  list + create
      homework/[id]/             update + delete
      settings/ai/               read / save / delete AI settings
      settings/ai/test/          live key check against the provider
  components/
    Capture.tsx                  text + voice input
    VoiceCapture.tsx             Web Speech API hook
    ReviewCard.tsx               approve/edit the AI's version
    HomeworkItem.tsx             one assignment, inline editing
    Dashboard.tsx                state, filters, urgency bar
    SubjectRail.tsx              completion ring, subject spread, up-next
    AISettingsPanel.tsx          provider picker, key management, test
    SettingsNav.tsx              settings section switcher
    Backdrop.tsx                 ambient aurora background
  lib/
    db.ts                        SQLite connection + schema
    queries.ts                   all data access
    settings.ts                  per-user AI settings, env fallback
    crypto.ts                    AES-256-GCM for stored API keys
    adapter.ts                   Auth.js <-> SQLite
    auth.config.ts               edge-safe auth (used by middleware)
    auth.ts                      full auth (adapter + password login)
    format.ts                    deadline formatting + urgency rules
    ai/
      index.ts                   config resolution + fallback
      catalog.ts                 provider list, links, models (client-safe)
      providers.ts               one adapter per API dialect
      prompt.ts                  the system prompt (tune this first)
      heuristic.ts               offline no-key parser
```

Your data lives in `data/scholar.db`. Delete that file to start clean.

---

## Where to go next

- `src/lib/ai/prompt.ts` is the single highest-leverage file — the whole quality of the
  product lives in that prompt.
- Swapping SQLite for Postgres when you go multi-user: only `src/lib/db.ts` and
  `src/lib/queries.ts` need to change.
- The `Subject` table already exists per-user, so a subjects settings screen (rename,
  recolour, merge) is a small addition.

---

© Varaxis. Internal development build.
