/**
 * Domain types. They mirror `supabase/migrations/*_init.sql`.
 * Once a Supabase project is linked, `npm run db:types` also generates
 * `database.types.ts` straight from the database.
 */

export type Uuid = string;
/** ISO-8601 timestamp, as returned by PostgREST. */
export type Timestamp = string;

/** A named node. One collection = one name per user, however many parents it has. */
export interface Collection {
  id: Uuid;
  owner_id: Uuid;
  name: string;
  description: string | null;
  icon: string | null;
  /** `#rrggbb` */
  color: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/** A parent -> child arrow in the collection graph (a DAG, never a cycle). */
export interface CollectionEdge {
  parent_id: Uuid;
  child_id: Uuid;
  owner_id: Uuid;
  created_at: Timestamp;
}

/**
 * A saved link, file(s), or both. The same URL may appear in several items.
 * An item with no URL has at least one file (the database enforces it).
 */
export interface Item {
  id: Uuid;
  owner_id: Uuid;
  url: string | null;
  title: string | null;
  description: string | null;
  note: string | null;
  thumbnail_url: string | null;
  site_name: string | null;
  metadata: ItemMetadata;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/** Free-form extras. Known keys are typed; anything else is allowed. */
export interface ItemMetadata {
  /** e.g. "youtube", "article", "image" */
  kind?: string;
  author?: string;
  /** Seconds, for audio and video. */
  duration?: number;
  [key: string]: unknown;
}

/** Membership of an item in a collection. */
export interface ItemCollection {
  item_id: Uuid;
  collection_id: Uuid;
  owner_id: Uuid;
  added_at: Timestamp;
}

/** A file stored with an item, in the private "files" bucket. */
export interface ItemFile {
  id: Uuid;
  item_id: Uuid;
  owner_id: Uuid;
  /** Object name in the "files" bucket: <user id>/<folder>/<file name> */
  path: string;
  /** The original file name, as shown to the user. */
  name: string;
  /** Bytes, as measured by Storage. */
  size: number;
  mime: string;
  /** Hex SHA-256 of the content, for "already saved" hints. */
  sha256: string | null;
  /** A small preview (images only), also in the "files" bucket. */
  thumb_path: string | null;
  position: number;
  created_at: Timestamp;
}

/** A file already uploaded to Storage, to record with `save_item` / `add_item_files`. */
export interface NewItemFile {
  path: string;
  name: string;
  size: number;
  mime: string;
  sha256?: string | null;
  thumb_path?: string | null;
}

/** Arguments of the `save_item` RPC. */
export interface SaveItemInput {
  /** null for an item made only of files. */
  p_url: string | null;
  p_collection_ids?: Uuid[];
  p_title?: string | null;
  p_description?: string | null;
  p_note?: string | null;
  p_thumbnail_url?: string | null;
  p_site_name?: string | null;
  p_metadata?: ItemMetadata;
  p_files?: NewItemFile[];
}

/** One row of the `find_saved` and `find_saved_file` RPCs. */
export interface SavedMatch {
  item_id: Uuid;
  created_at: Timestamp;
  collection_ids: Uuid[];
}

/** What the `link-preview` Edge Function returns. Every field but `url` is optional. */
export interface LinkPreview {
  url: string;
  title?: string | null;
  description?: string | null;
  thumbnail_url?: string | null;
  site_name?: string | null;
  metadata?: ItemMetadata;
}

/** An item together with the ids of the collections it is filed in, and its files. */
export interface ItemWithCollections extends Item {
  item_collections: { collection_id: Uuid }[];
  /** Missing in offline copies saved before files existed: read it through `filesOf`. */
  item_files?: ItemFile[];
}

/** Space used by the signed-in user, and their limits (the `storage_usage` RPC). */
export interface StorageUsage {
  used_bytes: number;
  max_file_bytes: number;
  max_total_bytes: number;
}
