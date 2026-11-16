// Nodoteca extension service worker.
// Receives the session from the web app's connect-extension.html page (see the
// "externally_connectable" origins in manifest.json) and parks it in
// chrome.storage until the popup opens and signs in with it.

import { HANDOFF_KEY } from "./handoff.ts";

interface SessionMessage {
  type: "nodoteca:session";
  access_token: string;
  refresh_token: string;
}

function isSessionMessage(m: unknown): m is SessionMessage {
  const x = m as Partial<SessionMessage> | null;
  return x?.type === "nodoteca:session" && typeof x.access_token === "string" && typeof x.refresh_token === "string";
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  // Only the connect page may hand over a session.
  const fromConnectPage = !!sender.url && new URL(sender.url).pathname.endsWith("/connect-extension.html");
  if (!fromConnectPage || !isSessionMessage(message)) {
    sendResponse({ ok: false });
    return;
  }
  const { access_token, refresh_token } = message;
  void chrome.storage.local.set({ [HANDOFF_KEY]: { access_token, refresh_token } }).then(() => sendResponse({ ok: true }));
  return true; // keep the channel open for the async response
});
