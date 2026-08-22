# Deploying Varaxis Scholar to Firebase

This is a from-scratch, in-order runbook. It assumes nothing is set up yet —
including the Firebase account itself. Follow it top to bottom the first
time; after that, redeploys are just "push to GitHub" (Step 8 explains why).

This was written and the code was built without being able to run `npm
install`, start a dev server, or talk to Firebase from where it was written —
there was no network path to any of those services. Everything below is
correct to the best of that reasoning, but **you are the first person to
actually run this.** When something errors, paste the exact error back —
that's the plan, not a fallback.

---

## 0. What you're setting up

- **Firestore** — the database (replaces the old local SQLite file).
- **Cloud Storage for Firebase** — homework attachments (replaces storing
  file bytes directly in the database).
- **Firebase App Hosting** — runs the Next.js app itself, on Cloud Run under
  the hood, from a GitHub repo you connect.
- **Secret Manager** (via the Firebase CLI) — holds `AUTH_SECRET` and any
  other secret you don't want sitting in a config file.

Firebase Auth is **not** used — sign-in still runs through Auth.js exactly
as it did locally (email+password, plus optional Google/GitHub/Facebook),
now backed by Firestore instead of SQLite. Each student still pastes their
own AI key in Settings → AI, same as before.

You need the **Blaze (pay-as-you-go)** plan, not Spark. Spark can't run
server code at all — no App Hosting, no Cloud Functions — and this app's AI
parsing, encrypted key storage, and file extraction all run server-side.
Blaze has the exact same free-tier allowances as Spark; you only get billed
for usage *above* those allowances. A personal or hackathon-scale deployment
should sit at $0. Section 11 below explains how to set a budget alert so
you'd know immediately if that ever stopped being true.

---

## 1. Create the Firebase project

Do this with the **new account** you're using for this project.

1. Go to https://console.firebase.google.com/ and sign in.
2. **Add project** → name it (e.g. `varaxis-scholar`) → you can disable
   Google Analytics for this project, it isn't used → **Create project**.
3. Note the **Project ID** shown on the project overview page (not the
   display name — the id, usually lowercase-with-hyphens). You'll need it
   several times below.

## 2. Upgrade to Blaze

1. In the console, click the plan name at the bottom of the left sidebar
   (says "Spark") → **Upgrade**.
2. Attach a billing account (a card is required even though you expect $0).
3. Confirm.

## 3. Enable Firestore, Storage, and App Hosting

Still in the console, for **this project**:

1. Left sidebar → **Build → Firestore Database** → **Create database**.
   - Choose a location close to you (e.g. `us-central`, `europe-west`,
     `asia-south1`) — **this cannot be changed later**, and Storage below
     should use the same one.
   - Start in **production mode** (the app never uses client-side Firestore
     access at all — see `firestore.rules` — so the mode barely matters, but
     production is the safer default).
2. Left sidebar → **Build → Storage** → **Get started**.
   - Same location as Firestore.
   - Production mode, same reasoning.
3. Left sidebar → **Build → App Hosting** → **Get started**. You'll connect
   this to GitHub in Step 8 — for now just confirm the App Hosting product
   itself is enabled for the project.

## 4. Install the Firebase CLI and log in

On your own machine, in a terminal:

```bash
npm install -g firebase-tools
firebase login
```

`firebase login` opens a browser — sign in with the **same new account**
from Step 1.

## 5. Get the project onto your machine

Unzip the project you were sent, `cd` into it, then point it at your
Firebase project:

```bash
cd varaxis-scholar-web
firebase use --add
```

Pick the project you created in Step 1. This writes your real project id
into `.firebaserc` (which currently has a placeholder).

## 6. Local development setup

You can run this locally against your real Firebase project before ever
deploying — useful for catching problems early.

```bash
npm install
cp .env.example .env.local
```

Generate the auth secret:

```bash
npx auth secret
```

This writes `AUTH_SECRET` directly into `.env.local` for you.

Get a service-account key for local Firestore/Storage access:

1. Console → **Project settings** (gear icon) → **Service accounts** tab.
2. **Generate new private key** → confirm → a JSON file downloads.
3. Move that file into the project root and name it `service-account.json`
   (already covered by `.gitignore` — it will never get committed).
4. In `.env.local`, confirm `GOOGLE_APPLICATION_CREDENTIALS="./service-account.json"`
   is uncommented and pointing at it.
5. Set `FIREBASE_STORAGE_BUCKET` in `.env.local` — find the exact value on
   the Storage page in the console (it's shown at the top, looks like
   `your-project-id.firebasestorage.app`).

Then:

```bash
npm run dev
```

Open http://localhost:3000. Sign up for an account, and it should write a
real user document into Firestore — check the console's Firestore Data tab
to confirm a `users` collection appeared. If `npm install` or `npm run dev`
error out, that's exactly the kind of thing to paste back.

