import type { ItemFile, ItemWithCollections } from "./types.ts";

/** Same cap as the item_files_validate() trigger. */
export const MAX_FILES_PER_ITEM = 20;

/** Name of the private Storage bucket that holds the files. */
export const FILES_BUCKET = "files";

export type FileKind = "image" | "pdf" | "video" | "audio" | "text" | "archive" | "document" | "other";

const ARCHIVE = /^application\/(zip|x-zip-compressed|x-7z-compressed|x-rar-compressed|vnd\.rar|x-tar|gzip|x-gzip)$/;
const DOCUMENT = /(msword|wordprocessingml|ms-excel|spreadsheetml|ms-powerpoint|presentationml|opendocument|rtf|epub)/;

/** A rough family for a file, from its MIME type (and its extension when the type is missing). */
export function fileKind(mime: string, name = ""): FileKind {
  const m = mime.toLowerCase();
  const ext = fileExtension(name).toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (ARCHIVE.test(m)) return "archive";
  if (DOCUMENT.test(m)) return "document";
  if (m.startsWith("text/") || m === "application/json") return "text";
  return "other";
}

/**
 * Whether the browser should show the file in a tab rather than download it:
 * images, PDFs and videos. SVGs are images that can carry scripts, so they
 * are always downloaded.
 */
export function opensInline(mime: string): boolean {
  const m = mime.toLowerCase();
  if (m === "image/svg+xml") return false;
  return m.startsWith("image/") || m === "application/pdf" || m.startsWith("video/");
}

/** "dir/file.txt" -> "file.txt" (either kind of slash). */
export function baseName(name: string): string {
  return name.slice(Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\")) + 1);
}

/** "Report.Final.PDF" -> "PDF"; "" when there is none. */
export function fileExtension(name: string): string {
  const base = baseName(name);
  const dot = base.lastIndexOf(".");
  return dot > 0 && dot < base.length - 1 ? base.slice(dot + 1).toUpperCase() : "";
}

/** "report.final.pdf" -> "report.final" (a default title). */
export function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * A safe Storage object name for a file: ASCII letters, digits, dot, dash and
 * underscore only (accents are folded, everything else becomes "-"), at most
 * 120 characters, extension kept. The original name is stored separately.
 */
export function sanitizeFileName(name: string): string {
  const folded = baseName(name).normalize("NFKD").replace(/\p{M}/gu, ""); // drop combining marks: "à" -> "a"
  const ext = fileExtension(folded).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  const base = (ext ? stripExtension(folded) : folded)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 100);
  return `${base || "file"}${ext ? "." + ext : ""}`;
}

/** 1536 -> "1.5 KB", in the given locale. */
export function formatBytes(bytes: number, locale = "en"): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toLocaleString(locale, { maximumFractionDigits: digits })} ${units[unit]}`;
}

/** The item's files in their order (works with offline copies that predate files). */
export function filesOf(item: Pick<ItemWithCollections, "item_files">): ItemFile[] {
  return [...(item.item_files ?? [])].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
}

/** The file a card opens: the first one, for an item with no link. */
export function primaryFile(item: Pick<ItemWithCollections, "url" | "item_files">): ItemFile | null {
  return item.url ? null : (filesOf(item)[0] ?? null);
}

/** Files shown as attachments: all of them for a link, all but the first otherwise. */
export function attachmentsOf(item: Pick<ItemWithCollections, "url" | "item_files">): ItemFile[] {
  const files = filesOf(item);
  return item.url ? files : files.slice(1);
}

/** The first file with a preview picture, for cards that have no thumbnail of their own. */
export function thumbFile(item: Pick<ItemWithCollections, "item_files">): ItemFile | null {
  return filesOf(item).find((f) => !!f.thumb_path) ?? null;
}
