/* Popup: prefills the current selection, then delegates to the service worker. */

const textEl = document.getElementById("text");
const statusEl = document.getElementById("status");
const originEl = document.getElementById("origin");
const tokenEl = document.getElementById("token");

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = "status" + (kind ? " " + kind : "");
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

(async function init() {
  const { scholarOrigin, scholarToken } = await chrome.storage.sync.get([
    "scholarOrigin",
    "scholarToken",
  ]);
  originEl.value = scholarOrigin || "http://localhost:3000";
  tokenEl.value = scholarToken || "";
  if (!scholarToken) setStatus("Paste your capture token below to start.", "err");

  // Pull whatever the student had highlighted, so the common case is one click.
  try {
    const tab = await activeTab();
    if (tab?.id) {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection()?.toString() ?? "",
      });
      if (result?.result) textEl.value = result.result.trim().slice(0, 4000);
    }
  } catch {
    /* Restricted page (chrome://, web store) — the box just stays empty. */
  }

  textEl.focus();
})();

tokenEl.addEventListener("change", () => {
  chrome.storage.sync.set({ scholarToken: tokenEl.value.trim() });
  setStatus("Token saved.", "ok");
});

originEl.addEventListener("change", () => {
  const value = originEl.value.trim().replace(/\/$/, "");
  chrome.storage.sync.set({ scholarOrigin: value || "http://localhost:3000" });
  setStatus("Address saved.", "ok");
});

document.getElementById("send").addEventListener("click", async () => {
  const text = textEl.value.trim();
  if (text.length < 3) return setStatus("Type a little more first.", "err");

  setStatus("Sending…");
  const tab = await activeTab();
  chrome.runtime.sendMessage(
    { type: "capture", text, sourceUrl: tab?.url, sourceTitle: tab?.title },
    () => { setStatus("Sent to Scholar.", "ok"); setTimeout(() => window.close(), 700); }
  );
});

document.getElementById("page").addEventListener("click", async () => {
  const tab = await activeTab();
  if (!tab?.id) return setStatus("Can't read this page.", "err");

  setStatus("Reading page…");
  chrome.runtime.sendMessage(
    { type: "capturePage", tabId: tab.id, sourceUrl: tab.url, sourceTitle: tab.title },
    () => { setStatus("Sent to Scholar.", "ok"); setTimeout(() => window.close(), 700); }
  );
});
