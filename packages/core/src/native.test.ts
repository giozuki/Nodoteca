import { test } from "node:test";
import assert from "node:assert/strict";
import { ImportFormatError, parseNativeJson } from "./native.ts";
import { buildImportPlan, parseImportFileFull } from "./import.ts";

const file = {
  format: "nodoteca-import",
  version: 1,
  collections: [
    { name: "Movies" },
    { name: "Soundtracks", color: "#3DD6B5" },
    { name: "Movie Z", parents: ["Movies", "Soundtracks"], description: "My favourite" },
    { name: "Empty one" },
  ],
  links: [
    { url: "https://example.com/v", title: "The video", collections: ["Genre X", "Artist Y", "Movie Z"], created_at: "2026-02-01" },
    { url: "https://example.com/plain" },
    { title: "no url" },
    { url: "ftp://nope" },
    "not an object",
    { url: "https://example.com/d", created_at: "yesterday-ish" },
  ],
};

test("native: links, collections by name, several parents, details", () => {
  const p = parseNativeJson(file);
  assert.equal(p.entries.length, 3);
  assert.deepEqual(p.entries[0]!.collections, ["Genre X", "Artist Y", "Movie Z"]);
  assert.equal(p.entries[0]!.created_at, "2026-02-01T00:00:00.000Z");
  assert.deepEqual(p.details.get("soundtracks"), { color: "#3DD6B5" });
  assert.deepEqual(p.details.get("movie z"), { description: "My favourite" });
  const real = p.edges.filter(([a, b]) => a !== b).map(([a, b]) => `${a}>${b}`).sort();
  assert.deepEqual(real, ["Movies>Movie Z", "Soundtracks>Movie Z"]);
});

test("native: problems become warnings, not failures", () => {
  const codes = parseNativeJson(file).warnings.map((w) => w.code + ("reason" in w ? `:${w.reason}` : "") + ("name" in w ? `:${w.name}` : ""));
  assert.ok(codes.includes("link-skipped:missing-url"));
  assert.ok(codes.includes("link-skipped:invalid-url"));
  assert.ok(codes.includes("link-skipped:not-an-object"));
  assert.ok(codes.includes("bad-date"));
  assert.ok(codes.includes("undeclared-collection:Genre X"));
  assert.ok(codes.includes("undeclared-collection:Artist Y"));
});

test("native: cycles are cut, self-parents ignored, bad colors reported", () => {
  const p = parseNativeJson({
    format: "nodoteca-import",
    collections: [
      { name: "A", parents: ["B"] },
      { name: "B", parents: ["C"] },
      { name: "C", parents: ["A", "C"], color: "red" },
    ],
    links: [],
  });
  const real = p.edges.filter(([a, b]) => a !== b);
  assert.equal(real.length, 2);
  const codes = p.warnings.map((w) => w.code);
  assert.ok(codes.includes("cycle-removed") && codes.includes("self-parent") && codes.includes("bad-color"));
});

test("native: unusable files are rejected with a reason", () => {
  assert.throws(() => parseNativeJson({ format: "something-else", links: [] }), (e: unknown) => e instanceof ImportFormatError && e.code === "unknown-format");
  assert.throws(() => parseNativeJson({ format: "nodoteca-import", version: 2, links: [] }), (e: unknown) => e instanceof ImportFormatError && e.code === "unsupported-version");
  assert.throws(() => parseNativeJson({ format: "nodoteca-import", links: {} }), (e: unknown) => e instanceof ImportFormatError && e.code === "links-not-array");
  assert.throws(() => parseImportFileFull("{ not json"), (e: unknown) => e instanceof ImportFormatError && e.code === "invalid-json");
});

test("native: end to end through the import plan", () => {
  const parsed = parseImportFileFull(JSON.stringify(file));
  const plan = buildImportPlan(parsed.entries, { tagsAsCollections: new Set(), existingUrls: new Set(), skipExisting: true, edges: parsed.edges });
  assert.deepEqual(
    [...plan.collections.keys()].sort(),
    ["artist y", "empty one", "genre x", "movie z", "movies", "soundtracks"],
  );
  assert.deepEqual(plan.items[0]!.collectionKeys.sort(), ["artist y", "genre x", "movie z"]);
  assert.equal(parsed.warnings.length > 0, true);
  assert.equal(parsed.details.get("soundtracks")?.color, "#3DD6B5");
});
