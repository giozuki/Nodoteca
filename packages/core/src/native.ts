import type { ImportEntry } from "./import.ts";
import { normalizeIcon } from "./icon.ts";

/**
 * The native import format: plain JSON, collections referred to by name,
 * no ids. Easy to write by hand, with a script, or with an LLM.
 * Spec: docs/import-format.md
 */
export const NATIVE_FORMAT = "nodoteca-import";

export interface NativeImportFile {
  format: typeof NATIVE_FORMAT;
  version?: 1;
  collections?: { name: string; parents?: string[]; color?: string; icon?: string; description?: string }[];
  links: {
    url: string;
    title?: string;
    note?: string;
    description?: string;
    thumbnail_url?: string;
    created_at?: string;
    collections?: string[];
  }[];
}

/** Something odd in the file that doesn't stop the import. */
export type ImportWarning =
  | { code: "link-skipped"; index: number; reason: "not-an-object" | "missing-url" | "invalid-url" }
  | { code: "bad-date"; index: number; value: string }
  | { code: "undeclared-collection"; name: string }
  | { code: "cycle-removed"; parent: string; child: string }
  | { code: "self-parent"; name: string }
  | { code: "bad-color"; name: string; value: string }
  | { code: "bad-icon"; name: string; value: string }
  | { code: "duplicate-collection"; name: string };

/** A problem that makes the file unusable. */
export type ImportFormatErrorCode = "invalid-json" | "unknown-format" | "unsupported-version" | "links-not-array" | "collections-not-array";

export class ImportFormatError extends Error {
  readonly code: ImportFormatErrorCode;
  readonly detail?: string;
  constructor(code: ImportFormatErrorCode, detail?: string) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

export interface CollectionDetails {
  color?: string;
  /** A single emoji. */
  icon?: string;
  description?: string;
}

export interface NativeParsed {
  entries: ImportEntry[];
  /** [parent name, child name]; [x, x] only makes sure x exists */
  edges: [string, string][];
  details: Map<string, CollectionDetails>;
  warnings: ImportWarning[];
}

const key = (s: string) => s.trim().toLocaleLowerCase();
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const names = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter((s): s is string => !!s) : []);

export function parseNativeJson(data: unknown): NativeParsed {
  const file = data as Partial<NativeImportFile> & Record<string, unknown>;
  if (file?.format !== NATIVE_FORMAT) throw new ImportFormatError("unknown-format");
  if (file.version !== undefined && file.version !== 1) throw new ImportFormatError("unsupported-version", String(file.version));
  if (!Array.isArray(file.links)) throw new ImportFormatError("links-not-array");
  if (file.collections !== undefined && !Array.isArray(file.collections)) throw new ImportFormatError("collections-not-array");

  const warnings: ImportWarning[] = [];
  const details = new Map<string, CollectionDetails>();
  const declared = new Map<string, string>(); // key -> spelling
  const parentsOf = new Map<string, string[]>(); // child key -> parent names

  for (const raw of file.collections ?? []) {
    const name = str((raw as { name?: unknown })?.name);
    if (!name) continue;
    const k = key(name);
    if (declared.has(k)) warnings.push({ code: "duplicate-collection", name });
    declared.set(k, declared.get(k) ?? name);
    const c = raw as { parents?: unknown; color?: unknown; icon?: unknown; description?: unknown };
    const d: CollectionDetails = {};
    const color = str(c.color);
    if (color && /^#[0-9a-f]{6}$/i.test(color)) d.color = color;
    else if (color) warnings.push({ code: "bad-color", name, value: color });
    const rawIcon = str(c.icon);
    const icon = normalizeIcon(rawIcon);
    if (icon) d.icon = icon;
    else if (rawIcon) warnings.push({ code: "bad-icon", name, value: rawIcon });
    const description = str(c.description);
    if (description) d.description = description.slice(0, 2000);
    details.set(k, { ...details.get(k), ...d });
    for (const p of names(c.parents)) {
      if (key(p) === k) warnings.push({ code: "self-parent", name });
      else parentsOf.set(k, [...(parentsOf.get(k) ?? []), p]);
    }
  }

  // Links
  const entries: ImportEntry[] = [];
  const mentioned = new Map<string, string>();
  file.links.forEach((raw, index) => {
    if (typeof raw !== "object" || raw === null) return void warnings.push({ code: "link-skipped", index, reason: "not-an-object" });
    const l = raw as Record<string, unknown>;
    const url = str(l.url);
    if (!url) return void warnings.push({ code: "link-skipped", index, reason: "missing-url" });
    if (!/^https?:\/\/\S+$/i.test(url)) return void warnings.push({ code: "link-skipped", index, reason: "invalid-url" });
    let created_at: string | null = null;
    const date = str(l.created_at);
    if (date) {
      const d = new Date(date);
      if (Number.isNaN(d.getTime())) warnings.push({ code: "bad-date", index, value: date });
      else created_at = d.toISOString();
    }
    const cols = names(l.collections);
    for (const c of cols) if (!mentioned.has(key(c))) mentioned.set(key(c), c);
    const thumb = str(l.thumbnail_url);
    entries.push({
      url,
      title: str(l.title),
      note: str(l.note),
      description: str(l.description),
      thumbnail_url: thumb && /^https?:\/\//i.test(thumb) ? thumb : null,
      created_at,
      folders: [],
      tags: [],
      collections: cols,
      source: "nodoteca",
      metadata: { imported_from: "nodoteca-import" },
    });
  });

  // Parents and link collections that were never declared get created, with a warning.
  for (const parentList of parentsOf.values()) for (const p of parentList) if (!mentioned.has(key(p))) mentioned.set(key(p), p);
  for (const [k, name] of mentioned) {
    if (!declared.has(k)) {
      warnings.push({ code: "undeclared-collection", name });
      declared.set(k, name);
    }
  }

  // Edges, dropping any that would close a cycle (first come, first kept).
  const children = new Map<string, Set<string>>();
  const reaches = (from: string, to: string): boolean => {
    const stack = [from];
    const seen = new Set<string>();
    while (stack.length) {
      const n = stack.pop()!;
      if (n === to) return true;
      if (seen.has(n)) continue;
      seen.add(n);
      stack.push(...(children.get(n) ?? []));
    }
    return false;
  };
  const edges: [string, string][] = [];
  for (const [childKey, parents] of parentsOf) {
    const child = declared.get(childKey)!;
    for (const parent of parents) {
      const pk = key(parent);
      if (reaches(childKey, pk)) {
        warnings.push({ code: "cycle-removed", parent: declared.get(pk) ?? parent, child });
        continue;
      }
      (children.get(pk) ?? children.set(pk, new Set()).get(pk)!).add(childKey);
      edges.push([declared.get(pk) ?? parent, child]);
    }
  }
  // Declared collections without links or parents still get created.
  for (const name of declared.values()) edges.push([name, name]);

  return { entries, edges, details, warnings };
}
