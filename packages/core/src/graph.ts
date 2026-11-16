import type { Collection, CollectionEdge, Uuid } from "./types.ts";

/**
 * In-memory view of the collection graph (a DAG: a collection may have several
 * parents, never a cycle). Built once from the rows and reused by every view.
 */
export interface CollectionGraph {
  byId: Map<Uuid, Collection>;
  /** parent id -> child ids, sorted by name */
  children: Map<Uuid, Uuid[]>;
  /** child id -> parent ids, sorted by name */
  parents: Map<Uuid, Uuid[]>;
  /** collections with no parent, sorted by name */
  roots: Uuid[];
}

const byName = (graph: Map<Uuid, Collection>) => (a: Uuid, b: Uuid) =>
  (graph.get(a)?.name ?? "").localeCompare(graph.get(b)?.name ?? "", undefined, { sensitivity: "base" });

export function buildGraph(collections: readonly Collection[], edges: readonly CollectionEdge[]): CollectionGraph {
  const byId = new Map(collections.map((c) => [c.id, c]));
  const children = new Map<Uuid, Uuid[]>();
  const parents = new Map<Uuid, Uuid[]>();

  for (const { parent_id, child_id } of edges) {
    if (!byId.has(parent_id) || !byId.has(child_id)) continue;
    (children.get(parent_id) ?? children.set(parent_id, []).get(parent_id)!).push(child_id);
    (parents.get(child_id) ?? parents.set(child_id, []).get(child_id)!).push(parent_id);
  }

  const sort = byName(byId);
  for (const list of children.values()) list.sort(sort);
  for (const list of parents.values()) list.sort(sort);
  const roots = collections.map((c) => c.id).filter((id) => !parents.has(id)).sort(sort);

  return { byId, children, parents, roots };
}

function walk(next: Map<Uuid, Uuid[]>, start: Uuid): Set<Uuid> {
  const seen = new Set<Uuid>();
  const stack = [...(next.get(start) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(next.get(id) ?? []));
  }
  return seen;
}

/** Every collection reachable below `id` (not including `id`). */
export function descendants(graph: CollectionGraph, id: Uuid): Set<Uuid> {
  return walk(graph.children, id);
}

/** Every collection reachable above `id` (not including `id`). */
export function ancestors(graph: CollectionGraph, id: Uuid): Set<Uuid> {
  return walk(graph.parents, id);
}

/** True if adding the edge parent -> child would close a loop. Mirrors the DB trigger. */
export function wouldCreateCycle(graph: CollectionGraph, parentId: Uuid, childId: Uuid): boolean {
  return parentId === childId || descendants(graph, childId).has(parentId);
}

/** Collections that may become parents of `id`: everything except itself and its descendants. */
export function parentCandidates(graph: CollectionGraph, id: Uuid | null): Collection[] {
  const blocked = id ? new Set([id, ...descendants(graph, id)]) : new Set<Uuid>();
  return [...graph.byId.values()]
    .filter((c) => !blocked.has(c.id))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
