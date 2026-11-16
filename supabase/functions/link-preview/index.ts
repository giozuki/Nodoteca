// Nodoteca: link-preview Edge Function (Deno)
//
// POST { "url": "https://..." }  ->  { url, title, description, thumbnail_url, site_name, metadata }
//
// Browsers cannot read other sites' HTML (CORS), so this function does it for
// the app: YouTube via oEmbed, everything else via OpenGraph / <title> tags.
// Only signed-in users can call it (verify_jwt is on by default).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const USER_AGENT = "Mozilla/5.0 (compatible; NodotecaBot/0.1; link preview)";
const TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 512 * 1024;
const MAX_REDIRECTS = 5;

interface Preview {
  url: string;
  title?: string | null;
  description?: string | null;
  thumbnail_url?: string | null;
  site_name?: string | null;
  metadata?: Record<string, unknown>;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(await isSignedIn(req))) return json({ error: "unauthorized" }, 401);

  let url: URL;
  try {
    const body = await req.json();
    url = new URL(String(body?.url ?? ""));
  } catch {
    return json({ error: "invalid_url" }, 400);
  }
  if (!isAllowed(url)) return json({ error: "invalid_url" }, 400);

  try {
    const preview = (isYouTube(url) && (await youtube(url))) || (await generic(url));
    return json(clean(preview));
  } catch {
    // A preview is a nice-to-have: never fail the save because of it.
    return json({ url: url.toString(), site_name: hostLabel(url) });
  }
});

// --- Safety -----------------------------------------------------------------

/**
 * Only real, signed-in users may use this function. The gateway's verify_jwt
 * also lets through the public keys (anon / publishable), so we ask Supabase
 * Auth whether the bearer token belongs to an actual user.
 */
async function isSignedIn(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return false;
  const user = await res.json().catch(() => null);
  return typeof user?.id === "string";
}

function isAllowed(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  // IPv4 literals in private / loopback / link-local ranges
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224) return false;
  }
  // IPv6 loopback / unique-local / link-local
  if (host.includes(":") && (host === "::1" || host === "::" || /^f[cd]/.test(host) || host.startsWith("fe80"))) return false;
  return true;
}

async function safeFetch(start: URL, accept: string): Promise<{ res: Response; finalUrl: URL }> {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current, {
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT, Accept: accept, "Accept-Language": "en,it;q=0.8" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      const next = new URL(location, current);
      if (!isAllowed(next)) throw new Error("redirect to a blocked host");
      current = next;
      continue;
    }
    return { res, finalUrl: current };
  }
  throw new Error("too many redirects");
}

// --- YouTube ----------------------------------------------------------------

function isYouTube(url: URL): boolean {
  return /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(url.hostname);
}

async function youtube(url: URL): Promise<Preview | null> {
  const endpoint = new URL("https://www.youtube.com/oembed");
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("url", url.toString());
  const res = await fetch(endpoint, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const data = await res.json();
  return {
    url: url.toString(),
    title: data.title,
    site_name: "YouTube",
    thumbnail_url: data.thumbnail_url,
    metadata: { kind: "youtube", author: data.author_name },
  };
}

// --- Any web page -----------------------------------------------------------

async function generic(url: URL): Promise<Preview> {
  const { res, finalUrl } = await safeFetch(url, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5");
  const type = res.headers.get("content-type") ?? "";

  if (!type.includes("html")) {
    await res.body?.cancel();
    const isImage = type.startsWith("image/");
    return {
      url: url.toString(),
      site_name: hostLabel(finalUrl),
      title: decodeURIComponent(finalUrl.pathname.split("/").pop() || "") || null,
      thumbnail_url: isImage ? finalUrl.toString() : null,
      metadata: { kind: isImage ? "image" : "file", content_type: type.split(";")[0] },
    };
  }

  const html = await readLimited(res, MAX_HTML_BYTES);
  const headEnd = html.search(/<\/head>/i);
  const head = headEnd > 0 ? html.slice(0, headEnd) : html;

  const image = meta(head, ["og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src"]);
  return {
    url: url.toString(),
    title: meta(head, ["og:title", "twitter:title"]) ?? tagText(head, "title"),
    description: meta(head, ["og:description", "twitter:description", "description"]),
    site_name: meta(head, ["og:site_name", "application-name"]) ?? hostLabel(finalUrl),
    thumbnail_url: image ? absolute(image, finalUrl) : null,
    metadata: { kind: meta(head, ["og:type"]) ?? "page" },
  };
}

async function readLimited(res: Response, limit: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  const all = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) { all.set(c, offset); offset += c.byteLength; }
  const charset = res.headers.get("content-type")?.match(/charset=([\w-]+)/i)?.[1] ?? "utf-8";
  try { return new TextDecoder(charset).decode(all); } catch { return new TextDecoder().decode(all); }
}

function meta(html: string, names: string[]): string | null {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const tag = html.match(new RegExp(`<meta\\b[^>]*\\b(?:property|name)\\s*=\\s*["']${escaped}["'][^>]*>`, "i"))?.[0];
    const content = tag?.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const value = content?.[1] ?? content?.[2];
    if (value?.trim()) return decodeEntities(value.trim());
  }
  return null;
}

function tagText(html: string, tag: string): string | null {
  const text = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"))?.[1]?.trim();
  return text ? decodeEntities(text.replace(/\s+/g, " ")) : null;
}

function decodeEntities(s: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return named[code.toLowerCase()] ?? m;
  });
}

function absolute(href: string, base: URL): string | null {
  try {
    const u = new URL(href, base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function hostLabel(url: URL): string {
  return url.hostname.replace(/^www\./, "");
}

/** Trim to the column limits in the database. */
function clean(p: Preview): Preview {
  const cut = (s: string | null | undefined, n: number) => (s ? s.slice(0, n) : null);
  return {
    url: p.url,
    title: cut(p.title, 1000),
    description: cut(p.description, 5000),
    thumbnail_url: cut(p.thumbnail_url, 8192),
    site_name: cut(p.site_name, 200),
    metadata: p.metadata ?? {},
  };
}
