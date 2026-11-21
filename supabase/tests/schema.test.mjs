// Schema tests: run every migration on an in-memory Postgres (PGlite) with a
// minimal stand-in for Supabase's `auth` schema, then check the rules that
// matter: multi-collection items, the collection graph, and Row Level Security.
//
//   npm run test:db
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readdirSync, readFileSync } from "node:fs";
const db = new PGlite({ extensions: { pg_trgm } });
const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222";
await db.exec(`
  create schema auth; create schema extensions;
  create table auth.users (id uuid primary key);
  insert into auth.users values ('${A}'), ('${B}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create role anon; create role authenticated;
  create publication supabase_realtime;
  -- minimal stand-in for Supabase Storage
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb);
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant usage on schema auth, extensions, public to authenticated;
  grant execute on function auth.uid() to authenticated;
  grant references on auth.users to authenticated;
`);
const dir = new URL("../migrations/", import.meta.url);
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await db.exec(readFileSync(new URL(f, dir), "utf8"));
const as = async (uid, sql) => { await db.exec(`reset role; select set_config('test.uid','${uid}',false); set role authenticated;`); return db.query(sql); };
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const fails = async (uid, sql, m) => { try { await as(uid, sql); ok(false, m); } catch (e) { ok(true, m + "  -> " + e.message); } };

const ins = async (n) => (await as(A, `insert into collections (name) values ('${n}') returning id`)).rows[0].id;
const music = await ins("Music"), genre = await ins("Genre X"), artist = await ins("Artist Y"), movies = await ins("Movies"), movieZ = await ins("Movie Z"), soundtracks = await ins("Soundtracks");
await fails(A, `insert into collections (name) values (' genre x ')`, "duplicate collection name (case/space-insensitive) rejected");
await as(A, `insert into collection_edges (parent_id, child_id) values ('${music}','${genre}'),('${music}','${artist}'),('${movies}','${movieZ}'),('${soundtracks}','${movieZ}')`);
ok(true, "collection with two parents (Movie Z under Movies and Soundtracks)");
await fails(A, `insert into collection_edges (parent_id, child_id) values ('${movieZ}','${movies}')`, "direct cycle rejected");
await as(A, `insert into collection_edges (parent_id, child_id) values ('${genre}','${soundtracks}')`);
await fails(A, `insert into collection_edges (parent_id, child_id) values ('${movieZ}','${music}')`, "indirect cycle rejected (Music>Genre>Soundtracks>MovieZ>Music)");
await fails(A, `insert into collection_edges (parent_id, child_id) values ('${music}','${music}')`, "self-loop rejected");

const r = await as(A, `select id from save_item('https://www.youtube.com/watch?v=abc', array['${genre}','${artist}','${movieZ}']::uuid[], 'Edit video')`);
const item = r.rows[0].id;
ok((await as(A, `select count(*)::int c from item_collections where item_id='${item}'`)).rows[0].c === 3, "one item in three collections");
await as(A, `select save_item('https://www.youtube.com/watch?v=abc', array['${music}']::uuid[])`);
const fs = await as(A, `select * from find_saved('https://www.youtube.com/watch?v=abc')`);
ok(fs.rows.length === 2, "duplicate URL allowed; find_saved returns both saves");
ok((await as(A, `select count(*)::int c from search_items('edit')`)).rows[0].c === 1, "search finds by title");

ok((await as(B, `select count(*)::int c from items`)).rows[0].c === 0, "RLS: user B sees none of A's items");
ok((await as(B, `select count(*)::int c from collections`)).rows[0].c === 0, "RLS: user B sees none of A's collections");
const bItem = (await as(B, `insert into items (url) values ('https://x.y') returning id`)).rows[0].id;
await fails(B, `insert into item_collections (item_id, collection_id) values ('${bItem}','${music}')`, "RLS: B cannot file into A's collection");
await fails(B, `insert into items (url, owner_id) values ('https://x.y','${A}')`, "RLS: B cannot insert rows owned by A");
ok((await as(B, `update items set title='hacked' where id='${item}' returning id`)).rows.length === 0, "RLS: B cannot update A's item");
await fails(B, `insert into collection_edges (parent_id, child_id) values ('${music}','${genre}')`, "RLS: B cannot edit A's graph");

// Not signed in: no access at all, regardless of RLS.
const asAnon = async (sql) => { await db.exec(`reset role; select set_config('test.uid','',false); set role anon;`); return db.query(sql); };
for (const t of ["items", "collections", "item_collections", "collection_edges"]) {
  try { await asAnon(`select 1 from ${t} limit 1`); ok(false, `anon cannot read ${t}`); }
  catch (e) { ok(true, `anon cannot read ${t}  -> ${e.message}`); }
}
try { await asAnon(`select save_item('https://x.y')`); ok(false, "anon cannot call save_item"); }
catch (e) { ok(true, `anon cannot call save_item  -> ${e.message}`); }

