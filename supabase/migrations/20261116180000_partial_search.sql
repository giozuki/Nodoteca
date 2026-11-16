-- =============================================================================
-- Nodoteca: partial-match search
--
-- Full-text search only matched whole words ("Anthropic" yes, "Anthr" no).
-- Replace it with substring matching: every word typed must appear somewhere
-- in the title, note, site, URL or description, in any order, any case.
-- A trigram index keeps it fast.
-- =============================================================================

alter table public.items drop column search;          -- also drops items_search_idx
drop index if exists public.items_title_trgm_idx;

alter table public.items add column search_text text generated always as (
  coalesce(title, '') || ' ' ||
  coalesce(note, '') || ' ' ||
  coalesce(site_name, '') || ' ' ||
  url || ' ' ||
  coalesce(description, '')
) stored;

create index items_search_text_trgm_idx
  on public.items using gin (search_text extensions.gin_trgm_ops);

-- Every word must match (AND). Matches in the title come first, then newest.
create or replace function public.search_items(p_query text)
returns setof public.items
language sql
stable
security invoker
set search_path = ''
as $$
  with terms as (
    select array_agg(
             '%' || replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') || '%'
           ) as patterns
    from regexp_split_to_table(btrim(coalesce(p_query, '')), '\s+') as t
    where t <> ''
  )
  select i.*
  from public.items i, terms
  where terms.patterns is not null
    and i.search_text ilike all (terms.patterns)
  order by (coalesce(i.title, '') ilike all (terms.patterns)) desc, i.created_at desc;
$$;

revoke execute on function public.search_items from public, anon;
grant  execute on function public.search_items to authenticated;
