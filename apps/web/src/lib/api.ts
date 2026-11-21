import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildGraph,
  countsLocal,
  findSavedLocal,
  normalizeIcon,
  queryLocal,
  type Collection,
  type CollectionEdge,
  type ItemFile,
  type ItemWithCollections,
  type LinkPreview,
  type NewItemFile,
  type SavedMatch,
  type ItemScope,
  type SaveItemInput,
  type StorageUsage,
  type Uuid,
} from "@nodoteca/core";
import { removeObjects, storagePaths, uploadFiles, type Progress } from "./files.ts";
import { scheduleSync, withOffline } from "./offline.ts";
import { must, supabase } from "./supabase.ts";

export type { ItemScope };

// --- Queries ------------------------------------------------------------------

export const keys = {
  collections: ["collections"] as const,
  edges: ["edges"] as const,
  counts: ["counts"] as const,
  storage: ["storage"] as const,
  items: (scope: ItemScope) => ["items", scope] as const,
};

export function useCollections() {
  return useQuery({
    queryKey: keys.collections,
    queryFn: () =>
      withOffline(
        async () => must(await supabase.from("collections").select("*").order("name")) as Collection[],
        (d) => [...d.collections].sort((a, b) => a.name.localeCompare(b.name)),
      ),
  });
}

export function useEdges() {
  return useQuery({
    queryKey: keys.edges,
    queryFn: () =>
      withOffline(
        async () => must(await supabase.from("collection_edges").select("*")) as CollectionEdge[],
        (d) => d.edges,
      ),
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
    queryFn: () =>
      withOffline(
        async () => {
          const rows = must(await supabase.rpc("collection_counts")) as { collection_id: Uuid; item_count: number }[];
          return new Map(rows.map((r) => [r.collection_id, Number(r.item_count)]));
        },
        (d) => countsLocal(d.items),
      ),
  });
}

const ITEM_COLUMNS = "*, item_collections(collection_id), item_files(*)";
const PAGE = 500;

export function useItems(scope: ItemScope) {
  return useQuery({
    queryKey: keys.items(scope),
    queryFn: () => withOffline(() => fetchItems(scope), (d) => queryLocal(d, scope, PAGE)),
  });
}

async function fetchItems(scope: ItemScope): Promise<ItemWithCollections[]> {
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
}

export async function findSaved(url: string): Promise<SavedMatch[]> {
  return withOffline(
    async () => must(await supabase.rpc("find_saved", { p_url: url })) as SavedMatch[],
    (d) => findSavedLocal(d.items, url),
  );
}

/** Space used by files, and the user's limits. */
export function useStorageUsage(enabled = true) {
  return useQuery({
    queryKey: keys.storage,
    enabled,
    queryFn: async (): Promise<StorageUsage> => {
      const rows = must(await supabase.rpc("storage_usage")) as StorageUsage[];
      const r = rows[0];
      return { used_bytes: Number(r?.used_bytes ?? 0), max_file_bytes: Number(r?.max_file_bytes ?? 0), max_total_bytes: Number(r?.max_total_bytes ?? 0) };
    },
  });
}

export async function fetchPreview(url: string): Promise<LinkPreview | null> {
  const { data, error } = await supabase.functions.invoke<LinkPreview>("link-preview", { body: { url } });
  return error ? null : data;
}

// --- Mutations ----------------------------------------------------------------

/** Every write can change counts, lists and the graph: refresh everything (it's cheap). */
function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    scheduleSync();
    return qc.invalidateQueries();
  };
}

/** Extra arguments to save files with an item: they are uploaded first, then recorded. */
interface WithFiles {
  files?: readonly File[];
  onProgress?: Progress;
}

