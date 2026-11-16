import { test } from "node:test";
import assert from "node:assert/strict";
import { extractShared } from "./share.ts";

test("Chrome: url param", () => {
  assert.deepEqual(extractShared({ url: "https://example.com/a", title: "Example" }), { url: "https://example.com/a", title: "Example" });
});

test("YouTube: URL inside text", () => {
  assert.deepEqual(extractShared({ text: "https://youtu.be/abc123?si=x", title: "Great song" }), {
    url: "https://youtu.be/abc123?si=x",
    title: "Great song",
  });
});

test("title and URL mixed in text", () => {
  assert.deepEqual(extractShared({ text: "Check this out: https://example.com/post." }), {
    url: "https://example.com/post",
    title: "Check this out",
  });
});

test("no URL at all", () => {
  assert.deepEqual(extractShared({ text: "just words" }), { url: null, title: "just words" });
});

test("empty input", () => {
  assert.deepEqual(extractShared({}), { url: null, title: null });
});
