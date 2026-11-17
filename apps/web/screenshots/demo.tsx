// Renders the real app with invented data, for the README screenshot (see capture.mjs).
const P = new URLSearchParams(location.search);
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER = uuid(999);
const day = (d: number, h = 10) => new Date(Date.UTC(2026, 10, 17 - d, h, 12)).toISOString();

// --- Abstract thumbnails -------------------------------------------------------
function art(kind: string, a: string, b: string, c: string, w = 640, h = 360) {
  const bg = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>`;
  let s = "";
  if (kind === "city") {
    s += `<circle cx="${w * 0.5}" cy="${h * 0.62}" r="${h * 0.3}" fill="${c}" opacity=".9"/>`;
    for (let i = 0; i < 14; i++) { const bw = w / 14, bh = h * (0.18 + ((i * 37) % 23) / 50); s += `<rect x="${i * bw}" y="${h - bh}" width="${bw - 3}" height="${bh}" fill="#0b0a14" opacity=".85"/>`; }
    for (let i = 1; i < 6; i++) s += `<line x1="0" y1="${h - i * 9}" x2="${w}" y2="${h - i * 9}" stroke="${c}" stroke-opacity=".25"/>`;
  } else if (kind === "waves") {
    for (let i = 0; i < 6; i++) { const y = h * 0.35 + i * h * 0.11; s += `<path d="M0 ${y} C ${w * 0.25} ${y - 40}, ${w * 0.5} ${y + 40}, ${w} ${y - 10} L ${w} ${h} L 0 ${h} Z" fill="${c}" opacity="${0.12 + i * 0.08}"/>`; }
  } else if (kind === "sun") {
    s += `<circle cx="${w * 0.68}" cy="${h * 0.42}" r="${Math.min(w, h) * 0.22}" fill="${c}"/><path d="M0 ${h * 0.72} L ${w * 0.3} ${h * 0.45} L ${w * 0.55} ${h * 0.7} L ${w * 0.75} ${h * 0.55} L ${w} ${h * 0.75} L ${w} ${h} L 0 ${h} Z" fill="#000" opacity=".35"/>`;
  } else if (kind === "grid") {
    for (let x = 0; x < w; x += 40) s += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="#fff" stroke-opacity=".12"/>`;
    for (let y = 0; y < h; y += 40) s += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#fff" stroke-opacity=".12"/>`;
    s += `<text x="${w * 0.08}" y="${h * 0.72}" font-family="Georgia,serif" font-size="${h * 0.55}" fill="${c}">Aa</text>`;
  } else if (kind === "bowl") {
    s += `<circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) * 0.34}" fill="#f6efe2"/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) * 0.27}" fill="${c}"/>`;
    for (let i = 0; i < 7; i++) { const t = i * 0.9; s += `<circle cx="${w / 2 + Math.cos(t) * h * 0.14}" cy="${h / 2 + Math.sin(t) * h * 0.14}" r="${h * 0.035}" fill="${i % 2 ? "#3c7a3a" : "#f1c25b"}"/>`; }
  } else if (kind === "vinyl") {
    s += `<circle cx="${w / 2}" cy="${h * 0.55}" r="${w * 0.38}" fill="#111"/>`;
    for (let r = 0.12; r < 0.38; r += 0.04) s += `<circle cx="${w / 2}" cy="${h * 0.55}" r="${w * r}" fill="none" stroke="#fff" stroke-opacity=".07"/>`;
    s += `<circle cx="${w / 2}" cy="${h * 0.55}" r="${w * 0.11}" fill="${c}"/><circle cx="${w / 2}" cy="${h * 0.55}" r="5" fill="#111"/>`;
  } else if (kind === "torii") {
    s += `<circle cx="${w * 0.5}" cy="${h * 0.4}" r="${h * 0.22}" fill="${c}" opacity=".9"/><rect x="${w * 0.3}" y="${h * 0.3}" width="${w * 0.4}" height="${h * 0.05}" fill="#b3261e"/><rect x="${w * 0.33}" y="${h * 0.4}" width="${w * 0.34}" height="${h * 0.035}" fill="#b3261e"/><rect x="${w * 0.36}" y="${h * 0.3}" width="${w * 0.035}" height="${h * 0.55}" fill="#b3261e"/><rect x="${w * 0.605}" y="${h * 0.3}" width="${w * 0.035}" height="${h * 0.55}" fill="#b3261e"/><rect x="0" y="${h * 0.85}" width="${w}" height="${h * 0.15}" fill="#000" opacity=".25"/>`;
  } else if (kind === "pages") {
    for (let i = 0; i < 3; i++) s += `<rect x="${w * (0.28 + i * 0.05)}" y="${h * (0.16 + i * 0.04)}" width="${w * 0.36}" height="${h * 0.7}" rx="6" fill="#f7f3ea" opacity="${0.6 + i * 0.2}"/>`;
    for (let i = 0; i < 7; i++) s += `<rect x="${w * 0.42}" y="${h * (0.32 + i * 0.07)}" width="${w * (0.18 - (i % 3) * 0.03)}" height="5" rx="2.5" fill="#2b2a26" opacity=".35"/>`;
  }
  return "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg}${s}</svg>`);
}

