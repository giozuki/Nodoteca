import {
  buildBookmarksHtml,
  buildExportJson,
  type Collection,
  type CollectionEdge,
  type ItemWithCollections,
  type LibrarySnapshot,
} from "@nodoteca/core";
import { must, supabase } from "./supabase.ts";

const PAGE = 1000;

/** Reads the whole library (all pages). */
export async function fetchSnapshot(): Promise<LibrarySnapshot> {
  const [collections, edges] = await Promise.all([
    supabase.from("collections").select("*").then(must) as Promise<Collection[]>,
    supabase.from("collection_edges").select("*").then(must) as Promise<CollectionEdge[]>,
  ]);
  const items: ItemWithCollections[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = must(
      await supabase
        .from("items")
        .select("id, owner_id, url, title, description, note, thumbnail_url, site_name, metadata, created_at, updated_at, item_collections(collection_id), item_files(*)")
        .order("created_at")
        .order("id")
        .range(from, from + PAGE - 1),
    ) as unknown as ItemWithCollections[];
    items.push(...page);
    if (page.length < PAGE) break;
  }
  return { collections, edges, items };
}

function download(content: string, type: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Local date and time, safe in file names: 2026-11-16_21-45 */
function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
}

export async function exportJson(): Promise<LibrarySnapshot> {
  const snapshot = await fetchSnapshot();
  download(JSON.stringify(buildExportJson(snapshot), null, 2), "application/json", `nodoteca-${stamp()}.json`);
  return snapshot;
}

export async function exportBookmarksHtml(): Promise<LibrarySnapshot> {
  const snapshot = await fetchSnapshot();
  download(buildBookmarksHtml(snapshot), "text/html", `nodoteca-bookmarks-${stamp()}.html`);
  return snapshot;
}
