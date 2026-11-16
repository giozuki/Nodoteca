import { test } from "node:test";
import assert from "node:assert/strict";
import { buildImportPlan, parseBookmarksHtml, parseCsv, parseImportFile, parseRaindropCsv, sharedFolderNames, tagCounts } from "./import.ts";

const CSV = [
  "id,title,note,excerpt,url,folder,tags,created,cover,highlights,favorite",
  '1,"Boris, the finale","my ""note""",An excerpt,https://www.youtube.com/watch?v=abc&si=x,Cinema / Serie TV / Boris,"meme, da-guardare",2026-02-16T15:31:54.000Z,https://i.ytimg.com/a.jpg,,false',
  "2,Lynch talk,,,https://example.com/lynch,Cinema / David Lynch,,2026-03-01T10:00:00.000Z,,,false",
  "3,Cinema history,,,https://example.com/history,Arte / Cinema,meme,2026-04-01T10:00:00.000Z,,,false",
  "4,Loose link,,,https://example.com/loose,Unsorted,,2026-05-01T10:00:00.000Z,,,false",
  "5,Same again,,,https://youtu.be/abc,Cinema,,2026-06-01T10:00:00.000Z,,,false",
  "6,Not a web link,,,javascript:alert(1),Cinema,,,,,false",
].join("\r\n");

test("CSV parser handles quotes, commas, escaped quotes and CRLF", () => {
  const rows = parseCsv('a,b\r\n"x, y","say ""hi"""\r\n');
  assert.deepEqual(rows, [["a", "b"], ["x, y", 'say "hi"']]);
});

test("Raindrop CSV: fields, nested folders, tags, Unsorted, non-http dropped", () => {
  const entries = parseRaindropCsv(CSV);
  assert.equal(entries.length, 5);
  const first = entries[0]!;
  assert.equal(first.title, "Boris, the finale");
  assert.equal(first.note, 'my "note"');
  assert.equal(first.description, "An excerpt");
  assert.deepEqual(first.folders, ["Cinema", "Serie TV", "Boris"]);
  assert.deepEqual(first.tags, ["meme", "da-guardare"]);
  assert.equal(first.created_at, "2026-02-16T15:31:54.000Z");
  assert.deepEqual(entries[3]!.folders, []);
});

test("Raindrop CSV: wrong file is rejected", () => {
  assert.throws(() => parseRaindropCsv("name,age\nBob,3"), /not-raindrop-csv/);
});

test("plan: same-named folders merge into one collection with several parents", () => {
  const plan = buildImportPlan(parseRaindropCsv(CSV), { tagsAsCollections: new Set(), existingUrls: new Set(), skipExisting: true });
  assert.deepEqual([...plan.collections.keys()].sort(), ["arte", "boris", "cinema", "david lynch", "serie tv"]);
  const edges = plan.edges.map(([p, c]) => `${p}>${c}`).sort();
  assert.deepEqual(edges, ["arte>cinema", "cinema>david lynch", "cinema>serie tv", "serie tv>boris"]);
  assert.deepEqual(plan.items[0]!.collectionKeys, ["boris"]); // deepest folder only
});

test("plan: duplicates in the file (after normalization) and existing links are skipped", () => {
  const plan = buildImportPlan(parseRaindropCsv(CSV), {
    tagsAsCollections: new Set(),
    existingUrls: new Set(["https://example.com/lynch"]),
    skipExisting: true,
  });
  assert.equal(plan.skippedDuplicatesInFile, 1); // youtu.be/abc == youtube.com/watch?v=abc
  assert.equal(plan.skippedExisting, 1);
  assert.equal(plan.items.length, 3);
  assert.equal(plan.items[0]!.url, "https://www.youtube.com/watch?v=abc");
});

test("plan: chosen tags become collections", () => {
  const plan = buildImportPlan(parseRaindropCsv(CSV), {
    tagsAsCollections: new Set(["meme"]),
    existingUrls: new Set(),
    skipExisting: false,
  });
  assert.ok(plan.collections.has("meme") && !plan.collections.has("da-guardare"));
  assert.deepEqual(plan.items[0]!.collectionKeys.sort(), ["boris", "meme"]);
});

test("tag counts", () => {
  assert.deepEqual(tagCounts(parseRaindropCsv(CSV)), [["meme", 2], ["da-guardare", 1]]);
});

const HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
  <DT><H3 ADD_DATE="1700000000" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
  <DL><p>
    <DT><A HREF="https://example.com/a" ADD_DATE="1700000000">A &amp; B</A>
    <DT><H3>Music</H3>
    <DL><p>
      <DT><A HREF="https://example.com/song" ADD_DATE="1700000100" TAGS="rock,live">Song</A>
      <DD>Great live version
    </DL><p>
  </DL><p>
  <DT><A HREF="place:sort=8">Firefox smart folder</A>
</DL><p>`;

test("bookmarks HTML: folders without browser roots, tags, description, dates", () => {
  const entries = parseBookmarksHtml(HTML);
  assert.equal(entries.length, 2);
  assert.equal(entries[0]!.title, "A & B");
  assert.deepEqual(entries[0]!.folders, []);
  assert.equal(entries[0]!.created_at, new Date(1700000000 * 1000).toISOString());
  assert.deepEqual(entries[1]!.folders, ["Music"]);
  assert.deepEqual(entries[1]!.tags, ["rock", "live"]);
  assert.equal(entries[1]!.description, "Great live version");
});

test("format detection", () => {
  assert.equal(parseImportFile(HTML)[0]!.source, "bookmarks");
  assert.equal(parseImportFile(CSV)[0]!.source, "raindrop");
});

test("shared folder names are detected", () => {
  assert.deepEqual(sharedFolderNames(parseRaindropCsv(CSV)), [{ name: "Cinema", places: ["", "Arte"] }]);
});

test("plan without merging: nested copy gets the parent's name", () => {
  const plan = buildImportPlan(parseRaindropCsv(CSV), {
    tagsAsCollections: new Set(),
    existingUrls: new Set(),
    skipExisting: true,
    mergeSameNames: false,
  });
  assert.ok(plan.collections.has("cinema") && plan.collections.has("cinema (arte)"));
  assert.equal(plan.collections.get("cinema (arte)"), "Cinema (Arte)");
  const edges = plan.edges.map(([p, c]) => `${p}>${c}`).sort();
  assert.deepEqual(edges, ["arte>cinema (arte)", "cinema>david lynch", "cinema>serie tv", "serie tv>boris"]);
});
