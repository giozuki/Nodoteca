import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attachmentsOf, fileExtension, fileKind, filesOf, formatBytes, opensInline, primaryFile, sanitizeFileName, stripExtension, thumbFile,
} from "./files.ts";
import { buildBookmarksHtml, buildExportJson } from "./export.ts";
import { searchLocal } from "./local.ts";
import type { ItemFile, ItemWithCollections } from "./types.ts";

const file = (id: string, name: string, position: number, extra: Partial<ItemFile> = {}): ItemFile => ({
  id, item_id: "i", owner_id: "u", path: `u/${id}/${name}`, name, size: 2048, mime: "application/pdf", sha256: null,
  thumb_path: null, position, created_at: "2026-01-01T00:00:00Z", ...extra,
});
const item = (url: string | null, files: ItemFile[] | undefined): ItemWithCollections => ({
  id: url ?? "file-only", url, title: null, owner_id: "u", description: null, note: null, thumbnail_url: null, site_name: null,
  metadata: {}, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", item_collections: [], item_files: files,
});

test("fileKind and what opens in a tab", () => {
  assert.equal(fileKind("image/png"), "image");
  assert.equal(fileKind("application/octet-stream", "scan.PDF"), "pdf");
  assert.equal(fileKind("video/mp4"), "video");
  assert.equal(fileKind("application/zip"), "archive");
  assert.equal(fileKind("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "document");
  assert.equal(fileKind("text/plain"), "text");
  assert.equal(fileKind(""), "other");
  assert.ok(opensInline("image/jpeg") && opensInline("application/pdf") && opensInline("video/webm"));
  assert.ok(!opensInline("image/svg+xml"), "SVG can carry scripts: always downloaded");
  assert.ok(!opensInline("text/html") && !opensInline("audio/mpeg") && !opensInline("application/zip"));
});

test("file names: extension, title, safe storage name", () => {
  assert.equal(fileExtension("Report.Final.pdf"), "PDF");
  assert.equal(fileExtension(".bashrc"), "");
  assert.equal(fileExtension("README"), "");
  assert.equal(stripExtension("report.final.pdf"), "report.final");
  assert.equal(sanitizeFileName("Città d'arte – foto 1.JPEG"), "Citta-d-arte-foto-1.jpeg");
  assert.equal(sanitizeFileName("../../etc/passwd"), "passwd");
  assert.equal(sanitizeFileName("C:\\Users\\me\\cv.pdf"), "cv.pdf");
  assert.equal(sanitizeFileName("日本.png"), "file.png");
  assert.ok(sanitizeFileName("a".repeat(300) + ".txt").length <= 120);
});

test("formatBytes", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(50 * 1024 * 1024), "50 MB");
  assert.equal(formatBytes(1536, "it"), "1,5 KB");
});

test("primary file and attachments", () => {
  const files = [file("b", "b.pdf", 1), file("a", "a.png", 0, { mime: "image/png", thumb_path: "u/a/thumb.webp" })];
  const fileOnly = item(null, files);
  assert.deepEqual(filesOf(fileOnly).map((f) => f.id), ["a", "b"]);
  assert.equal(primaryFile(fileOnly)?.id, "a");
  assert.deepEqual(attachmentsOf(fileOnly).map((f) => f.id), ["b"]);
  const link = item("https://example.com", files);
  assert.equal(primaryFile(link), null);
  assert.deepEqual(attachmentsOf(link).map((f) => f.id), ["a", "b"]);
  assert.equal(thumbFile(link)?.id, "a");
  assert.deepEqual(filesOf(item("https://example.com", undefined)), [], "offline copies from before files");
});

test("search, export and bookmarks with files", () => {
  const fileOnly = item(null, [file("a", "Quarterly report.pdf", 0, { sha256: "f".repeat(64) })]);
  const link = item("https://example.com/x", undefined);
  assert.deepEqual(searchLocal([fileOnly, link], "quarterly").map((i) => i.id), ["file-only"]);

  const json = buildExportJson({ collections: [], edges: [], items: [fileOnly, link] });
  const exported = json.items.find((i) => i.id === "file-only")!;
  assert.equal(exported.url, null);
  assert.deepEqual(exported.files, [{ name: "Quarterly report.pdf", size: 2048, mime: "application/pdf", sha256: "f".repeat(64) }]);
  assert.equal(json.items.find((i) => i.id === link.id)!.files, undefined);

  const html = buildBookmarksHtml({ collections: [], edges: [], items: [fileOnly, link] });
  assert.ok(html.includes("https://example.com/x") && !html.includes("Quarterly"), "file-only items have no address: left out");
});
