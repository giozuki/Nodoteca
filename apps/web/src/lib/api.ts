import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildGraph,
  type Collection,
  type CollectionEdge,
  type ItemWithCollections,
  type LinkPreview,
  type SavedMatch,
  type SaveItemInput,
  type Uuid,
} from "@nodoteca/core";
import { must, supabase } from "./supabase.ts";

// --- Queries ------------------------------------------------------------------

export const keys = {
  collections: ["collections"] as const,
  edges: ["edges"] as const,
  counts: ["counts"] as const,
  items: (scope: ItemScope) => ["items", scope] as const,
};

export function useCollections() {
  return useQuery({
    queryKey: keys.collections,
    queryFn: async () => must(await supabase.from("collections").select("*").order("name")) as Collection[],
  });
}

export function useEdges() {
  return useQuery({
    queryKey: keys.edges,
    queryFn: async () => must(await supabase.from("collection_edges").select("*")) as CollectionEdge[],
  });
}

export function useGraph() {
  const collections = useCollections();
  const edges = useEdges();
  const graph = useMemo(
    () => buildGraph(collections.data ?? [], edges.data ?? []),
    [collections.data, edges.data],
  );
  return { graph, isLoading: collections.isLoading || edges.isLoading, error: collections.error ?? edges.error };
}

export function useCounts() {
  return useQuery({
    queryKey: keys.counts,
    queryFn: async () => {
      const rows = must(await supabase.rpc("collection_counts")) as { collection_id: Uuid; item_count: number }[];
      return new Map(rows.map((r) => [r.collection_id, Number(r.item_count)]));
    },
  });
}

export type ItemScope =
  | { kind: "all" }
  | { kind: "unfiled" }
  | { kind: "collection"; ids: Uuid[] }
  | { kind: "search"; query: string };

const ITEM_COLUMNS = "*, item_collections(collection_id)";
const PAGE = 500;

export function useItems(scope: ItemScope) {
  return useQuery({
    queryKey: keys.items(scope),
    queryFn: async () => {
      if (scope.kind === "search") {
        // Partial match on every word; the function already orders by relevance.
        const res = await supabase.rpc("search_items", { p_query: scope.query }).select(ITEM_COLUMNS).limit(PAGE);
        return must(res) as unknown as ItemWithCollections[];
      }
      let q;
      switch (scope.kind) {
        case "all":
          q = supabase.from("items").select(ITEM_COLUMNS);
          break;
        case "unfiled":
          // Anti-join: items with no membership row at all.
          q = supabase.from("items").select(ITEM_COLUMNS).is("item_collections", null);
          break;
        case "collection":
          if (scope.ids.length === 0) return [];
          // Two embeds of the same relation: one (inner) filters, one returns every collection for the chips.
          q = supabase
            .from("items")
            .select(`${ITEM_COLUMNS}, in_scope:item_collections!inner(collection_id)`)
            .in("in_scope.collection_id", scope.ids);
          break;
      }
      return must(await q.order("created_at", { ascending: false }).limit(PAGE)) as unknown as ItemWithCollections[];
    },
  });
}

export async function findSaved(url: string): Promise<SavedMatch[]> {
  return must(await supabase.rpc("find_saved", { p_url: url })) as SavedMatch[];
}

export async function fetchPreview(url: string): Promise<LinkPreview | null> {
  const { data, error } = await supabase.functions.invoke<LinkPreview>("link-preview", { body: { url } });
  return error ? null : data;
}

// --- Mutations ----------------------------------------------------------------

/** Every write can change counts, lists and the graph: refresh everything (it's cheap). */
function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

export function useSaveItem() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (input: SaveItemInput) => must(await supabase.rpc("save_item", input)),
    onSuccess: invalidate,
  });
}

export function useUpdateItem() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (v: { id: Uuid; title: string | null; note: string | null; collectionIds: Uuid[] }) => {
      must(await supabase.from("items").update({ title: v.title, note: v.note }).eq("id", v.id).select("id"));
      must(await supabase.rpc("set_item_collections", { p_item_id: v.id, p_collection_ids: v.collectionIds }));
    },
    onSuccess: invalidate,
  });
}

/** Fetch a fresh preview and store it (title only if the item has none). */
export function useRefreshPreview() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (item: ItemWithCollections) => {
      const p = await fetchPreview(item.url);
      if (!p || (!p.thumbnail_url && !p.title && !p.description)) throw new Error("no-preview");
      const patch: Record<string, unknown> = {
        thumbnail_url: p.thumbnail_url ?? item.thumbnail_url,
        description: p.description ?? item.description,
        site_name: p.site_name ?? item.site_name,
        metadata: { ...item.metadata, ...p.metadata },
      };
      if (!item.title && p.title) patch.title = p.title;
      must(await supabase.from("items").update(patch).eq("id", item.id).select("id"));
    },
    onSuccess: invalidate,
  });
}

export function useDeleteItem() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (id: Uuid) => must(await supabase.from("items").delete().eq("id", id).select("id")),
    onSuccess: invalidate,
  });
}

export function useCreateCollection() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (v: { name: string; color?: string | null; parentIds?: Uuid[] }) => {
      const created = must(
        await supabase.from("collections").insert({ name: v.name.trim(), color: v.color ?? null }).select().single(),
      ) as Collection;
      if (v.parentIds?.length) {
        must(await supabase.rpc("set_collection_parents", { p_collection_id: created.id, p_parent_ids: v.parentIds }));
      }
      return created;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateCollection() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (v: { id: Uuid; name: string; color: string | null; parentIds: Uuid[] }) => {
      must(await supabase.from("collections").update({ name: v.name.trim(), color: v.color }).eq("id", v.id).select("id"));
      must(await supabase.rpc("set_collection_parents", { p_collection_id: v.id, p_parent_ids: v.parentIds }));
    },
    onSuccess: invalidate,
  });
}

export function useDeleteCollection() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (id: Uuid) => must(await supabase.from("collections").delete().eq("id", id).select("id")),
    onSuccess: invalidate,
  });
}

// --- Realtime -----------------------------------------------------------------

const SYNCED_TABLES = ["items", "collections", "item_collections", "collection_edges"] as const;

/** Refetch when another device (or tab) changes something. */
export function useRealtimeSync(userId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => qc.invalidateQueries(), 300);
    };
    const channel = supabase.channel(`sync:${userId}`);
    for (const table of SYNCED_TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    }
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [qc, userId]);
}