// --- Collections ---------------------------------------------------------------
const C = {
  music: uuid(1), synth: uuid(2), jazz: uuid(3), movies: uuid(4), sound: uuid(5), neon: uuid(6),
  design: uuid(7), type: uuid(8), recipes: uuid(9), japan: uuid(10), reads: uuid(11),
};
const col = (id: string, name: string, icon: string | null, color: string | null = null) =>
  ({ id, owner_id: OWNER, name, description: null, icon, color, created_at: day(60), updated_at: day(60) });
const collections = [
  col(C.music, "Music", "🎵"), col(C.synth, "Synthwave", null, "#8E7BFF"), col(C.jazz, "Jazz", null, "#F2C46D"),
  col(C.movies, "Movies", "🎬"), col(C.sound, "Soundtracks", "🎼"), col(C.neon, "Neon Harbor", null, "#FF6A35"),
  col(C.design, "Design", "🎨"), col(C.type, "Typography", null, "#5AA9E6"), col(C.recipes, "Recipes", "🍜"),
  col(C.japan, "Japan trip", "🗾"), col(C.reads, "Long reads", "📚"),
].sort((a, b) => a.name.localeCompare(b.name));
const edge = (p: string, c: string) => ({ parent_id: p, child_id: c, owner_id: OWNER, created_at: day(60) });
const edges = [
  edge(C.music, C.synth), edge(C.music, C.jazz), edge(C.music, C.sound), edge(C.movies, C.sound),
  edge(C.movies, C.neon), edge(C.sound, C.neon), edge(C.design, C.type),
];

