-- =============================================================================
-- Nodoteca: files
--
-- An item can now hold a link, one or more files, or both:
--   - a link with attachments keeps a copy of what the link points to, in case
--     the page changes or disappears;
--   - an item with no link and only files is filed, searched and edited like a
--     link; its first file is the one the card opens.
--
--   item_files       one row per file, in a private Storage bucket "files"
--                    under <user id>/<random folder>/<file name>
--   storage_limits   per-user overrides of the default limits (one file, and
--                    all files together). No row = the defaults below.
--
-- Files are uploaded to Storage first, then recorded here. Recording a file
-- checks that the object really exists and takes its size from Storage, so a
-- client cannot under-report sizes to dodge the quota.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Limits
-- -----------------------------------------------------------------------------

create table public.storage_limits (
  owner_id        uuid primary key references auth.users (id) on delete cascade,
  max_file_bytes  bigint not null check (max_file_bytes > 0),
  max_total_bytes bigint not null check (max_total_bytes >= 0),
  updated_at      timestamptz not null default now()
);

alter table public.storage_limits enable row level security;

-- Users can read their own limits; only the project owner (SQL editor,
-- service role) can change them.
create policy "read own storage limits" on public.storage_limits
  for select to authenticated
  using (owner_id = (select auth.uid()));

revoke all on public.storage_limits from anon, authenticated;
grant select on public.storage_limits to authenticated;

