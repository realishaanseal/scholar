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

## When you deploy later

Change two things:

1. `AUTH_URL` in the environment → your real origin, e.g. `https://scholar.varaxis.com`
2. In each provider's console, add the production callback URL alongside the localhost one:
   `https://scholar.varaxis.com/api/auth/callback/<provider>`

Keep the localhost entries so local development keeps working.

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
