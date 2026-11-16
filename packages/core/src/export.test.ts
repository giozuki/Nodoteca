import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBookmarksHtml, buildExportJson, type LibrarySnapshot } from "./export.ts";
import { buildImportPlan, parseBookmarksHtml, parseImportFileFull } from "./import.ts";
import type { Collection, ItemWithCollections } from "./types.ts";

const col = (id: string, name: string): Collection => ({
  id, name, owner_id: "u", description: null, icon: null, color: null, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
});
const item = (id: string, url: string, title: string, collections: string[], created_at: string): ItemWithCollections => ({
  id, url, title, owner_id: "u", description: null, note: id === "i1" ? "my <note>" : null, thumbnail_url: null, site_name: "example.com",
  metadata: { kind: "page" }, created_at, updated_at: created_at, item_collections: collections.map((collection_id) => ({ collection_id })),
});

// Music > Genre X; Movies > Movie Z; Soundtracks > Movie Z (two parents); one empty collection
const snapshot: LibrarySnapshot = {
  collections: [col("m", "Music"), col("g", "Genre X"), col("mv", "Movies"), col("z", "Movie Z"), col("s", "Soundtracks"), col("e", "Empty")],
  edges: [
    { parent_id: "m", child_id: "g", owner_id: "u", created_at: "" },
    { parent_id: "mv", child_id: "z", owner_id: "u", created_at: "" },
    { parent_id: "s", child_id: "z", owner_id: "u", created_at: "" },
  ],
  items: [
    item("i1", "https://example.com/video", "The video", ["g", "z"], "2026-02-01T10:00:00.000Z"),
    item("i2", "https://example.com/loose", "Loose & free", [], "2026-03-01T10:00:00.000Z"),
  ],
};

test("JSON export keeps everything: parents, memberships, metadata", () => {
  const json = buildExportJson(snapshot, new Date("2026-11-16T00:00:00.000Z"));
  assert.equal(json.format, "nodoteca-export");
  assert.equal(json.version, 1);
  assert.deepEqual(json.collections.find((c) => c.name === "Movie Z")!.parents.sort(), ["mv", "s"]);
  assert.deepEqual(json.items[0]!.collections, ["g", "z"]);
  assert.deepEqual(json.items[0]!.metadata, { kind: "page" });
});

test("JSON round trip: re-import rebuilds the same graph", () => {
  const text = JSON.stringify(buildExportJson(snapshot));
  const parsed = parseImportFileFull(text);
  const plan = buildImportPlan(parsed.entries, { tagsAsCollections: new Set(), existingUrls: new Set(), skipExisting: true, edges: parsed.edges });
  assert.deepEqual([...plan.collections.keys()].sort(), ["empty", "genre x", "movie z", "movies", "music", "soundtracks"]);
  assert.deepEqual(plan.edges.map(([p, c]) => `${p}>${c}`).sort(), ["movies>movie z", "music>genre x", "soundtracks>movie z"]);
  const video = plan.items.find((i) => i.url === "https://example.com/video")!;
  assert.deepEqual(video.collectionKeys.sort(), ["genre x", "movie z"]);
  assert.equal(video.note, "my <note>");
  assert.equal(video.created_at, "2026-02-01T10:00:00.000Z");
  assert.deepEqual(video.metadata, { kind: "page" });
});

test("a JSON that isn't a Nodoteca backup is rejected", () => {
  assert.throws(() => parseImportFileFull('{"hello": 1}'), /unknown-format/);
});

test("bookmarks HTML unfolds the graph and escapes text", () => {
  const html = buildBookmarksHtml(snapshot);
  assert.ok(html.startsWith("<!DOCTYPE NETSCAPE-Bookmark-file-1>"));
  assert.ok(html.includes("<style>"));
  assert.ok(html.includes("Loose &amp; free"));
  assert.ok(html.includes("<DD>my &lt;note&gt;"));
  // Movie Z has two parents: it appears under both, with its link each time.
  assert.equal(html.match(/<H3[^>]*>Movie Z<\/H3>/g)!.length, 2);
  assert.equal(html.match(/example\.com\/video/g)!.length, 3); // Genre X + Movie Z twice
});

test("bookmarks HTML is readable by our own importer", () => {
  const entries = parseBookmarksHtml(buildBookmarksHtml(snapshot));
  const paths = entries.filter((e) => e.url.endsWith("/video")).map((e) => e.folders.join(" / ")).sort();
  assert.deepEqual(paths, ["Movies / Movie Z", "Music / Genre X", "Soundtracks / Movie Z"]);
  assert.deepEqual(entries.find((e) => e.url.endsWith("/loose"))!.folders, []);
});
