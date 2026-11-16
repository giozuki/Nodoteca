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
const music = await ins("Music"), genre = await ins("Genre X"), artist = await ins("Artist Y"), anime = await ins("Anime"), animeZ = await ins("Anime Z"), edits = await ins("Edits");
await fails(A, `insert into collections (name) values (' genre x ')`, "duplicate collection name (case/space-insensitive) rejected");
await as(A, `insert into collection_edges (parent_id, child_id) values ('${music}','${genre}'),('${music}','${artist}'),('${anime}','${animeZ}'),('${edits}','${animeZ}')`);
ok(true, "collection with two parents (Anime Z under Anime and Edits)");
await fails(A, `insert into collection_edges (parent_id, child_id) values ('${animeZ}','${anime}')`, "direct cycle rejected");
await as(A, `insert into collection_edges (parent_id, child_id) values ('${genre}','${edits}')`);
await fails(A, `insert into collection_edges (parent_id, child_id) values ('${animeZ}','${music}')`, "indirect cycle rejected (Music>Genre>Edits>AnimeZ>Music)");
await fails(A, `insert into collection_edges (parent_id, child_id) values ('${music}','${music}')`, "self-loop rejected");

const r = await as(A, `select id from save_item('https://www.youtube.com/watch?v=abc', array['${genre}','${artist}','${animeZ}']::uuid[], 'Edit video')`);
const item = r.rows[0].id;
ok((await as(A, `select count(*)::int c from item_collections where item_id='${item}'`)).rows[0].c === 3, "one item in three collections");
await as(A, `select save_item('https://www.youtube.com/watch?v=abc', array['${music}']::uuid[])`);
const fs = await as(A, `select * from find_saved('https://www.youtube.com/watch?v=abc')`);
ok(fs.rows.length === 2, "duplicate URL allowed; find_saved returns both saves");
ok((await as(A, `select count(*)::int c from items where search @@ plainto_tsquery('simple','edit')`)).rows[0].c === 1, "full-text search finds by title");

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
