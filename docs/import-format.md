# Nodoteca import format

A plain JSON file you can write by hand, with a script, or with an LLM, and
import with **⚙ → Import links**. Collections are referred to **by name**:
no ids, no folder paths.

```json
{
  "format": "nodoteca-import",
  "version": 1,
  "collections": [
    { "name": "Music", "icon": "🎵" },
    { "name": "Genre X", "parents": ["Music"] },
    { "name": "Movies", "icon": "🎬", "color": "#FF7A59" },
    { "name": "Soundtracks" },
    { "name": "Movie Z", "parents": ["Movies", "Soundtracks"], "description": "Edits and scenes" }
  ],
  "links": [
    {
      "url": "https://www.youtube.com/watch?v=abc123",
      "title": "Final scene with the original song",
      "note": "The best edit so far",
      "collections": ["Genre X", "Artist Y", "Movie Z"],
      "created_at": "2026-02-16T15:31:54Z"
    },
    { "url": "https://example.com/article" }
  ]
}
```

A machine-readable version of these rules is in
[`nodoteca-import.schema.json`](nodoteca-import.schema.json) (JSON Schema).

## Top level

| Field | Required | Notes |
|---|---|---|
| `format` | yes | Always `"nodoteca-import"`. |
| `version` | no | `1`. Omit it or set it to `1`. |
| `collections` | no | List of collections, see below. |
| `links` | yes | List of links, see below. Can be empty. |

## Collections

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Up to 120 characters. Names are **case-insensitive**: `"Rock"` and `"rock"` are the same collection. |
| `parents` | no | Names of the collections this one sits inside. **As many as you want**: a collection can live in several places at once. |
| `icon` | no | One emoji, e.g. `"🎬"`. Shown in place of the collection's initial. |
| `color` | no | `#rrggbb`, e.g. `"#3DD6B5"`. |
| `description` | no | Up to 2000 characters. |

Declaring a collection is optional: any name used in a link's `collections`
or in `parents` is created automatically (the import preview lists them, in
case of a typo). Declare a collection when you want to give it parents, an
emoji, a color or a description, or to create it even if no link uses it yet.

## Links

| Field | Required | Notes |
|---|---|---|
| `url` | yes | Must start with `http://` or `https://`. |
| `title` | no | If missing, the URL is shown. |
| `note` | no | Your own note. |
| `description` | no | A summary or excerpt. |
| `thumbnail_url` | no | Image URL for the card. |
| `created_at` | no | When you saved it, ISO 8601 (`2026-02-16` or `2026-02-16T15:31:54Z`). Defaults to the import time. Lists are ordered by this date. |
| `collections` | no | Names of the collections the link goes into. **As many as you want.** |

The same URL can appear more than once. In the preview you can choose to skip
links you already have in Nodoteca (after normalizing them, so `youtu.be/x`
and `youtube.com/watch?v=x` count as the same).

## What happens with mistakes

The import never fails halfway because of one bad entry. The preview shows
what it found before anything is written:

| Problem | What Nodoteca does |
|---|---|
| Not valid JSON, wrong `format`, unknown `version`, `links` not a list | Refuses the file and says why. |
| A link without `url`, or with a non-web `url` | Skips that link. |
| A date it can't read | Uses the import time. |
| A collection used but not declared | Creates it. |
| A collection listed twice | Merges the two. |
| A collection inside itself, or parents that form a loop (A in B, B in A) | Skips the parent that would close the loop. |
| A color that isn't `#rrggbb` | Ignores the color. |
| An `icon` that isn't exactly one emoji | Ignores the icon. |

Existing collections with the same name are reused, never duplicated.

## Other files the importer understands

- **Raindrop.io** CSV export
- **Browser bookmarks** (`bookmarks.html` from Chrome, Firefox, Edge, Safari)
- **Nodoteca backups** made with *Export → Complete backup (JSON)*
