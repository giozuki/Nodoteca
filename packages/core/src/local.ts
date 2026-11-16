import type { LibrarySnapshot } from "./export.ts";
import type { ItemWithCollections, Uuid } from "./types.ts";

/** Which items a list shows. Shared by the online queries and the offline copy. */
export type ItemScope =
  | { kind: "all" }
  | { kind: "unfiled" }
  | { kind: "collection"; ids: Uuid[] }
  | { kind: "search"; query: string };

const newestFirst = (a: ItemWithCollections, b: ItemWithCollections) => b.created_at.localeCompare(a.created_at);

/**
 * Same rules as the search_items() SQL function: every word must appear
 * (any case, any order) in title, note, site, URL or description; matches in
 * the title come first, then newest.
 */
export function searchLocal(items: readonly ItemWithCollections[], query: string): ItemWithCollections[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const haystack = (i: ItemWithCollections) =>
    [i.title, i.note, i.site_name, i.url, i.description].map((s) => s ?? "").join(" ").toLocaleLowerCase();
  const inTitle = (i: ItemWithCollections) => {
    const t = (i.title ?? "").toLocaleLowerCase();
    return words.every((w) => t.includes(w));
  };
  return items
    .filter((i) => {
      const h = haystack(i);
      return words.every((w) => h.includes(w));
    })
    .sort((a, b) => Number(inTitle(b)) - Number(inTitle(a)) || newestFirst(a, b));
}

/** Items for a scope, computed from the local copy. */
export function queryLocal(snapshot: LibrarySnapshot, scope: ItemScope, limit = 500): ItemWithCollections[] {
  switch (scope.kind) {
    case "all":
      return [...snapshot.items].sort(newestFirst).slice(0, limit);
    case "unfiled":
      return snapshot.items.filter((i) => i.item_collections.length === 0).sort(newestFirst).slice(0, limit);
    case "collection": {
      const ids = new Set(scope.ids);
      return snapshot.items
        .filter((i) => i.item_collections.some((r) => ids.has(r.collection_id)))
        .sort(newestFirst)
        .slice(0, limit);
    }
    case "search":
      return searchLocal(snapshot.items, scope.query).slice(0, limit);
  }
}

/** Items directly inside each collection, like collection_counts(). */
export function countsLocal(items: readonly ItemWithCollections[]): Map<Uuid, number> {
  const counts = new Map<Uuid, number>();
  for (const i of items) for (const r of i.item_collections) counts.set(r.collection_id, (counts.get(r.collection_id) ?? 0) + 1);
  return counts;
}

/** Earlier saves of a URL, like find_saved(). */
export function findSavedLocal(items: readonly ItemWithCollections[], url: string) {
  return items
    .filter((i) => i.url === url)
    .sort(newestFirst)
    .map((i) => ({ item_id: i.id, created_at: i.created_at, collection_ids: i.item_collections.map((r) => r.collection_id) }));
}
