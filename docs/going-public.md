# If Nodoteca ever opens to the public

Nodoteca is a personal project today, and opening it to other people is
**not decided**. This page keeps track of what we learned while building it:
the things that are fine for one person but would need work before many people
use the same instance. Nothing here is urgent while it stays personal.

## Before opening

- [ ] **Incremental offline sync.**
  The offline copy (`apps/web/src/lib/offline.ts`) downloads the *whole*
  library on start, after every change and on reconnect. For one library of a
  few thousand links that's a few MB each time; with many users, egress grows
  with *users × library size × activity*. Fetch only rows changed since the
  last sync (`updated_at`), and handle deletions (e.g. a tombstone table or a
  periodic full refresh).

- [ ] **Clean up orphaned thumbnails.**
  `link-preview` copies images from CDNs with expiring URLs (Instagram,
  Facebook, TikTok) into the `thumbnails` Storage bucket. Deleting a link
  leaves its file behind. Remove files when the last item using them is
  deleted (trigger + Edge Function, or a periodic sweep).

- [ ] **Enforce the file quota at upload time.**
  The quota is checked when a file is *recorded* (`item_files_validate()`),
  not when it is uploaded: someone calling the Storage API directly could fill
  their folder without recording anything. Fine for one person; with strangers,
  upload through an Edge Function (or a signed upload URL issued after a quota
  check) and sweep objects that no row points to.

- [ ] **Clean up orphaned files.**
  A save that fails half-way, or a deleted account, can leave objects in the
  `files` bucket that no row points to (deleting a user removes their rows by
  cascade, not their Storage objects). Add a periodic sweep, and delete the
  user's folder when the account is deleted.

- [ ] **Hosting other people's files.**
  Storing uploads means handling illegal content, copyright notices
  (DMCA-style takedowns) and data-protection requests (GDPR: export and
  erasure of files too). Needs a reporting channel, terms of use and a way to
  remove a file on request before anyone else can upload.

- [ ] **Storage plans.**
  Limits already live in `storage_limits` (per user, read-only for users), so
  paid tiers are rows, not code. Above 50 MB per file the bucket's
  `file_size_limit` and the Supabase plan (Pro) must change too. Watch egress:
  every view of a video downloads it again.

- [ ] **Send auth emails from our own domain.**
  Sign-in emails currently go through a personal Gmail account (custom SMTP):
  fine for one person (~500 emails/day), not for strangers, and Supabase warns
  that deliverability may suffer. Use a transactional provider (Resend, Brevo…)
  with a verified domain, and review the auth rate limits.

- [ ] **Supabase Pro.**
  The Free plan pauses a project after 7 days without traffic and has no
  automatic backups. Pro ($25/month at the time of writing) removes the pause,
  adds daily backups and includes 8 GB of database, 250 GB of egress and 100k
  monthly active users, with pay-as-you-go beyond that.

- [ ] **Right-size the database compute.**
  Disk is cheap (~$0.125/GB/month over the included 8 GB); the cost that grows
  with many *simultaneous* users is the compute size. Watch query latency and
  CPU, and size up when needed.

## Worth considering

- [ ] **Lighter search index.**
  The trigram index behind partial-match search is larger than the data itself
  (about 7 MB of indexes for 3 MB of rows with ~3,000 links). Options: leave
  `description` out of `search_text`, or index fewer fields.

- [ ] **Hosting.**
  GitHub Pages works but serves every unknown path as a 404 page (the app
  still loads). A host with proper SPA rewrites and a custom domain
  (Cloudflare Pages, Netlify…) would be cleaner.

- [ ] **Publish the browser extension** on the Chrome Web Store (it's loaded
  unpacked today). It only asks for `activeTab` and `storage`, which keeps the
  review simple; the `externally_connectable` origins in its manifest must
  match wherever the web app is hosted.

- [ ] **Privacy policy and terms**, since the app stores people's links and
  email addresses.

## Rough capacity

Measured on a real library: about **3.6 KB per link**, indexes included.
8 GB of database therefore holds roughly 11,000 light users (200 links),
4,400 average users (500 links) or 730 heavy users (3,000 links). Beyond that,
storage is billed per GB, so space is not the limiting factor.

*Figures from Supabase's public pricing and third-party summaries as of
November 2026; check [supabase.com/pricing](https://supabase.com/pricing)
before relying on them.*