/** Uploads files, records them with `record`, and removes the uploads if recording fails. */
async function uploadAndRecord<T>(files: readonly File[], onProgress: Progress | undefined, record: (uploaded: NewItemFile[]) => Promise<T>): Promise<T> {
  const uploaded = await uploadFiles(files, onProgress);
  try {
    return await record(uploaded);
  } catch (err) {
    await removeObjects(uploaded.flatMap((f) => (f.thumb_path ? [f.path, f.thumb_path] : [f.path])));
    throw err;
  }
}

export function useSaveItem() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ files = [], onProgress, ...input }: SaveItemInput & WithFiles) =>
      uploadAndRecord(files, onProgress, async (uploaded) => must(await supabase.rpc("save_item", { ...input, p_files: uploaded }))),
    onSuccess: invalidate,
  });
}

export interface ItemUpdate extends WithFiles {
  id: Uuid;
  title: string | null;
  note: string | null;
  collectionIds: Uuid[];
  /** Set a link on an item that had none, with its preview. */
  link?: { url: string; preview: LinkPreview | null };
  /** Files to forget (their objects are deleted from Storage). */
  removeFileIds?: Uuid[];
  /** New order of the files the item keeps; new files go after them. */
  fileOrder?: Uuid[];
}

export function useUpdateItem() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (v: ItemUpdate) => {
      const patch: Record<string, unknown> = { title: v.title, note: v.note };
      if (v.link) {
        const p = v.link.preview;
        Object.assign(patch, {
          url: v.link.url,
          description: p?.description ?? null,
          thumbnail_url: p?.thumbnail_url ?? null,
          site_name: p?.site_name ?? null,
          ...(p?.metadata && { metadata: p.metadata }),
        });
      }
      must(await supabase.from("items").update(patch).eq("id", v.id).select("id"));
      must(await supabase.rpc("set_item_collections", { p_item_id: v.id, p_collection_ids: v.collectionIds }));

      if (v.fileOrder?.length) {
        must(await supabase.rpc("set_item_file_order", { p_item_id: v.id, p_file_ids: v.fileOrder }));
      }
      // Add before removing: an item with no link must never be left without files.
      if (v.files?.length) {
        await uploadAndRecord(v.files, v.onProgress, async (uploaded) =>
          must(await supabase.rpc("add_item_files", { p_item_id: v.id, p_files: uploaded })),
        );
      }
      const gone: string[] = [];
      for (const id of v.removeFileIds ?? []) {
        gone.push(...((must(await supabase.rpc("remove_item_file", { p_file_id: id })) as string[] | null) ?? []));
      }
      await removeObjects(gone);
    },
    onSuccess: invalidate,
  });
}

/** Fetch a fresh preview and store it (title only if the item has none). */
export function useRefreshPreview() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (item: ItemWithCollections) => {
      if (!item.url) throw new Error("no-link");
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
    mutationFn: async (item: ItemWithCollections) => {
      // Read the file rows again: the list on screen may be out of date.
      const files = must(await supabase.from("item_files").select("*").eq("item_id", item.id)) as ItemFile[];
      must(await supabase.from("items").delete().eq("id", item.id).select("id"));
      // Row first, objects after: if this fails, a leftover object only costs space.
      await removeObjects(storagePaths(files));
    },
    onSuccess: invalidate,
  });
}

export function useCreateCollection() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (v: { name: string; color?: string | null; icon?: string | null; parentIds?: Uuid[] }) => {
      const created = must(
        await supabase.from("collections").insert({ name: v.name.trim(), color: v.color ?? null, icon: normalizeIcon(v.icon) }).select().single(),
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
    mutationFn: async (v: { id: Uuid; name: string; color: string | null; icon: string | null; parentIds: Uuid[] }) => {
      must(await supabase.from("collections").update({ name: v.name.trim(), color: v.color, icon: normalizeIcon(v.icon) }).eq("id", v.id).select("id"));
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

const SYNCED_TABLES = ["items", "collections", "item_collections", "collection_edges", "item_files"] as const;

/** Refetch when another device (or tab) changes something. */
export function useRealtimeSync(userId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => qc.invalidateQueries(), 300);
      scheduleSync();
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
