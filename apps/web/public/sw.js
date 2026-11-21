// Nodoteca service worker: makes the app installable, loads it offline and
// receives what the Android share sheet sends.
// - page navigations: network first, cached app shell as fallback
// - hashed build assets (/assets/*): cache first (their names change on every build)
// - POST to /share (manifest share_target): links and files shared from other apps
// - everything else (Supabase API, images from other sites): untouched

const CACHE = "nodoteca-v1";
// Holds the last thing shared until the app picks it up (see src/lib/share.ts).
const SHARE_CACHE = "nodoteca-share";
const SHELL = new URL("index.html", self.registration.scope).href;
const SHARE_URL = new URL("share", self.registration.scope);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== SHARE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/**
 * The share sheet POSTs a multipart form (title, text, url, files). A page
 * can't read a POST body, so keep it in a cache and send the app to
 * /share?shared=<id>, where it is picked up and removed.
 */
async function receiveShare(req) {
  const form = await req.formData();
  const field = (name) => {
    const v = form.get(name);
    return typeof v === "string" ? v : null;
  };
  const meta = { title: field("title"), text: field("text"), url: field("url"), files: [] };
  try {
    const cache = await caches.open(SHARE_CACHE);
    // One share at a time: forget anything left from an earlier one.
    await Promise.all((await cache.keys()).map((k) => cache.delete(k)));
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const files = form.getAll("files").filter((f) => typeof f !== "string");
    await Promise.all(
      files.map((f, i) =>
        cache.put(
          new URL(`__share/${id}/${i}`, self.registration.scope).href,
          new Response(f, { headers: { "content-type": f.type || "application/octet-stream" } }),
        ),
      ),
    );
    meta.files = files.map((f) => ({ name: f.name || "file", type: f.type || "" }));
    await cache.put(new URL(`__share/${id}/meta`, self.registration.scope).href, Response.json(meta));
    const to = new URL(SHARE_URL);
    to.searchParams.set("shared", id);
    return Response.redirect(to.href, 303);
  } catch {
    // Couldn't keep the files: still pass the link along, the old way.
    const to = new URL(SHARE_URL);
    for (const k of ["title", "text", "url"]) if (meta[k]) to.searchParams.set(k, meta[k]);
    return Response.redirect(to.href, 303);
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.method === "POST" && url.pathname === SHARE_URL.pathname) {
    event.respondWith(receiveShare(req));
    return;
  }
  if (req.method !== "GET") return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(SHELL, res.clone()));
          return res;
        })
        .catch(() => caches.match(SHELL)),
    );
    return;
  }

  if (url.pathname.includes("/assets/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
  }
});
