# Setting up one-tap sign-in

You only need to do this for the providers you actually want. Email + password works
without any of it. Each takes about five minutes.

For all three, the **callback URL** while developing locally is:

```
http://localhost:3000/api/auth/callback/<provider>
```

After adding any credentials, **restart the dev server** — the buttons appear automatically.

---

## Google

1. Go to https://console.cloud.google.com/
2. Create a project (top bar → project dropdown → **New Project**). Name it `Varaxis Scholar`.
3. Left menu → **APIs & Services** → **OAuth consent screen**.
   - User type: **External**, then **Create**.
   - App name: `Varaxis Scholar`. Support email: your email. Developer email: your email. Save.
   - Scopes: skip (Save and continue).
   - Test users: **Add users** → add your own Google address. This matters — while the app
     is unpublished, only listed test users can sign in.
4. Left menu → **Credentials** → **Create credentials** → **OAuth client ID**.
   - Application type: **Web application**
   - Name: `Scholar local`
   - **Authorised JavaScript origins**: `http://localhost:3000`
   - **Authorised redirect URIs**: `http://localhost:3000/api/auth/callback/google`
   - **Create**
5. Copy the Client ID and Client secret into `.env.local`:

```env
AUTH_GOOGLE_ID="....apps.googleusercontent.com"
AUTH_GOOGLE_SECRET="GOCSPX-...."
```

---

## GitHub

1. Go to https://github.com/settings/developers → **OAuth Apps** → **New OAuth App**
2. Fill in:
   - Application name: `Varaxis Scholar`
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
3. **Register application**
4. Copy the Client ID. Click **Generate a new client secret** and copy that too — it is
   shown only once.

```env
AUTH_GITHUB_ID="Iv1...."
AUTH_GITHUB_SECRET="...."
```

---

## Facebook

Facebook is the fiddliest of the three; skip it if you're in a hurry.

1. Go to https://developers.facebook.com/apps → **Create app**
2. Use case: **Authenticate and request data from users with Facebook Login** → Next
3. App type: **Consumer** (if asked). Name it `Varaxis Scholar`, add your contact email, create.
4. In the app dashboard: **Add product** → **Facebook Login** → **Set up** → **Web**
   - Site URL: `http://localhost:3000`
5. Left menu → **Facebook Login** → **Settings**
   - **Valid OAuth Redirect URIs**: `http://localhost:3000/api/auth/callback/facebook`
   - Save changes
6. Left menu → **App settings** → **Basic**. Copy the **App ID** and **App Secret**.

```env
AUTH_FACEBOOK_ID="....."
AUTH_FACEBOOK_SECRET="....."
```

Note: Facebook requires HTTPS for live apps. In **development mode** localhost is allowed,
and only you (and users you add under **App roles**) can sign in — that's fine for now.

---

## Google Calendar sync (optional, separate from Google sign-in)

This reuses the same Google OAuth client as "Continue with Google" above — it just needs one
more redirect URI added, and a broader scope granted at connect time. If you haven't set up
Google sign-in yet, do that first.

1. In the same Google Cloud Console OAuth client you created for sign-in, add a second
   **Authorised redirect URI**:
   `https://your-project.vercel.app/api/calendar/google/callback`
   (or `http://localhost:3000/api/calendar/google/callback` for local dev).
2. That's it on the Google Cloud side — no new client, no new credentials. Scholar requests
   the `calendar.events` scope only when a student clicks **Connect** in Settings →
   Preferences → Calendar, using the existing `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`.
3. Because `calendar.events` is a Google "sensitive scope," the OAuth consent screen will show
   a more prominent warning than plain sign-in does, and while your app is in Testing mode
   only the test users you added under **OAuth consent screen → Test users** can connect it —
   same restriction as sign-in itself. Moving to Production for real users eventually requires
   Google's verification process for sensitive scopes; fine to defer until you have real users
   beyond yourself.
4. `AUTH_URL` must point at your real deployed origin for this to work (the callback route
   builds the redirect URI from it) — same requirement as sign-in.

What it actually syncs: pushing an assignment creates a Google Calendar event; editing or
deleting *that specific event* on the Google Calendar side syncs back to the assignment. It
does not import unrelated events already on the calendar as homework — seeing a dentist
appointment turn into an "assignment" would be worse than not syncing at all. See the doc
comment at the top of `src/lib/calendar/googleSync.ts` for the full reasoning.

---

## When you deploy later

Change two things:

1. `AUTH_URL` in the environment → your real origin, e.g. `https://scholar.varaxis.com`
2. In each provider's console, add the production callback URL alongside the localhost one:
   `https://scholar.varaxis.com/api/auth/callback/<provider>`

Keep the localhost entries so local development keeps working.

### Adding these to Vercel via the CLI

If your Vercel project was created by importing `.env.example` through the web UI first
(the standard "New Project" import flow), every variable in that file — including
`AUTH_GOOGLE_ID`, `AUTH_GITHUB_ID`, etc. — already exists as a blank placeholder for both
Production and Preview. Running `vercel env add AUTH_GOOGLE_ID production` at that point
fails with "A variable with the name already exists." Remove the blank one first, then add
the real value:

```
vercel env rm AUTH_GOOGLE_ID production
vercel env add AUTH_GOOGLE_ID production
```

When pasting a long value at the interactive `? Value?` prompt, prefer piping it in instead
of pasting directly — some terminals (PowerShell in particular) can mangle a long paste at
that prompt:

```
echo "the-real-value" | vercel env add AUTH_GOOGLE_ID production
```

Repeat for `AUTH_GOOGLE_SECRET`, and the GitHub/Facebook equivalents. Redeploy afterward
(`vercel --prod`, or your `scholardeploy` alias if you set one up) — env var changes don't
take effect until the next deploy.

### Managing linked sign-in methods

Once more than one sign-in method exists for the same email, Settings → Account shows a
"Sign-in methods" section listing everything currently linked (email/password, and each
connected OAuth provider), with an Unlink button per provider. It refuses to unlink the last
remaining way to sign in, so an account can never be locked out by its own settings page.

There's no one-click "link a new provider while already signed in" button — Auth.js doesn't
support that out of the box without deeper custom callback work. To link an additional
provider to an existing account: sign out, then sign in with the new provider using the same
email address. Auth.js matches by email and links it automatically (that's what
`allowDangerousEmailAccountLinking: true` in `auth.config.ts` does) — no separate merge step
needed.

---

## Troubleshooting

**"redirect_uri_mismatch"** — the callback URL in the provider console doesn't exactly match.
Check for a trailing slash, `http` vs `https`, and the provider name at the end of the path.

**Google says "access blocked / app not verified"** — you haven't added your account under
**Test users** on the OAuth consent screen.

**Buttons don't appear** — the app only shows a provider whose ID *and* secret are both
non-empty in `.env.local`. Check for typos in the variable names and restart the server.

**"Configuration" error page** — `AUTH_SECRET` is missing. Run `npx auth secret`.

**Signed in with Google, but it made a second account** — you previously signed up with the
same email and a password. The app links them automatically by email; if you see a duplicate,
delete `data/scholar.db` and start clean (dev only).