// --- Items -----------------------------------------------------------------------
let n = 100;
const item = (title: string, site: string, url: string, ids: string[], d: number, thumb: string | null, note: string | null = null) => ({
  id: uuid(n++), owner_id: OWNER, url, title, description: null, note, thumbnail_url: thumb, site_name: site,
  metadata: {}, created_at: day(d, 9 + (n % 9)), updated_at: day(d),
  item_collections: ids.map((collection_id) => ({ collection_id })),
});
const items = [
  item("Neon Harbor – Main Theme (full orchestral suite)", "YouTube", "https://www.youtube.com/watch?v=demo01", [C.neon, C.sound, C.synth], 0, art("city", "#2a1748", "#d9466f", "#ffb35c"), "The 2:40 key change 🔥"),
  item("How film composers build a leitmotif", "YouTube", "https://www.youtube.com/watch?v=demo02", [C.sound, C.music], 1, art("waves", "#0f2c3d", "#2f7f86", "#9de3d0")),
  item("The one synth behind every 80s chase scene", "YouTube", "https://www.youtube.com/shorts/demo03", [C.synth, C.sound], 1, art("sun", "#ff6a35", "#5b1e66", "#ffd66b", 405, 720)),
  item("Pressing the Neon Harbor score on vinyl", "Instagram", "https://www.instagram.com/p/demo04", [C.neon, C.sound], 2, art("vinyl", "#e9dcc6", "#c9b48f", "#ff6a35", 540, 675)),
  item("Scoring silence: why the quietest scenes are the hardest", "Long reads", "https://example.com/scoring-silence", [C.sound, C.reads], 3, null, "Read on the train"),
  item("Late-night jazz for rainy cities", "YouTube", "https://www.youtube.com/watch?v=demo06", [C.jazz, C.sound], 4, art("waves", "#141b33", "#3d4a80", "#f2c46d")),
  item("A variable serif, designed in the open", "GitHub", "https://github.com/example/serif", [C.type, C.design], 5, art("grid", "#1d1c18", "#3a372f", "#f3f0e8")),
  item("Tonkotsu ramen, the slow way (48 h broth)", "Serious Bowls", "https://example.com/ramen", [C.recipes, C.japan], 6, art("bowl", "#7a3b1d", "#c4642f", "#e2b07a"), "Try with the chili oil"),
  item("Fushimi Inari at sunrise: when to go", "Travel notes", "https://example.com/fushimi", [C.japan], 7, art("torii", "#f6b26b", "#f7d9a8", "#fff3d6")),
  item("The long history of the paperback", "Long reads", "https://example.com/paperback", [C.reads, C.design], 8, art("pages", "#cfe3dc", "#92b8ad", "#fff")),
  item("Synthwave mix for focused work", "YouTube", "https://www.youtube.com/watch?v=demo11", [C.synth], 9, art("city", "#071a2b", "#1b6c8c", "#ff6aa8")),
  item("Kinetic type experiments", "Vimeo", "https://vimeo.com/demo12", [C.type], 10, null),
];

const counts = new Map<string, number>();
for (const it of items) for (const r of it.item_collections) counts.set(r.collection_id, (counts.get(r.collection_id) ?? 0) + 1);

// --- Fake Supabase -----------------------------------------------------------------
const SUPA = new URL(import.meta.env.VITE_SUPABASE_URL);
const user = { id: OWNER, aud: "authenticated", role: "authenticated", email: "you@example.com", app_metadata: {}, user_metadata: {}, created_at: day(90) };
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.host !== SUPA.host) return realFetch(input, init);
  const p = url.pathname;
  if (p.endsWith("/rest/v1/collections")) return json(collections);
  if (p.endsWith("/rest/v1/collection_edges")) return json(edges);
  if (p.endsWith("/rpc/collection_counts")) return json([...counts].map(([collection_id, item_count]) => ({ collection_id, item_count })));
  if (p.endsWith("/rest/v1/items") || p.endsWith("/rpc/search_items")) {
    const scope = url.searchParams.get("in_scope.collection_id");
    if (scope) {
      const ids = scope.replace(/^in\.\(|\)$/g, "").split(",");
      return json(items.filter((i) => i.item_collections.some((r) => ids.includes(r.collection_id))));
    }
    if (url.searchParams.get("item_collections") === "is.null") return json(items.filter((i) => !i.item_collections.length));
    return json(items);
  }
  if (p.includes("/auth/v1/user")) return json(user);
  return json([]);
};
class NoSocket { readyState = 3; send() {} close() {} addEventListener() {} removeEventListener() {} }
(window as unknown as { WebSocket: unknown }).WebSocket = NoSocket;

const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "");
localStorage.clear();
localStorage.setItem(`sb-${SUPA.hostname.split(".")[0]}-auth-token`, JSON.stringify({
  access_token: `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: OWNER, exp, role: "authenticated" })}.sig`,
  token_type: "bearer", expires_in: 86400, expires_at: exp, refresh_token: "demo", user,
}));
localStorage.setItem("nodoteca.theme", P.get("theme") ?? "dark");
localStorage.setItem("nodoteca.locale", P.get("lang") ?? "en");
localStorage.setItem("nodoteca.expanded", JSON.stringify([C.movies, C.sound, C.design]));
history.replaceState(null, "", P.get("view") === "sound" ? `/c/${C.sound}` : "/");
await import("../src/main.tsx");
