# Deploying Varaxis Scholar to Vercel + Neon

A from-scratch runbook, no credit card required anywhere in it. Follow it top to
bottom the first time; after that, redeploys are just "push to GitHub."

---

## 0. What you're setting up

- **Neon** — a hosted Postgres database (replaces the local SQLite file). Free
  tier, no card required.
- **Vercel** — runs the Next.js app itself. Free (Hobby) tier, no card required,
  and it's made by the same team as Next.js so there's effectively zero
  configuration needed.

Attachments (uploaded files) are stored as base64 text directly in Postgres,
same structural choice the SQLite version made — simplest possible setup, no
third service to configure. If you end up storing a lot of large attachments
and outgrow Neon's free storage tier, moving them to Vercel Blob (also free to
start) is a contained change to `src/lib/queries.ts` — not a rewrite.

Auth still runs through Auth.js exactly as it did locally (email+password,
plus optional Google/GitHub/Facebook) — nothing about sign-in changes, it just
reads and writes Postgres instead of a SQLite file. Each student still pastes
their own AI key in Settings → AI.

---

## 1. Create the Neon project

1. Go to https://neon.tech and sign up (GitHub sign-in is fastest — no card
   anywhere in this flow).
2. **Create a project** → name it (e.g. `varaxis-scholar`) → pick a region
   close to you → **Create**.
3. On the project's connection-details panel, make sure **"Pooled connection"**
   is toggled on, then copy the connection string shown — it looks like:
   ```
   postgres://user:password@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
   ```
   The `-pooler` in the hostname matters: it routes through PgBouncer, which is
   what makes a plain Postgres connection string work well from Vercel's
   serverless functions (each request can open and close a connection quickly
   without exhausting Neon's connection limit).

That's the whole database setup — no schema to write by hand. The app creates
every table itself on first real query (see "Known differences" below).

---

## 2. Push the code to GitHub

If it isn't already:

```bash
cd varaxis-scholar-web
git init
git add .
git commit -m "Vercel + Postgres build"
```

Create a repo on GitHub and push to it (create it empty, no README, then):

```bash
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

---

## 3. Create the Vercel project

1. Go to https://vercel.com and sign up (GitHub sign-in again is fastest).
2. **Add New → Project** → pick the repo you just pushed → **Import**.
3. Framework preset should auto-detect as **Next.js** — leave everything else
   at its default.
4. Before clicking Deploy, open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Neon pooled connection string from step 1 |
   | `AUTH_SECRET` | output of `npx auth secret` (run locally once, or `openssl rand -base64 32`) |
   | `AUTH_URL` | leave blank for now — you'll set this in step 5 once you have a real URL |

5. Click **Deploy**. The first build will likely fail or half-work because
   `AUTH_URL` isn't set yet — that's expected, continue to step 4.

---

## 4. Set AUTH_URL and redeploy

1. Once the first deploy finishes (or fails), Vercel shows your project's URL —
   something like `https://your-project.vercel.app`.
2. Project → **Settings → Environment Variables** → edit `AUTH_URL` → set it to
   that exact URL, no trailing slash.
3. **Deployments** tab → the three-dot menu on the latest deployment →
   **Redeploy**.

From here on, every `git push` to your main branch redeploys automatically —
no manual redeploy step needed again.

---

## 5. Try it

Visit your `.vercel.app` URL. Sign up for an account, add an AI key under
Settings → AI, capture a homework note, confirm it saves and reappears after a
refresh. If something 500s, Vercel's project → **Logs** tab shows the actual
server error — that's the thing to paste back if you get stuck.

---

## 6. One-tap sign-in (optional)

If you want Google/GitHub/Facebook buttons on the login page, see `SETUP.md` —
same steps as local dev, just use your real `https://your-project.vercel.app`
URL instead of `http://localhost:3000` for the callback URLs, and add the
resulting `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` (etc.) as Vercel environment
variables the same way you added `DATABASE_URL` above.

---

## 7. The browser extension

Same as the local build: the extension isn't part of this Next.js project. Its
capture requests need to point at your deployed origin
(`https://your-project.vercel.app`) instead of `http://localhost:3000`. Check
`src/components/ExtensionSetup.tsx` for exactly what URL it tells the student
to use.

---

## Known differences from the local SQLite version

- **Postgres, not SQLite.** The schema is functionally identical — same
  tables, same columns, same relationships — just created in a real database
  instead of a local file. `src/lib/db.ts` creates every table with
  `CREATE TABLE IF NOT EXISTS` the first time any query actually runs, so
  there's nothing to migrate by hand, and adding a new column later (as the
  app evolves) is equally automatic (Postgres supports
  `ADD COLUMN IF NOT EXISTS` directly).
- **Column names are double-quoted internally.** Postgres lowercases any
  unquoted identifier, which would silently turn `userId` into `userid`. The
  database layer (`src/lib/db.ts`) quotes camelCase identifiers automatically
  wherever they appear in a query, so every other file's SQL reads exactly
  like the original SQLite version — this is invisible day-to-day, it only
  matters if you're writing new raw SQL and wondering why a column needs
  quoting.
- **Every database call is now asynchronous.** better-sqlite3 was
  synchronous; a network database can't be. Every function that touches the
  database returns a `Promise` now and every call site `await`s it — if you
  add a new one, remember it needs `await` too (`tsc --noEmit` will catch a
  forgotten one almost every time).
- **Attachments live in Postgres as base64 text**, same as the original
  SQLite `data` column — no separate file storage service to set up. Fine for
  personal-scale use; worth revisiting only if attachments get large or
  numerous enough to strain Neon's free storage tier.
- **`npm run build` doesn't touch the real database.** Building requires
  `DATABASE_URL` to be *set* (even to a placeholder) but never actually
  connects during the build — the connection and schema creation both happen
  lazily, on the first real request after deploy, not at build or import time.