// App RPCs
await as(A, `select set_item_collections('${item}', array['${music}','${genre}']::uuid[])`);
const now = (await as(A, `select array_agg(collection_id order by collection_id) ids from item_collections where item_id='${item}'`)).rows[0].ids;
ok(now.length === 2 && now.includes(music) && now.includes(genre), "set_item_collections replaces the whole set");
const counts = (await as(A, `select * from collection_counts()`)).rows;
ok(counts.find((r) => r.collection_id === music)?.item_count == 2, "collection_counts counts items per collection");
ok((await as(B, `select * from collection_counts()`)).rows.length === 0, "collection_counts only sees own rows");
await as(A, `select set_collection_parents('${movieZ}', array['${movies}']::uuid[])`);
ok((await as(A, `select count(*)::int c from collection_edges where child_id='${movieZ}'`)).rows[0].c === 1, "set_collection_parents replaces parents");
await fails(A, `select set_collection_parents('${movies}', array['${movieZ}']::uuid[])`, "set_collection_parents still blocks cycles");
await as(B, `select set_item_collections('${item}', '{}'::uuid[])`);
ok((await as(A, `select count(*)::int c from item_collections where item_id='${item}'`)).rows[0].c === 2, "B cannot clear A's item collections");
try { await asAnon(`select collection_counts()`); ok(false, "anon cannot call collection_counts"); }
catch (e) { ok(true, `anon cannot call collection_counts  -> ${e.message}`); }

// Partial-match search
const sid = (await as(A, `select id from save_item('https://www.anthropic.com/news', '{}'::uuid[], 'Anthropic news', null, 'Read later 100%')`)).rows[0].id;
const hits = async (q, uid = A) => {
  await db.exec(`reset role; select set_config('test.uid','${uid}',false); set role authenticated;`);
  return (await db.query("select id from search_items($1)", [q])).rows.map((r) => r.id);
};
ok((await hits("Anthr")).includes(sid), "search: prefix 'Anthr' matches 'Anthropic'");
ok((await hits("thropic")).includes(sid), "search: infix 'thropic' matches");
ok((await hits("ANTHROPIC")).includes(sid), "search: case-insensitive");
ok((await hits("news anthr")).includes(sid), "search: several words, any order");
ok(!(await hits("anthr zzz")).includes(sid), "search: every word must match");
ok((await hits("100%")).includes(sid) && !(await hits("1_0")).includes(sid), "search: % and _ are literal");
ok((await hits("anthropic.com")).includes(sid), "search: matches the URL");
ok((await hits("")).length === 0 && (await hits("   ")).length === 0, "search: empty query returns nothing");
ok((await hits("Anthr", B)).length === 0, "search: RLS, B finds none of A's items");
await as(A, `select save_item('https://example.com/a', '{}'::uuid[], 'Unrelated', null, 'mentions anthropic in the note')`);
const ranked = await hits("anthropic");
ok(ranked[0] === sid && ranked.length === 2, "search: title matches come before note matches");

// Thumbnail storage
await db.exec("reset role");
ok((await db.query("select public from storage.buckets where id = 'thumbnails'")).rows[0]?.public === true, "thumbnails bucket exists and is public");
await as(A, `insert into storage.objects (bucket_id, name) values ('thumbnails', '${A}/abc.jpg')`);
ok(true, "storage: A can upload into own folder");
await fails(A, `insert into storage.objects (bucket_id, name) values ('thumbnails', '${B}/abc.jpg')`, "storage: A cannot upload into B's folder");
await fails(A, `insert into storage.objects (bucket_id, name) values ('thumbnails', 'abc.jpg')`, "storage: no uploads outside a user folder");
ok((await as(B, `select count(*)::int c from storage.objects`)).rows[0].c === 0, "storage: B cannot see A's files");

// Files
await db.exec("reset role");
ok((await db.query("select public from storage.buckets where id = 'files'")).rows[0]?.public === false, "files bucket exists and is private");
const upload = (uid, path, size) => as(uid, `insert into storage.objects (bucket_id, name, metadata) values ('files', '${path}', '{"size": ${size}}')`);
const fileJson = (path, name, extra = "") => `'[{"path": "${path}", "name": "${name}", "size": 1, "mime": "application/pdf"${extra}}]'::jsonb`;
const sha = "a".repeat(64);

await fails(A, `select save_item(null)`, "files: an item with no link and no file is rejected");
await upload(A, `${A}/f1/report.pdf`, 1234);
const fileItem = (await as(A, `select id from save_item(null, array['${music}']::uuid[], 'Quarterly report', p_files => ${fileJson(`${A}/f1/report.pdf`, "report.pdf", `, "sha256": "${sha}"`)})`)).rows[0].id;
ok(!!fileItem, "files: an item with only a file is saved");
ok((await as(A, `select size::int s from item_files where item_id='${fileItem}'`)).rows[0].s === 1234, "files: size is taken from Storage, not from the client");
ok((await hits("report.pdf")).includes(fileItem), "files: search finds an item by file name");
const dup = (await as(A, `select * from find_saved_file('${sha}')`)).rows;
ok(dup.length === 1 && dup[0].collection_ids.includes(music), "files: find_saved_file finds earlier copies and their collections");
await fails(A, `select save_item(null, p_files => ${fileJson(`${A}/missing/x.pdf`, "x.pdf")})`, "files: a file that is not in Storage is rejected");
await upload(B, `${B}/f/secret.pdf`, 10);
await fails(A, `select save_item(null, p_files => ${fileJson(`${B}/f/secret.pdf`, "secret.pdf")})`, "files: cannot reference a file in another user's folder");

