-- =============================================================================
-- Nodoteca: initial schema
--
--   items             every saved link (URLs are NOT unique: duplicates allowed)
--   collections       named nodes ("Rock", "Artist Y", "Anime Z", ...)
--   item_collections  many-to-many: one item can live in any number of collections
--   collection_edges  many-to-many: one collection can have any number of parents
--                     (a directed acyclic graph, not a tree)
--
-- Every row carries owner_id and Row Level Security makes sure a user can only
-- ever see or touch their own rows.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Collections
-- -----------------------------------------------------------------------------

create table public.collections (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (char_length(description) <= 2000),
  icon        text check (char_length(icon) <= 32),
  color       text check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- A name identifies a node: "Rock" is ONE collection, even if it is reachable
-- from several parents. That is what makes the graph useful.
create unique index collections_owner_name_key
  on public.collections (owner_id, lower(btrim(name)));

create trigger collections_set_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Collection graph (parent -> child)
-- -----------------------------------------------------------------------------

create table public.collection_edges (
  parent_id  uuid not null references public.collections (id) on delete cascade,
  child_id   uuid not null references public.collections (id) on delete cascade,
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (parent_id, child_id),
  check (parent_id <> child_id)
);

create index collection_edges_child_idx on public.collection_edges (child_id);

-- Reject any edge that would create a cycle (A -> B -> ... -> A).
create or replace function public.prevent_collection_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    with recursive descendants(id) as (
      select new.child_id
      union
      select e.child_id
      from public.collection_edges e
      join descendants d on e.parent_id = d.id
    )
    select 1 from descendants where id = new.parent_id
  ) then
    raise exception 'Nodoteca: this link would create a cycle between collections'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger collection_edges_prevent_cycle
  before insert or update on public.collection_edges
  for each row execute function public.prevent_collection_cycle();

-- -----------------------------------------------------------------------------
-- Items
-- -----------------------------------------------------------------------------

create table public.items (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  url           text not null check (char_length(url) between 1 and 8192),
  title         text check (char_length(title) <= 1000),
  description   text check (char_length(description) <= 5000),
  note          text check (char_length(note) <= 20000),
  thumbnail_url text check (char_length(thumbnail_url) <= 8192),
  site_name     text check (char_length(site_name) <= 200),
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  search        tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(note, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(site_name, '') || ' ' || url), 'D')
  ) stored
);

-- Not unique on purpose: the same URL may be saved more than once.
-- This index only makes "already saved?" lookups fast.
create index items_owner_url_idx     on public.items (owner_id, url);
create index items_owner_created_idx on public.items (owner_id, created_at desc);
create index items_search_idx        on public.items using gin (search);
create index items_title_trgm_idx    on public.items using gin (title extensions.gin_trgm_ops);

create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Item <-> collection membership
-- -----------------------------------------------------------------------------

create table public.item_collections (
  item_id       uuid not null references public.items (id) on delete cascade,
  collection_id uuid not null references public.collections (id) on delete cascade,
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  added_at      timestamptz not null default now(),
  primary key (item_id, collection_id)
);

create index item_collections_collection_idx
  on public.item_collections (collection_id, added_at desc);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.collections      enable row level security;
alter table public.collection_edges enable row level security;
alter table public.items            enable row level security;
alter table public.item_collections enable row level security;

-- Plain owner tables
create policy "own collections" on public.collections
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "own items" on public.items
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Join tables: both ends must belong to the same user too, so nobody can
-- attach their rows to someone else's collection by guessing an id.
create policy "own collection edges" on public.collection_edges
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.collections c where c.id = parent_id and c.owner_id = (select auth.uid()))
    and exists (select 1 from public.collections c where c.id = child_id  and c.owner_id = (select auth.uid()))
  );

create policy "own item collections" on public.item_collections
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.items i       where i.id = item_id       and i.owner_id = (select auth.uid()))
    and exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = (select auth.uid()))
  );

-- -----------------------------------------------------------------------------
-- Grants
--
-- The project does not auto-expose new tables, so access is granted here,
-- explicitly: signed-in users only (RLS then narrows it to their own rows).
-- `anon` (not signed in) gets nothing.
-- -----------------------------------------------------------------------------

revoke all on public.collections, public.collection_edges, public.items, public.item_collections
  from anon, authenticated;

grant select, insert, update, delete
  on public.collections, public.collection_edges, public.items, public.item_collections
  to authenticated;

-- -----------------------------------------------------------------------------
-- Convenience: save an item into several collections in one call
-- -----------------------------------------------------------------------------

create or replace function public.save_item(
  p_url            text,
  p_collection_ids uuid[] default '{}',
  p_title          text default null,
  p_description    text default null,
  p_note           text default null,
  p_thumbnail_url  text default null,
  p_site_name      text default null,
  p_metadata       jsonb default '{}'::jsonb
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
  values (p_url, p_title, p_description, p_note, p_thumbnail_url, p_site_name, coalesce(p_metadata, '{}'::jsonb))
  returning * into v_item;

  insert into public.item_collections (item_id, collection_id)
  select v_item.id, unnest(coalesce(p_collection_ids, '{}'))
  on conflict do nothing;

  return v_item;
end;
$$;

-- Where has this URL already been saved? (powers the "already saved in A, B" hint)
create or replace function public.find_saved(p_url text)
returns table (item_id uuid, created_at timestamptz, collection_ids uuid[])
language sql
stable
security invoker
set search_path = ''
as $$
  select i.id,
         i.created_at,
         coalesce(array_agg(ic.collection_id) filter (where ic.collection_id is not null), '{}')
  from public.items i
  left join public.item_collections ic on ic.item_id = i.id
  where i.owner_id = (select auth.uid()) and i.url = p_url
  group by i.id, i.created_at
  order by i.created_at desc;
$$;

revoke execute on function public.save_item  from public, anon;
revoke execute on function public.find_saved from public, anon;
grant  execute on function public.save_item  to authenticated;
grant  execute on function public.find_saved to authenticated;
