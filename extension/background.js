/*
  Varaxis Scholar — browser extension service worker.

  Deliberately thin. It does not parse anything, store any homework, or talk to
  an AI provider: it captures text and hands it to the running Scholar app,
  which already knows how to parse, review and save. Duplicating any of that
  here would mean two implementations drifting apart.

  Authentication uses a capture token the student pastes in once. A session
  cookie cannot work: this runs on a chrome-extension:// origin, and Scholar's
  SameSite=Lax session cookie is never sent across that boundary.
*/

const DEFAULT_ORIGIN = "http://localhost:3000";

async function getConfig() {
  const { scholarOrigin, scholarToken } = await chrome.storage.sync.get([
    "scholarOrigin",
    "scholarToken",
  ]);
  return { origin: scholarOrigin || DEFAULT_ORIGIN, token: scholarToken || "" };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "scholar-add-selection",
    title: 'Add "%s" to Scholar',
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "scholar-add-page",
    title: "Send this page to Scholar",
    contexts: ["page"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "scholar-add-selection" && info.selectionText) {
    await sendToScholar(info.selectionText, tab?.url, tab?.title);
    return;
  }

  if (info.menuItemId === "scholar-add-page" && tab?.id) {
    const text = await extractPageText(tab.id);
    if (text) await sendToScholar(text, tab.url, tab.title);
  }
});

/**
 * Pull the readable text out of the active tab.
 *
 * Runs in the page rather than fetching the URL, so it works on pages behind a
 * login — which is where assignments actually live.
 */
async function extractPageText(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const clone = document.body.cloneNode(true);
        clone.querySelectorAll("script,style,nav,header,footer,svg,noscript").forEach((n) => n.remove());
        return (clone.innerText || "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 8000);
      },
    });
    return result?.result ?? "";
  } catch {
    return "";
  }
}

async function sendToScholar(text, sourceUrl, sourceTitle) {
  const { origin, token } = await getConfig();

  if (!token) {
    return notify(
      "Add your capture token",
      "Open the extension, then paste the token from Scholar → Settings → Preferences."
    );
  }

  try {
    const res = await fetch(`${origin}/api/extension/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        text,
        sourceUrl: sourceUrl ?? null,
        sourceTitle: sourceTitle ?? null,
        nowISO: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });

    if (res.status === 401) {
      return notify("Token not accepted", "Copy a fresh capture token from Scholar → Settings → Preferences.");
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return notify("Couldn't send that", body.error || `Scholar returned ${res.status}.`);
    }

    const data = await res.json();
    notify(
      "Saved to Scholar",
      data.title ? `${data.title}${data.dueAt ? ` — due ${formatDate(data.dueAt)}` : ""}` : "Added for review."
    );
  } catch {
    notify("Scholar isn't running", `Couldn't reach ${origin}. Start Scholar and try again.`);
  }
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title,
    message: message.slice(0, 200),
  });
}

// The popup uses the same path, so capture logic lives in exactly one place.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "capture") {
    sendToScholar(msg.text, msg.sourceUrl, msg.sourceTitle).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === "capturePage" && msg.tabId) {
    extractPageText(msg.tabId)
      .then((text) => sendToScholar(text, msg.sourceUrl, msg.sourceTitle))
      .then(() => sendResponse({ ok: true }));
    return true;
  }
});
