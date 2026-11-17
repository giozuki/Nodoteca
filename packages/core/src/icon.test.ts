import { test } from "node:test";
import assert from "node:assert/strict";
import { lastIcon, normalizeIcon } from "./icon.ts";
import { parseNativeJson } from "./native.ts";

test("icon: one emoji is kept, trimmed", () => {
  for (const e of ["📚", "🍝", "❤️", "👍🏽", "👨‍👩‍👧", "🏳️‍🌈", "🇮🇹", "1️⃣"]) assert.equal(normalizeIcon(e), e, e);
  assert.equal(normalizeIcon("  🎬 "), "🎬");
});

test("icon: anything else is rejected", () => {
  for (const v of ["", "   ", "a", "AB", "📚📚", "📚 x", "1", "#", null, undefined, "x".repeat(40)]) assert.equal(normalizeIcon(v), null, String(v));
});

test("icon: lastIcon picks the most recent emoji typed", () => {
  assert.equal(lastIcon("📚🍝"), "🍝");
  assert.equal(lastIcon("🎬 abc"), "🎬");
  assert.equal(lastIcon("abc"), null);
});

test("native: icon on a collection, bad ones warned", () => {
  const p = parseNativeJson({
    format: "nodoteca-import",
    collections: [{ name: "Recipes", icon: "🍝" }, { name: "Films", icon: "movie" }],
    links: [],
  });
  assert.deepEqual(p.details.get("recipes"), { icon: "🍝" });
  assert.equal(p.details.get("films")?.icon, undefined);
  assert.deepEqual(p.warnings, [{ code: "bad-icon", name: "Films", value: "movie" }]);
});
