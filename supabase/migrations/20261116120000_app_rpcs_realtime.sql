-- =============================================================================
-- Nodoteca: RPCs used by the web app, and realtime sync
-- =============================================================================

-- Replace the whole set of collections an item is filed in, atomically.
create or replace function public.set_item_collections(p_item_id uuid, p_collection_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.item_collections
  where item_id = p_item_id
    and collection_id <> all (coalesce(p_collection_ids, '{}'));

  insert into public.item_collections (item_id, collection_id)
  select p_item_id, unnest(coalesce(p_collection_ids, '{}'))
  on conflict do nothing;
end;
$$;

-- Replace the whole set of parents of a collection, atomically.
-- The cycle trigger on collection_edges still applies to every new edge.
create or replace function public.set_collection_parents(p_collection_id uuid, p_parent_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.collection_edges
  where child_id = p_collection_id
    and parent_id <> all (coalesce(p_parent_ids, '{}'));

  insert into public.collection_edges (parent_id, child_id)
  select unnest(coalesce(p_parent_ids, '{}')), p_collection_id
  on conflict do nothing;
end;
$$;

-- Number of items directly inside each collection (for the sidebar).
create or replace function public.collection_counts()
returns table (collection_id uuid, item_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select ic.collection_id, count(*)
  from public.item_collections ic
  where ic.owner_id = (select auth.uid())
  group by ic.collection_id;
$$;

revoke execute on function public.set_item_collections   from public, anon;
revoke execute on function public.set_collection_parents from public, anon;
revoke execute on function public.collection_counts      from public, anon;
grant  execute on function public.set_item_collections   to authenticated;
grant  execute on function public.set_collection_parents to authenticated;
grant  execute on function public.collection_counts      to authenticated;

-- -----------------------------------------------------------------------------
-- Realtime: push changes to every open device. RLS still applies, so each
-- user only receives events about their own rows.
-- -----------------------------------------------------------------------------

alter publication supabase_realtime
  add table public.items, public.collections, public.item_collections, public.collection_edges;