-- The limits that apply to a user. Defaults: 50 MB per file (also the
-- bucket's hard ceiling, see below) and 800 MB in all, which leaves room in
-- Supabase's free 1 GB for thumbnails.
create or replace function public.storage_limits_for(p_owner uuid)
returns table (max_file_bytes bigint, max_total_bytes bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(l.max_file_bytes, 52428800),
         coalesce(l.max_total_bytes, 838860800)
  from (select 1) as d
  left join public.storage_limits l on l.owner_id = p_owner;
$$;

-- -----------------------------------------------------------------------------
-- Items: the link becomes optional, file names become searchable
-- -----------------------------------------------------------------------------

alter table public.items alter column url drop not null;

-- Names of the item's files, kept up to date by a trigger on item_files.
alter table public.items add column files_text text not null default '';

alter table public.items drop column search_text;    -- also drops its trigram index
alter table public.items add column search_text text generated always as (
  coalesce(title, '') || ' ' ||
  coalesce(note, '') || ' ' ||
  coalesce(site_name, '') || ' ' ||
  coalesce(url, '') || ' ' ||
  coalesce(description, '') || ' ' ||
  files_text
) stored;

create index items_search_text_trgm_idx
  on public.items using gin (search_text extensions.gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- Files
-- -----------------------------------------------------------------------------

create table public.item_files (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.items (id) on delete cascade,
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Object name in the "files" bucket. Always inside the owner's folder.
  path       text not null unique check (char_length(path) <= 1024),
  name       text not null check (char_length(btrim(name)) between 1 and 255),
  size       bigint not null default 0 check (size >= 0),
  mime       text not null default 'application/octet-stream' check (char_length(mime) <= 255),
  sha256     text check (sha256 ~ '^[0-9a-f]{64}$'),
  -- A small preview (images only), also in the "files" bucket.
  thumb_path text check (char_length(thumb_path) <= 1024),
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  check (split_part(path, '/', 1) = owner_id::text),
  check (thumb_path is null or split_part(thumb_path, '/', 1) = owner_id::text)
);

create index item_files_item_idx   on public.item_files (item_id, position);
create index item_files_sha256_idx on public.item_files (owner_id, sha256);

alter table public.item_files enable row level security;

create policy "own item files" on public.item_files
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.items i where i.id = item_id and i.owner_id = (select auth.uid()))
  );

revoke all on public.item_files from anon, authenticated;
grant select, insert, delete on public.item_files to authenticated;
-- Only the display name and the order can change; path and size are facts.
grant update (name, position) on public.item_files to authenticated;

-- Before a file is recorded: it must exist in Storage, and fit the limits.
-- Error codes: NF001 file too large, NF002 quota full, NF003 too many files
-- on one item, NF004 the object is not in Storage.
create or replace function public.item_files_validate()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_size      bigint;
  v_max_file  bigint;
  v_max_total bigint;
  v_used      bigint;
  v_count     integer;
begin
  select (o.metadata ->> 'size')::bigint into v_size
  from storage.objects o
  where o.bucket_id = 'files' and o.name = new.path;
  if not found then
    raise exception 'Nodoteca: this file is not in storage' using errcode = 'NF004';
  end if;
  new.size := coalesce(v_size, new.size);

  select l.max_file_bytes, l.max_total_bytes into v_max_file, v_max_total
  from public.storage_limits_for(new.owner_id) l;

  if new.size > v_max_file then
    raise exception 'Nodoteca: file too large' using errcode = 'NF001';
  end if;

  select coalesce(sum(f.size), 0) into v_used from public.item_files f where f.owner_id = new.owner_id;
  if v_used + new.size > v_max_total then
    raise exception 'Nodoteca: storage quota exceeded' using errcode = 'NF002';
  end if;

  select count(*) into v_count from public.item_files f where f.item_id = new.item_id;
  if v_count >= 20 then
    raise exception 'Nodoteca: too many files on one item' using errcode = 'NF003';
  end if;

  return new;
end;
$$;

create trigger item_files_validate
  before insert on public.item_files
  for each row execute function public.item_files_validate();

-- Keep items.files_text (searched) in step with the file names.
create or replace function public.item_files_sync_text()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item uuid;
begin
  if tg_op = 'DELETE' then
    v_item := old.item_id;
  else
    v_item := new.item_id;
  end if;
  update public.items i
  set files_text = coalesce(
    (select string_agg(f.name, ' ' order by f.position, f.created_at) from public.item_files f where f.item_id = v_item),
    '')
  where i.id = v_item;
  return null;
end;
$$;

create trigger item_files_sync_text
  after insert or delete or update of name, position on public.item_files
  for each row execute function public.item_files_sync_text();

-- Every item needs a link or at least one file. Checked at the end of the
-- transaction, so an item and its files can be created in either order.
create or replace function public.ensure_item_has_content()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item uuid;
begin
  -- Separate branches: NEW and OLD are rows of different tables here.
  if tg_table_name = 'items' then
    v_item := new.id;
  else
    v_item := old.item_id;
  end if;
  if exists (
    select 1 from public.items i
    where i.id = v_item
      and i.url is null
      and not exists (select 1 from public.item_files f where f.item_id = i.id)
  ) then
    raise exception 'Nodoteca: an item needs a link or at least one file'
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger items_need_content
  after insert or update of url on public.items
  deferrable initially deferred
  for each row execute function public.ensure_item_has_content();

create constraint trigger item_files_keep_content
  after delete on public.item_files
  deferrable initially deferred
  for each row execute function public.ensure_item_has_content();

-- -----------------------------------------------------------------------------
-- Storage: a private bucket. Files are read through short-lived signed URLs.
-- file_size_limit is the hard ceiling for every user (50 MB is also the most
-- the Supabase free plan accepts per upload); per-user limits sit below it.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('files', 'files', false, 52428800, null)
on conflict (id) do nothing;

create policy "files: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "files: insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "files: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "files: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

-- save_item gains p_files; the old signature is dropped so there is no
-- ambiguous overload. Existing callers (web app, extension) keep working.
drop function public.save_item(text, uuid[], text, text, text, text, text, jsonb);

create or replace function public.save_item(
  p_url            text,
  p_collection_ids uuid[] default '{}',
  p_title          text default null,
  p_description    text default null,
  p_note           text default null,
  p_thumbnail_url  text default null,
  p_site_name      text default null,
  p_metadata       jsonb default '{}'::jsonb,
  p_files          jsonb default '[]'::jsonb
)
returns public.items
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item public.items;
begin
  insert into public.items (url, title, description, note, thumbnail_url, site_name, metadata)
  values (nullif(btrim(p_url), ''), p_title, p_description, p_note, p_thumbnail_url, p_site_name, coalesce(p_metadata, '{}'::jsonb))
  returning * into v_item;

  insert into public.item_collections (item_id, collection_id)
  select v_item.id, unnest(coalesce(p_collection_ids, '{}'))
  on conflict do nothing;

  perform public.add_item_files(v_item.id, p_files);

  select * into v_item from public.items where id = v_item.id;
  return v_item;
end;
$$;

-- Record files already uploaded to Storage, after the item's existing ones.
-- p_files: [{ "path", "name", "size", "mime", "sha256", "thumb_path" }, ...]
create or replace function public.add_item_files(p_item_id uuid, p_files jsonb)
returns setof public.item_files
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_next integer;
begin
  select coalesce(max(position) + 1, 0) into v_next from public.item_files where item_id = p_item_id;
  return query
  insert into public.item_files (item_id, path, name, size, mime, sha256, thumb_path, position)
  select p_item_id,
         f ->> 'path',
         btrim(f ->> 'name'),
         coalesce((f ->> 'size')::bigint, 0),
         coalesce(nullif(f ->> 'mime', ''), 'application/octet-stream'),
         nullif(f ->> 'sha256', ''),
         nullif(f ->> 'thumb_path', ''),
         v_next + (t.ord - 1)::integer
  from jsonb_array_elements(coalesce(p_files, '[]'::jsonb)) with ordinality as t(f, ord)
  order by t.ord
  returning *;
end;
$$;

-- Forget a file. Returns the Storage paths the client should delete.
-- Fails (at commit) if it was the last file of an item with no link.
create or replace function public.remove_item_file(p_file_id uuid)
returns text[]
language sql
security invoker
set search_path = ''
as $$
  with gone as (
    delete from public.item_files where id = p_file_id returning path, thumb_path
  )
  select coalesce(array_agg(p) filter (where p is not null), '{}')
  from gone, lateral (values (gone.path), (gone.thumb_path)) as v(p);
$$;

-- Put an item's files in this order (ids not listed keep their place, at the end).
create or replace function public.set_item_file_order(p_item_id uuid, p_file_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.item_files f
  set position = coalesce(array_position(p_file_ids, f.id), 1000 + f.position) - 1
  where f.item_id = p_item_id;
$$;

-- Where has this exact file (same content) already been saved?
create or replace function public.find_saved_file(p_sha256 text)
returns table (item_id uuid, created_at timestamptz, collection_ids uuid[])
language sql
stable
security invoker
set search_path = ''
as $$
  select i.id,
         i.created_at,
         coalesce(array_agg(distinct ic.collection_id) filter (where ic.collection_id is not null), '{}')
  from public.items i
  join public.item_files f on f.item_id = i.id
  left join public.item_collections ic on ic.item_id = i.id
  where i.owner_id = (select auth.uid()) and f.sha256 = p_sha256
  group by i.id, i.created_at
  order by i.created_at desc;
$$;

-- Space used by the signed-in user, and their limits.
create or replace function public.storage_usage()
returns table (used_bytes bigint, max_file_bytes bigint, max_total_bytes bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select (select coalesce(sum(f.size), 0)::bigint from public.item_files f where f.owner_id = (select auth.uid())),
         l.max_file_bytes,
         l.max_total_bytes
  from public.storage_limits_for((select auth.uid())) l;
$$;

revoke execute on function public.storage_limits_for(uuid)          from public, anon;
revoke execute on function public.save_item(text, uuid[], text, text, text, text, text, jsonb, jsonb) from public, anon;
revoke execute on function public.add_item_files(uuid, jsonb)        from public, anon;
revoke execute on function public.remove_item_file(uuid)             from public, anon;
revoke execute on function public.set_item_file_order(uuid, uuid[])  from public, anon;
revoke execute on function public.find_saved_file(text)              from public, anon;
revoke execute on function public.storage_usage()                    from public, anon;
grant  execute on function public.storage_limits_for(uuid)          to authenticated;
grant  execute on function public.save_item(text, uuid[], text, text, text, text, text, jsonb, jsonb) to authenticated;
grant  execute on function public.add_item_files(uuid, jsonb)        to authenticated;
grant  execute on function public.remove_item_file(uuid)             to authenticated;
grant  execute on function public.set_item_file_order(uuid, uuid[])  to authenticated;
grant  execute on function public.find_saved_file(text)              to authenticated;
grant  execute on function public.storage_usage()                    to authenticated;

-- -----------------------------------------------------------------------------
-- Realtime
-- -----------------------------------------------------------------------------

alter publication supabase_realtime add table public.item_files;
