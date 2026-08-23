# Varaxis Scholar — browser extension

Send any assignment you find on a page straight into Scholar.

## Install

1. Unzip this folder somewhere permanent — Chrome loads it from disk every time, so don't leave it in Downloads.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode**, top right.
4. Click **Load unpacked** and select this folder.
5. Click the Scholar icon in the toolbar, then paste your **capture token**.

Find the token in Scholar under **Settings → Preferences → Browser extension**.

## Use

- **Highlight text → right-click → "Add … to Scholar"** — the fastest path.
- **Right-click anywhere → "Send this page to Scholar"** — reads the whole page, useful for an assignment brief.
- **Click the toolbar icon** — opens a box prefilled with whatever you'd highlighted, so you can edit before sending.

Captured text goes through the same AI parsing as anything typed into Scholar: it works out the subject, deadline, priority and effort. Items added this way save straight away rather than pausing for review — you're on another site and can't approve a draft you can't see — so they're tagged in their notes as extension-captured, worth a quick glance later.

## Why a token instead of just using my login?

The extension runs on a `chrome-extension://` origin. Scholar's session cookie is `SameSite=Lax`, which by design is never sent across that boundary, so the extension would always look signed-out. The token is a credential scoped to one capability — adding homework — rather than a full session.

Treat it like a password. If it leaks, hit **Rotate token** in Scholar and the old one stops working immediately.

## If Scholar isn't on localhost:3000

Change the address in the extension popup. If you're running Scholar on a different port or host, also add that origin to `host_permissions` in `manifest.json` and reload the extension.

## What it doesn't do

No tracking, no analytics, no background page-reading. It only ever sends text when you explicitly ask it to, and only to the Scholar address you configured.
