/**
 * Picks up what the service worker kept from the Android share sheet
 * (public/sw.js, receiveShare): the text fields and any files.
 */

const SHARE_CACHE = "nodoteca-share";

export interface ReceivedShare {
  title: string | null;
  text: string | null;
  url: string | null;
  files: File[];
}

interface Meta {
  title: string | null;
  text: string | null;
  url: string | null;
  files: { name: string; type: string }[];
}

const keyFor = (id: string, part: string) => new URL(`${import.meta.env.BASE_URL}__share/${id}/${part}`, location.origin).href;

async function read(id: string): Promise<ReceivedShare | null> {
  if (!("caches" in window) || !/^[a-z0-9]+$/.test(id)) return null;
  const cache = await caches.open(SHARE_CACHE);
  const metaRes = await cache.match(keyFor(id, "meta"));
  if (!metaRes) return null;
  const meta = (await metaRes.json()) as Meta;
  const files = await Promise.all(
    meta.files.map(async (f, i) => {
      const res = await cache.match(keyFor(id, String(i)));
      return res ? new File([await res.blob()], f.name, { type: f.type }) : null;
    }),
  );
  // Taken: the files now live in memory until they are saved or the dialog is closed.
  await Promise.all((await cache.keys()).map((k) => cache.delete(k)));
  return { title: meta.title, text: meta.text, url: meta.url, files: files.filter((f): f is File => !!f) };
}

// Read once per id, even if a component asks twice (React StrictMode runs effects twice).
const taken = new Map<string, Promise<ReceivedShare | null>>();

export function takeShared(id: string): Promise<ReceivedShare | null> {
  let p = taken.get(id);
  if (!p) {
    p = read(id).catch(() => null);
    taken.set(id, p);
  }
  return p;
}
