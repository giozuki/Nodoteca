import { test } from "node:test";
import assert from "node:assert/strict";
import { ancestors, buildGraph, descendants, parentCandidates, wouldCreateCycle } from "./graph.ts";
import type { Collection, CollectionEdge } from "./types.ts";

const c = (id: string): Collection => ({
  id, name: id, owner_id: "u", description: null, icon: null, color: null, created_at: "", updated_at: "",
});
const e = (parent_id: string, child_id: string): CollectionEdge => ({ parent_id, child_id, owner_id: "u", created_at: "" });

// Music -> Genre X, Music -> Artist Y, Movies -> Movie Z, Soundtracks -> Movie Z
const graph = buildGraph(
  ["Music", "Genre X", "Artist Y", "Movies", "Movie Z", "Soundtracks"].map(c),
  [e("Music", "Genre X"), e("Music", "Artist Y"), e("Movies", "Movie Z"), e("Soundtracks", "Movie Z")],
);

test("roots are collections without parents, sorted by name", () => {
  assert.deepEqual(graph.roots, ["Movies", "Music", "Soundtracks"]);
});

test("a collection can have several parents", () => {
  assert.deepEqual(graph.parents.get("Movie Z"), ["Movies", "Soundtracks"]);
  assert.deepEqual([...ancestors(graph, "Movie Z")].sort(), ["Movies", "Soundtracks"]);
});

test("descendants walk the whole subgraph", () => {
  assert.deepEqual([...descendants(graph, "Music")].sort(), ["Artist Y", "Genre X"]);
});

test("cycles are detected", () => {
  assert.equal(wouldCreateCycle(graph, "Movie Z", "Movies"), true);
  assert.equal(wouldCreateCycle(graph, "Music", "Music"), true);
  assert.equal(wouldCreateCycle(graph, "Music", "Movies"), false);
});

test("parent candidates exclude self and descendants", () => {
  const names = parentCandidates(graph, "Music").map((x) => x.id);
  assert.ok(!names.includes("Music") && !names.includes("Genre X") && !names.includes("Artist Y"));
  assert.ok(names.includes("Movies"));
});

test("edges pointing to unknown collections are ignored", () => {
  const g = buildGraph([c("A")], [e("A", "ghost")]);
  assert.deepEqual(g.children.get("A"), undefined);
});
