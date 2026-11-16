import { normalizeUrl } from "./url.ts";

/** One link read from an export file, before it becomes an item. */
export interface ImportEntry {
  url: string;
  title: string | null;
  note: string | null;
  description: string | null;
  thumbnail_url: string | null;
  /** ISO timestamp of the original save, if known. */
  created_at: string | null;
  /** Folder path from the root, e.g. ["Cinema", "Serie TV", "Boris"]. */
  folders: string[];
  tags: string[];
  source: "raindrop" | "bookmarks";
}

// --- CSV (RFC 4180) -------------------------------------------------------------

export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (quoted) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

const RAINDROP_UNSORTED = new Set(["unsorted", "non ordinati", "senza categoria"]);

/** Raindrop.io "Export → CSV". Nested folders come as "Parent / Child". */
export function parseRaindropCsv(text: string): ImportEntry[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const col = (name: string) => header.indexOf(name);
  const need = ["url", "title", "folder"];
  if (need.some((n) => col(n) < 0)) throw new Error("not-raindrop-csv");

  const get = (r: string[], name: string) => {
    const i = col(name);
    const v = i >= 0 ? (r[i] ?? "").trim() : "";
    return v === "" ? null : v;
  };

  return rows
    .map((r): ImportEntry | null => {
      const url = get(r, "url");
      if (!url || !/^https?:\/\//i.test(url)) return null;
      const folder = get(r, "folder") ?? "";
      const folders = RAINDROP_UNSORTED.has(folder.toLowerCase())
        ? []
        : folder.split(" / ").map((s) => s.trim()).filter(Boolean);
      return {
        url,
        title: get(r, "title"),
        note: get(r, "note"),
        description: get(r, "excerpt"),
        thumbnail_url: get(r, "cover"),
        created_at: validDate(get(r, "created")),
        folders,
        tags: (get(r, "tags") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        source: "raindrop",
      };
    })
    .filter((e): e is ImportEntry => e !== null);
}

// --- Netscape bookmarks HTML (Chrome, Firefox, Edge, Safari, Raindrop) ----------

const BOOKMARK_ROOTS = new Set([
  "bookmarks bar", "bookmarks toolbar", "other bookmarks", "mobile bookmarks", "bookmarks menu", "favorites bar",
  "barra dei preferiti", "altri preferiti", "preferiti su dispositivo mobile", "barra dei segnalibri",
  "altri segnalibri", "menu segnalibri", "segnalibri da dispositivo mobile", "unsorted",
]);

/**
 * Parses the classic bookmarks.html format. Browser root folders
 * ("Bookmarks bar", "Other bookmarks"…) are dropped from the path.
 */
export function parseBookmarksHtml(html: string): ImportEntry[] {
  const out: ImportEntry[] = [];
  const stack: string[] = [];
  let pendingFolder: string | null = null;
  let last: ImportEntry | null = null;
  const re = /<h3\b[^>]*>([\s\S]*?)<\/h3>|<dl\b[^>]*>|<\/dl>|<a\b([^>]*)>([\s\S]*?)<\/a>|<dd>([^<]*)/gi;

  for (const m of html.matchAll(re)) {
    const token = m[0].slice(0, 4).toLowerCase();
    if (m[1] !== undefined) {
      pendingFolder = decode(stripTags(m[1])).trim();
      last = null;
    } else if (token.startsWith("<dl")) {
      stack.push(pendingFolder ?? "");
      pendingFolder = null;
    } else if (token.startsWith("</dl")) {
      stack.pop();
      last = null;
    } else if (m[2] !== undefined) {
      const attrs = m[2];
      const href = decode(attr(attrs, "href") ?? "");
      if (!/^https?:\/\//i.test(href)) {
        last = null;
        continue;
      }
      const added = attr(attrs, "add_date");
      last = {
        url: href,
        title: decode(stripTags(m[3] ?? "")).trim() || null,
        note: null,
        description: null,
        thumbnail_url: null,
        created_at: added && /^\d+$/.test(added) ? new Date(Number(added) * (added.length > 11 ? 1 : 1000)).toISOString() : null,
        folders: stack.filter((f, i) => f !== "" && !(i <= 1 && BOOKMARK_ROOTS.has(f.toLowerCase()))),
        tags: (decode(attr(attrs, "tags") ?? "")).split(",").map((s) => s.trim()).filter(Boolean),
        source: "bookmarks",
      };
      out.push(last);
    } else if (m[4] !== undefined && last) {
      const text = decode(m[4]).trim();
      if (text) last.description = text;
    }
  }
  return out;
}

function attr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[1] ?? m[2] ?? m[3] ?? null) : null;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

function decode(s: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return named[code.toLowerCase()] ?? m;
  });
}

function validDate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Picks the right parser from the file content. */
export function parseImportFile(text: string): ImportEntry[] {
  const head = text.slice(0, 2000).toLowerCase();
  if (head.includes("<!doctype netscape-bookmark-file") || head.includes("<dl")) return parseBookmarksHtml(text);
  return parseRaindropCsv(text);
}

