/** Query parameters that only track where a click came from. */
const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "fbclid", "gclid", "mc_cid", "mc_eid", "igshid", "si", "feature",
]);

/**
 * Normalizes a URL before saving, so "already saved?" checks are reliable:
 * trims, drops tracking params and the fragment, lowercases the host,
 * and rewrites YouTube short links to the canonical watch URL.
 *
 * Returns the input unchanged if it is not a valid absolute URL.
 */
export function normalizeUrl(input: string): string {
  const raw = input.trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }

  url.hostname = url.hostname.toLowerCase();
  url.hash = "";

  if (url.hostname === "youtu.be") {
    const id = url.pathname.slice(1);
    const t = url.searchParams.get("t");
    url = new URL("https://www.youtube.com/watch");
    url.searchParams.set("v", id);
    if (t) url.searchParams.set("t", t);
  } else if (url.hostname === "m.youtube.com" || url.hostname === "youtube.com") {
    url.hostname = "www.youtube.com";
  }

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  }

  return url.toString();
}