// Attachments on a link
await upload(A, `${A}/f2/page.html`, 10);
await upload(A, `${A}/f3/shot.png`, 20);
const linkItem = (await as(A, `select id from save_item('https://example.com/article', '{}'::uuid[], 'Article')`)).rows[0].id;
await as(A, `select add_item_files('${linkItem}', '[{"path": "${A}/f2/page.html", "name": "page.html"}, {"path": "${A}/f3/shot.png", "name": "shot.png", "mime": "image/png"}]'::jsonb)`);
const att = (await as(A, `select id, name, position from item_files where item_id='${linkItem}' order by position`)).rows;
ok(att.length === 2 && att[0].name === "page.html" && att[1].position === 1, "files: several attachments on a link, in order");
await as(A, `select set_item_file_order('${linkItem}', array['${att[1].id}','${att[0].id}']::uuid[])`);
ok((await as(A, `select name from item_files where item_id='${linkItem}' order by position limit 1`)).rows[0].name === "shot.png", "files: set_item_file_order reorders");
const removed = (await as(A, `select remove_item_file('${att[0].id}') p`)).rows[0].p;
ok(removed.length === 1 && removed[0] === `${A}/f2/page.html`, "files: remove_item_file returns the Storage path to delete");
await as(A, `select remove_item_file('${att[1].id}')`);
ok((await as(A, `select files_text from items where id='${linkItem}'`)).rows[0].files_text === "", "files: a link keeps working with no attachments left");
const only = (await as(A, `select id from item_files where item_id='${fileItem}'`)).rows[0].id;
await fails(A, `select remove_item_file('${only}')`, "files: cannot remove the last file of an item with no link");
await fails(A, `update items set url = null where id='${linkItem}'`, "files: cannot clear the link of an item with no files");
await fails(A, `update item_files set size = 1 where id='${only}'`, "files: size cannot be changed after the fact");

// RLS
ok((await as(B, `select count(*)::int c from item_files`)).rows[0].c === 0, "files RLS: B sees none of A's files");
await upload(B, `${B}/g/mine.pdf`, 10);
await fails(B, `select add_item_files('${linkItem}', ${fileJson(`${B}/g/mine.pdf`, "mine.pdf")})`, "files RLS: B cannot attach a file to A's item");
await fails(A, `insert into storage.objects (bucket_id, name) values ('files', '${B}/x.pdf')`, "files storage: A cannot upload into B's folder");
try { await asAnon(`select 1 from item_files limit 1`); ok(false, "anon cannot read item_files"); }
catch (e) { ok(true, `anon cannot read item_files  -> ${e.message}`); }

// Limits
await db.exec(`reset role; insert into storage_limits (owner_id, max_file_bytes, max_total_bytes) values ('${A}', 2000, 3000)`);
const usage = (await as(A, `select * from storage_usage()`)).rows[0];
ok(Number(usage.used_bytes) === 1234 && Number(usage.max_total_bytes) === 3000, "limits: storage_usage reports space used and the user's own limits");
ok(Number((await as(B, `select * from storage_usage()`)).rows[0].max_file_bytes) === 52428800, "limits: users without a row get the defaults");
await upload(A, `${A}/big/video.mp4`, 2500);
await fails(A, `select add_item_files('${linkItem}', ${fileJson(`${A}/big/video.mp4`, "video.mp4")})`, "limits: a file over the per-file limit is rejected");
await upload(A, `${A}/q1/a.bin`, 1500);
await upload(A, `${A}/q2/b.bin`, 1500);
await as(A, `select add_item_files('${linkItem}', ${fileJson(`${A}/q1/a.bin`, "a.bin")})`);
await fails(A, `select add_item_files('${linkItem}', ${fileJson(`${A}/q2/b.bin`, "b.bin")})`, "limits: a file that would go over the total quota is rejected");
await db.exec(`reset role; delete from storage_limits`);
await fails(A, `insert into storage_limits (owner_id, max_file_bytes, max_total_bytes) values ('${A}', 1, 1)`, "limits: users cannot set their own limits");
const many = Array.from({ length: 21 }, (_, i) => `${A}/many/${i}.txt`);
for (const p of many) await upload(A, p, 1);
await fails(A, `select save_item('https://example.com/many', p_files => '${JSON.stringify(many.map((path, i) => ({ path, name: `${i}.txt` })))}'::jsonb)`, "limits: at most 20 files on one item");

// Deleting an item takes its file rows with it.
await as(A, `delete from items where id='${fileItem}'`);
ok((await as(A, `select count(*)::int c from item_files where item_id='${fileItem}'`)).rows[0].c === 0, "files: deleting an item deletes its file rows");