// --- Plan -----------------------------------------------------------------------

export interface ImportOptions {
  /** Tags (case-insensitive) that should become collections. */
  tagsAsCollections: ReadonlySet<string>;
  /** Normalized URLs already in the library. */
  existingUrls: ReadonlySet<string>;
  skipExisting: boolean;
  /**
   * A folder name used in several places ("Cinema" and "Arte / Cinema"):
   * true = one collection with several parents (default);
   * false = nested copies get the parent's name, e.g. "Cinema (Arte)".
   */
  mergeSameNames?: boolean;
}

export interface PlannedItem {
  url: string;
  title: string | null;
  note: string | null;
  description: string | null;
  thumbnail_url: string | null;
  site_name: string | null;
  created_at: string | null;
  metadata: Record<string, unknown>;
  /** Lower-cased collection keys (see `collections`). */
  collectionKeys: string[];
}

export interface ImportPlan {
  /** key (lower-cased, trimmed name) -> display name (first spelling seen) */
  collections: Map<string, string>;
  /** [parentKey, childKey] pairs, deduplicated */
  edges: [string, string][];
  items: PlannedItem[];
  skippedExisting: number;
  skippedDuplicatesInFile: number;
}

export interface SharedFolderName {
  name: string;
  /** Where it appears: "" for the top level, otherwise the parent path. */
  places: string[];
}

/** Folder names that appear in more than one place of the tree. */
export function sharedFolderNames(entries: readonly ImportEntry[]): SharedFolderName[] {
  const places = new Map<string, { name: string; places: Set<string> }>();
  for (const e of entries) {
    e.folders.forEach((folder, i) => {
      const key = collectionKey(folder);
      const entry = places.get(key) ?? { name: folder.trim(), places: new Set<string>() };
      entry.places.add(e.folders.slice(0, i).join(" / "));
      places.set(key, entry);
    });
  }
  return [...places.values()]
    .filter((p) => p.places.size > 1)
    .map((p) => ({ name: p.name, places: [...p.places].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const collectionKey = (name: string) => name.trim().toLocaleLowerCase();

/** Counts how many entries carry each tag (for the "which tags?" checklist). */
export function tagCounts(entries: readonly ImportEntry[]): [string, number][] {
  const counts = new Map<string, [string, number]>();
  for (const e of entries) {
    for (const tag of e.tags) {
      const k = collectionKey(tag);
      const cur = counts.get(k);
      counts.set(k, [cur?.[0] ?? tag, (cur?.[1] ?? 0) + 1]);
    }
  }
  return [...counts.values()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/**
 * Turns entries into what must be created. Same-named folders anywhere in the
 * tree become ONE collection (Nodoteca's graph), with every parent they had.
 */
export function buildImportPlan(entries: readonly ImportEntry[], options: ImportOptions): ImportPlan {
  const collections = new Map<string, string>();
  const edges = new Map<string, [string, string]>();
  const items: PlannedItem[] = [];
  const seen = new Set<string>();
  let skippedExisting = 0;
  let skippedDuplicatesInFile = 0;
  const merge = options.mergeSameNames ?? true;
  const shared = merge ? new Set<string>() : new Set(sharedFolderNames(entries).map((s) => collectionKey(s.name)));

  const addCollection = (name: string) => {
    const key = collectionKey(name).slice(0, 120);
    if (!collections.has(key)) collections.set(key, name.trim().slice(0, 120));
    return key;
  };

  for (const e of entries) {
    const url = normalizeUrl(e.url);
    if (seen.has(url)) {
      skippedDuplicatesInFile++;
      continue;
    }
    seen.add(url);
    if (options.skipExisting && options.existingUrls.has(url)) {
      skippedExisting++;
      continue;
    }

    const keys = new Set<string>();
    let parent: string | null = null;
    for (const [i, folder] of e.folders.entries()) {
      // Not merging: a shared name keeps its plain form only at the top level.
      const name = i > 0 && shared.has(collectionKey(folder)) ? `${folder.trim()} (${e.folders[i - 1]!.trim()})` : folder;
      const key = addCollection(name);
      if (parent && parent !== key) edges.set(`${parent}\u0000${key}`, [parent, key]);
      parent = key;
    }
    if (parent) keys.add(parent); // filed in the deepest folder only
    for (const tag of e.tags) {
      if (options.tagsAsCollections.has(collectionKey(tag))) keys.add(addCollection(tag));
    }

    let site: string | null = null;
    try {
      site = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      /* keep null */
    }

    items.push({
      url,
      title: e.title?.slice(0, 1000) ?? null,
      note: e.note?.slice(0, 20000) ?? null,
      description: e.description?.slice(0, 5000) ?? null,
      thumbnail_url: e.thumbnail_url && /^https?:\/\//i.test(e.thumbnail_url) ? e.thumbnail_url.slice(0, 8192) : null,
      site_name: site,
      created_at: e.created_at,
      metadata: { imported_from: e.source },
      collectionKeys: [...keys],
    });
  }

  return { collections, edges: [...edges.values()], items, skippedExisting, skippedDuplicatesInFile };
}
