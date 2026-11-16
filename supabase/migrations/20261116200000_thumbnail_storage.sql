-- =============================================================================
-- Nodoteca: permanent thumbnails
--
-- Some sites (Instagram, Facebook, TikTok) serve preview images from signed
-- URLs that expire after a few weeks. The link-preview function keeps a copy
-- of those in this bucket, under <user id>/<hash>.<ext>.
--
-- The bucket is public for reading (an <img> must load without headers);
-- paths contain the user id and a hash of the source URL, and nobody can list
-- the bucket. Writes go through the caller's JWT: each user may only write
-- inside their own folder.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'thumbnails',
  'thumbnails',
  true,
  2097152, -- 2 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do nothing;

create policy "thumbnails: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "thumbnails: insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "thumbnails: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "thumbnails: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = (select auth.uid())::text);
