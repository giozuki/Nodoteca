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

/** A saved link. The same URL may appear in several items. */
export interface Item {
  id: Uuid;
  owner_id: Uuid;
  url: string;
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

/** Arguments of the `save_item` RPC. */
export interface SaveItemInput {
  p_url: string;
  p_collection_ids?: Uuid[];
  p_title?: string | null;
  p_description?: string | null;
  p_note?: string | null;
  p_thumbnail_url?: string | null;
  p_site_name?: string | null;
  p_metadata?: ItemMetadata;
}

/** One row of the `find_saved` RPC. */
export interface SavedMatch {
  item_id: Uuid;
  created_at: Timestamp;
  collection_ids: Uuid[];
}
