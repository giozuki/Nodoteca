import { test } from "node:test";
import assert from "node:assert/strict";
import { countsLocal, findSavedLocal, queryLocal, searchLocal } from "./local.ts";
import type { LibrarySnapshot } from "./export.ts";
import type { ItemWithCollections } from "./types.ts";

const item = (id: string, title: string, collections: string[], created_at: string, extra: Partial<ItemWithCollections> = {}): ItemWithCollections => ({
  id, title, url: `https://example.com/${id}`, owner_id: "u", description: null, note: null, thumbnail_url: null, site_name: null,
  metadata: {}, created_at, updated_at: created_at, item_collections: collections.map((collection_id) => ({ collection_id })), ...extra,
});

const snapshot: LibrarySnapshot = {
  collections: [],
  edges: [],
  items: [
    item("a", "Anthropic news", ["c1"], "2026-01-01T00:00:00Z"),
    item("b", "Unrelated", [], "2026-03-01T00:00:00Z", { note: "mentions anthropic in the note" }),
    item("c", "Boris finale", ["c1", "c2"], "2026-02-01T00:00:00Z"),
  ],
};

test("search: partial words, any case, every word, title first", () => {
  assert.deepEqual(searchLocal(snapshot.items, "Anthr").map((i) => i.id), ["a", "b"]);
  assert.deepEqual(searchLocal(snapshot.items, "THROPIC news").map((i) => i.id), ["a"]);
  assert.deepEqual(searchLocal(snapshot.items, "anthr zzz"), []);
  assert.deepEqual(searchLocal(snapshot.items, "   "), []);
  assert.deepEqual(searchLocal(snapshot.items, "example.com/c").map((i) => i.id), ["c"]);
});

test("scopes: all (newest first), unfiled, collections", () => {
  assert.deepEqual(queryLocal(snapshot, { kind: "all" }).map((i) => i.id), ["b", "c", "a"]);
  assert.deepEqual(queryLocal(snapshot, { kind: "unfiled" }).map((i) => i.id), ["b"]);
  assert.deepEqual(queryLocal(snapshot, { kind: "collection", ids: ["c2"] }).map((i) => i.id), ["c"]);
  assert.deepEqual(queryLocal(snapshot, { kind: "collection", ids: ["c1", "c2"] }).map((i) => i.id), ["c", "a"]);
});

test("counts and earlier saves", () => {
  assert.deepEqual([...countsLocal(snapshot.items)].sort(), [["c1", 2], ["c2", 1]]);
  assert.deepEqual(findSavedLocal(snapshot.items, "https://example.com/c").map((m) => m.collection_ids), [["c1", "c2"]]);
});
