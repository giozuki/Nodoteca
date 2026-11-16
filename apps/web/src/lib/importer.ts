import { collectionKey, normalizeUrl, type ImportPlan, type Uuid } from "@nodoteca/core";
import { must, supabase } from "./supabase.ts";

const PAGE = 1000;
const ITEM_BATCH = 250;

/** Every URL already in the library (normalized), to skip re-imports. */
export async function fetchExistingUrls(): Promise<Set<string>> {
  const urls = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const rows = must(await supabase.from("items").select("url").range(from, from + PAGE - 1)) as { url: string }[];
    for (const r of rows) urls.add(normalizeUrl(r.url));
    if (rows.length < PAGE) break;
  }
  return urls;
}

export interface ImportResult {
  items: number;
  collectionsCreated: number;
  edgesSkipped: number;
}

/**
 * Writes an import plan: collections (reusing existing ones by name), their
 * parent links, then items in batches with their memberships.
 */
export async function runImport(plan: ImportPlan, onProgress: (done: number, total: number) => void): Promise<ImportResult> {
  const total = plan.items.length;
  onProgress(0, total);

  // 1. Collections: reuse by name, create the missing ones.
  const ids = new Map<string, Uuid>();
  const existing = must(await supabase.from("collections").select("id, name")) as { id: Uuid; name: string }[];
  for (const c of existing) ids.set(collectionKey(c.name), c.id);
  const missing = [...plan.collections]
    .filter(([key]) => !ids.has(key))
    .map(([key, name]) => ({ name, color: plan.details.get(key)?.color ?? null, description: plan.details.get(key)?.description ?? null }));
  if (missing.length) {
    const created = must(await supabase.from("collections").insert(missing).select("id, name")) as { id: Uuid; name: string }[];
    for (const c of created) ids.set(collectionKey(c.name), c.id);
  }

  // 2. Parent links. One at a time only if the batch fails (e.g. a cycle with existing links).
  const edges = plan.edges
    .map(([p, c]) => ({ parent_id: ids.get(p)!, child_id: ids.get(c)! }))
    .filter((e) => e.parent_id && e.child_id);
  let edgesSkipped = 0;
  if (edges.length) {
    const { error } = await supabase.from("collection_edges").upsert(edges, { onConflict: "parent_id,child_id", ignoreDuplicates: true });
    if (error) {
      for (const e of edges) {
        const res = await supabase.from("collection_edges").upsert(e, { onConflict: "parent_id,child_id", ignoreDuplicates: true });
        if (res.error) edgesSkipped++;
      }
    }
  }

  // 3. Items and memberships, in batches.
  let done = 0;
  for (let i = 0; i < total; i += ITEM_BATCH) {
    const batch = plan.items.slice(i, i + ITEM_BATCH);
    const rows = batch.map(({ collectionKeys: _keys, created_at, ...item }) => (created_at ? { ...item, created_at } : item));
    // defaultToNull: false -> a missing created_at falls back to now() instead of null.
    const inserted = must(await supabase.from("items").insert(rows, { defaultToNull: false }).select("id")) as { id: Uuid }[];

    const memberships = inserted.flatMap((row, j) =>
      batch[j]!.collectionKeys.map((key) => ids.get(key)).filter((id): id is Uuid => !!id).map((collection_id) => ({ item_id: row.id, collection_id })),
    );
    if (memberships.length) must(await supabase.from("item_collections").insert(memberships).select("item_id"));

    done += batch.length;
    onProgress(done, total);
  }

  return { items: done, collectionsCreated: missing.length, edgesSkipped };
}