## 7. Deploy the security rules and indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

This pushes `firestore.rules`, `firestore.indexes.json`, and `storage.rules`.
The indexes deploy can take a few minutes to finish building on Firebase's
side even after the command returns — that's normal.

## 8. Connect App Hosting to GitHub

App Hosting deploys from a GitHub repository, not a direct file upload — it
watches a branch and rolls out automatically on every push.

1. Push this project to a GitHub repo (create one if you don't have it yet:
   `git init`, `git add`, `git commit`, create the repo on GitHub, `git push`).
2. Console → **App Hosting** → **Create backend**.
3. Connect your GitHub account if prompted, then pick the repo and the
   branch to deploy from (e.g. `main`).
4. Give the backend a name (this becomes part of your URL).
5. It'll ask for the root directory — leave it at `/` unless you put this
   project in a subfolder of the repo.
6. Finish the wizard. It kicks off a first build/deploy immediately — this
   first one will likely fail or partially fail, because the required
   environment variables (`AUTH_URL`, `FIREBASE_STORAGE_BUCKET`) still have
   placeholder values in `apphosting.yaml`. That's expected — continue to
   Step 9 and 10, then it'll succeed on the next push.

## 9. Set the AUTH_SECRET secret

```bash
firebase apphosting:secrets:set auth-secret
```

Paste in the `AUTH_SECRET` value from your `.env.local` (Step 6) when
prompted — reuse the same one so sessions and encrypted API keys stay valid
whether you're running local or deployed. When it asks whether to grant your
App Hosting backend access to the secret, say **yes**.

## 10. Fill in the real environment values

Once Step 8's backend exists, find its URL: console → **App Hosting** → your
backend → the URL shown at the top, something like
`https://your-backend--your-project.us-central1.hosted.app`.

Edit `apphosting.yaml` in the project:

- Set `AUTH_URL` to that exact URL (no trailing slash).
- Set `FIREBASE_STORAGE_BUCKET` to the same bucket value you used in Step 6.

Commit and push:

```bash
git add apphosting.yaml
git commit -m "Configure App Hosting environment"
git push
```

This triggers a new rollout automatically. Watch it under console → App
Hosting → your backend → **Rollouts** — it shows build logs live, which is
where you'll see any build-time error (missing dependency, type error,
etc.) if one exists.

## 11. Set a budget alert (five minutes, worth doing)

Console → gear icon → **Usage and billing** → **Details & settings** →
set a budget alert at, say, $1 or $5. This emails you if anything ever
starts costing money — it does not cap or stop anything, it just tells you.
Given `maxInstances: 1` in `apphosting.yaml` and the BYOK AI model (each
student's AI usage is billed to *their* provider account, not yours), this
should stay quiet indefinitely for personal or hackathon-scale traffic.

## 12. Try it

Visit your App Hosting URL. Sign up for an account, add an AI key under
Settings → AI, capture a homework note, confirm it saves. Check the
Firestore Data tab in the console to see the documents actually landing
where the schema in `src/lib/db.ts`'s neighbors describes.

## 13. The browser extension

The extension itself isn't part of this Next.js project (it wasn't in
`varaxis-scholar/`, so it isn't something this port touched). Its capture
requests need to point at your deployed origin — `https://your-backend--...`
— instead of `http://localhost:3000`. Check `src/components/ExtensionSetup.tsx`
for exactly what URL it tells the student to use, and check the extension's
own source (wherever that lives) for where its API base URL is configured.

---

## Known differences from the local SQLite version

Worth knowing about, not necessarily worth fixing:

- **Deleting a homework item deletes its attachments** (Storage bytes and
  Firestore doc) immediately, since Firestore has no cascading foreign keys
  and leaving orphaned files around would quietly burn Storage quota. The
  original SQLite schema did this via `ON DELETE CASCADE` too, so behavior
  matches — only the *mechanism* changed.
- **Task-completion history (`taskEvents`) is NOT deleted when its homework
  item is deleted** — same as the original (`ON DELETE SET NULL`), the
  event just keeps a `homeworkId` that no longer resolves to anything. Every
  place that reads `taskEvents` uses it for aggregate stats, not to look the
  homework back up, so this is harmless.
- **Composite Firestore indexes**: two queries need them
  (`attachments` filtered by `homeworkId` + ordered by `createdAt`, and
  `timetable` ordered by three fields). Both are already declared in
  `firestore.indexes.json` and deployed in Step 7. If you ever add a new
  sort/filter combination to a query and see a `FAILED_PRECONDITION: The
  query requires an index` error, Firestore's error message includes a
  direct console link to create exactly the index it wants — click it.
- **`resolveAIConfig`, `listHomework`, and basically everything else in
  `src/lib`** is now `async` — the Admin SDK is asynchronous where
  better-sqlite3 was synchronous. Every call site was updated to `await`
  it, but if you add a new call site, remember it needs one too.
