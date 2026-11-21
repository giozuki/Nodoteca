import { filesOf } from "./files.ts";
import { buildGraph } from "./graph.ts";
import type { Collection, CollectionEdge, ItemWithCollections, Uuid } from "./types.ts";

/** Everything a user owns, as read from the database. */
export interface LibrarySnapshot {
  collections: Collection[];
  edges: CollectionEdge[];
  items: ItemWithCollections[];
}

export const EXPORT_FORMAT = "nodoteca-export";
export const EXPORT_VERSION = 1;

/** The JSON backup: complete, versioned, and re-importable by Nodoteca. */
export interface NodotecaExport {
  format: typeof EXPORT_FORMAT;
  version: number;
  exported_at: string;
  collections: {
    id: Uuid;
    name: string;
    description: string | null;
    icon: string | null;
    color: string | null;
    created_at: string;
    /** ids of the parent collections */
    parents: Uuid[];
  }[];
  items: {
    id: Uuid;
    /** null for an item made only of files */
    url: string | null;
    title: string | null;
    description: string | null;
    note: string | null;
    thumbnail_url: string | null;
    site_name: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    /** ids of the collections the item is filed in */
    collections: Uuid[];
    /**
     * The item's files, described but not included: the contents stay in
     * Nodoteca's storage. Absent when the item has none.
     */
    files?: { name: string; size: number; mime: string; sha256: string | null }[];
  }[];
}

export function buildExportJson(data: LibrarySnapshot, now = new Date()): NodotecaExport {
  const parents = new Map<Uuid, Uuid[]>();
  for (const e of data.edges) parents.set(e.child_id, [...(parents.get(e.child_id) ?? []), e.parent_id]);

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: now.toISOString(),
    collections: [...data.collections]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        icon: c.icon,
        color: c.color,
        created_at: c.created_at,
        parents: parents.get(c.id) ?? [],
      })),
    items: [...data.items]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((i) => ({
        id: i.id,
        url: i.url,
        title: i.title,
        description: i.description,
        note: i.note,
        thumbnail_url: i.thumbnail_url,
        site_name: i.site_name,
        metadata: i.metadata,
        created_at: i.created_at,
        updated_at: i.updated_at,
        collections: i.item_collections.map((r) => r.collection_id),
        ...(filesOf(i).length > 0 && {
          files: filesOf(i).map((f) => ({ name: f.name, size: f.size, mime: f.mime, sha256: f.sha256 })),
        }),
      })),
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const seconds = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

/**
 * Classic bookmarks.html (importable by every browser and by Raindrop).
 * That format is a tree, so the graph is unfolded: an item filed in several
 * collections, or a collection with several parents, appears in each place.
 * Items made only of files have no address to point to, so they are left out.
 */
export function buildBookmarksHtml(data: LibrarySnapshot): string {
  const graph = buildGraph(data.collections, data.edges);
  const itemsIn = new Map<Uuid, ItemWithCollections[]>();
  const unfiled: ItemWithCollections[] = [];
  const byDate = data.items.filter((i) => !!i.url).sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const item of byDate) {
    if (item.item_collections.length === 0) unfiled.push(item);
    for (const { collection_id } of item.item_collections) {
      itemsIn.set(collection_id, [...(itemsIn.get(collection_id) ?? []), item]);
    }
  }

  const lines: string[] = [];
  const pad = (depth: number) => "    ".repeat(depth);

  const link = (item: ItemWithCollections, depth: number) => {
    const url = item.url ?? "";
    lines.push(`${pad(depth)}<DT><A HREF="${esc(url)}" ADD_DATE="${seconds(item.created_at)}">${esc(item.title || url)}</A>`);
    const text = item.note || item.description;
    if (text) lines.push(`${pad(depth)}<DD>${esc(text.replace(/\s+/g, " ").trim())}`);
  };

  const folder = (id: Uuid, depth: number, path: Set<Uuid>) => {
    const c = graph.byId.get(id);
    if (!c || path.has(id)) return; // the DB forbids cycles; this is just a guard
    const next = new Set(path).add(id);
    lines.push(`${pad(depth)}<DT><H3 ADD_DATE="${seconds(c.created_at)}">${esc(c.name)}</H3>`);
    lines.push(`${pad(depth)}<DL><p>`);
    for (const child of graph.children.get(id) ?? []) folder(child, depth + 1, next);
    for (const item of itemsIn.get(id) ?? []) link(item, depth + 1);
    lines.push(`${pad(depth)}</DL><p>`);
  };

  lines.push("<!DOCTYPE NETSCAPE-Bookmark-file-1>");
  lines.push("<!-- Exported from Nodoteca. -->");
  lines.push('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">');
  lines.push("<TITLE>Bookmarks</TITLE>");
  // Importers ignore this; it only makes the file pleasant to open in a browser.
  lines.push(`<style>
  body { font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; max-width: 860px; margin: 32px auto; padding: 0 16px; color: #1e1b2e; background: #f7f5f0; }
  h1 { font-size: 26px; margin: 0 0 16px; }
  dl { margin: 0; padding-left: 18px; border-left: 2px solid #e4dfd5; }
  body > dl { padding-left: 0; border: 0; }
  dt { margin: 4px 0; }
  h3 { display: inline-block; margin: 10px 0 2px; font-size: 16px; }
  h3::before { content: "📁 "; }
  a { color: #4c3bc4; text-decoration: none; }
  a:hover { text-decoration: underline; }
  dd { margin: 0 0 6px; color: #6c6680; font-size: 13px; }
  p { margin: 0; }
  @media (prefers-color-scheme: dark) {
    body { color: #f4f1ea; background: #16141f; }
    dl { border-color: #332e47; }
    a { color: #a99bff; }
    dd { color: #a39cb8; }
  }
</style>`);
  lines.push("<H1>Nodoteca</H1>");
  lines.push("<DL><p>");
  for (const root of graph.roots) folder(root, 1, new Set());
  for (const item of unfiled) link(item, 1);
  lines.push("</DL><p>");
  return lines.join("\n") + "\n";
}
