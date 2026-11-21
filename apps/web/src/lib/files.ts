import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FILES_BUCKET,
  fileKind,
  opensInline,
  sanitizeFileName,
  thumbFile,
  type ItemFile,
  type ItemWithCollections,
  type NewItemFile,
  type SavedMatch,
} from "@nodoteca/core";
import { errorCode, must, supabase, SUPABASE_KEY, SUPABASE_URL } from "./supabase.ts";

/**
 * Files live in the private "files" bucket under <user id>/<random folder>/.
 * They are uploaded first, then recorded with save_item / add_item_files,
 * which check that they exist and fit the user's limits.
 */

export type Progress = (loaded: number, total: number) => void;

/** Why an upload or a save with files was refused, for a friendly message. */
export type FileErrorReason = "too-large" | "quota" | "too-many" | "failed";

export class FileError extends Error {
  constructor(readonly reason: FileErrorReason) {
    super(reason);
  }
}

/** Maps database and Storage errors to a reason (see item_files_validate()). */
export function fileErrorReason(err: unknown): FileErrorReason {
  if (err instanceof FileError) return err.reason;
  switch (errorCode(err)) {
    case "NF001":
      return "too-large";
    case "NF002":
      return "quota";
    case "NF003":
      return "too-many";
  }
  return "failed";
}

// --- Hashing -----------------------------------------------------------------

const hashes = new WeakMap<Blob, Promise<string>>();

/** Hex SHA-256 of a file, computed once per File object. */
export function sha256Hex(file: Blob): Promise<string> {
  let hash = hashes.get(file);
  if (!hash) {
    hash = file
      .arrayBuffer()
      .then((buf) => crypto.subtle.digest("SHA-256", buf))
      .then((digest) => [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join(""));
    hashes.set(file, hash);
  }
  return hash;
}

/** Earlier saves of the same content. */
export async function findSavedFile(file: File): Promise<SavedMatch[]> {
  const sha = await sha256Hex(file);
  return must(await supabase.rpc("find_saved_file", { p_sha256: sha })) as SavedMatch[];
}

// --- Upload ------------------------------------------------------------------

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

/**
 * Uploads one object with XMLHttpRequest: supabase-js has no upload progress.
 * Same endpoint and headers supabase-js uses; RLS applies through the JWT.
 */
async function uploadObject(path: string, body: Blob, contentType: string, onProgress?: (loaded: number) => void): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new FileError("failed");
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/${FILES_BUCKET}/${encodePath(path)}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", SUPABASE_KEY);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.upload.onprogress = (e) => onProgress?.(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      // Storage answers 413 (or 400 with "exceeded the maximum allowed size") when the bucket limit is hit.
      const tooLarge = xhr.status === 413 || /maximum allowed size|payload too large/i.test(xhr.responseText);
      reject(new FileError(tooLarge ? "too-large" : "failed"));
    };
    xhr.onerror = () => reject(new FileError("failed"));
    xhr.send(body);
  });
}

const THUMB_SIDE = 640;

/** Draws a picture (or a video frame) at preview size and encodes it. */
function toPreview(source: CanvasImageSource, width: number, height: number): Promise<Blob | null> {
  const scale = Math.min(1, THUMB_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
}

/** A frame about a second in (or a tenth of the way, for short clips), or null if the browser can't play it. */
function videoFrame(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const src = URL.createObjectURL(file);
    let settled = false;
    const done = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(src);
      video.removeAttribute("src");
      video.load();
      resolve(blob);
    };
    const timer = setTimeout(() => done(null), 10_000);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onerror = () => done(null);
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, (video.duration || 0) / 10);
    };
    video.onseeked = () => {
      if (!video.videoWidth) return done(null);
      toPreview(video, video.videoWidth, video.videoHeight).then(done, () => done(null));
    };
    video.src = src;
  });
}

/** A small preview of an image or a video, or null if the browser can't decode it (e.g. HEIC, some HEVC videos). */
export async function makeThumbnail(file: File): Promise<Blob | null> {
  const kind = fileKind(file.type);
  try {
    if (kind === "video") return await videoFrame(file);
    if (kind !== "image" || file.type === "image/svg+xml") return null;
    const bitmap = await createImageBitmap(file);
    const blob = await toPreview(bitmap, bitmap.width, bitmap.height);
    bitmap.close();
    return blob;
  } catch {
    return null;
  }
}

/** Removes objects from the bucket. Best effort: a leftover only costs space. */
export async function removeObjects(paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(FILES_BUCKET).remove([...paths]);
  if (error) console.warn("Could not remove files from storage", error);
}

/**
 * Uploads files (and image previews) and returns what save_item / add_item_files
 * need to record them. If one fails, the ones already uploaded are removed.
 */
export async function uploadFiles(files: readonly File[], onProgress?: Progress): Promise<NewItemFile[]> {
  if (files.length === 0) return [];
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new FileError("failed");

  const total = files.reduce((n, f) => n + f.size, 0);
  let done = 0;
  const uploaded: string[] = [];
  const result: NewItemFile[] = [];
  try {
    for (const file of files) {
      const folder = `${uid}/${crypto.randomUUID()}`;
      const path = `${folder}/${sanitizeFileName(file.name)}`;
      const mime = file.type || "application/octet-stream";
      const [sha256, thumb] = await Promise.all([sha256Hex(file), makeThumbnail(file)]);
      await uploadObject(path, file, mime, (loaded) => onProgress?.(done + loaded, total));
      uploaded.push(path);
      done += file.size;
      onProgress?.(done, total);

      let thumb_path: string | null = null;
      if (thumb) {
        const candidate = `${folder}/thumb.${thumb.type === "image/webp" ? "webp" : "png"}`;
        try {
          await uploadObject(candidate, thumb, thumb.type);
          uploaded.push(candidate);
          thumb_path = candidate;
        } catch {
          /* no preview: the card shows a placeholder */
        }
      }
      result.push({ path, name: file.name, size: file.size, mime, sha256, thumb_path });
    }
  } catch (err) {
    await removeObjects(uploaded);
    throw err;
  }
  return result;
}

/** Every Storage path that belongs to these files (file and preview). */
export function storagePaths(files: readonly ItemFile[]): string[] {
  return files.flatMap((f) => (f.thumb_path ? [f.path, f.thumb_path] : [f.path]));
}

/** Whether a drag carries files (not text or a link). */
export function hasDraggedFiles(e: { dataTransfer: DataTransfer | null }): boolean {
  return !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
}

// --- Opening -----------------------------------------------------------------

/** How long a link to a file stays valid: long enough to watch a film, short for a download. */
function expiresIn(f: ItemFile, inline: boolean): number {
  if (!inline) return 60;
  return fileKind(f.mime) === "video" ? 4 * 3600 : 3600;
}

/**
 * Opens a file in a new tab (images, PDFs, videos) or downloads it (anything
 * else, SVG included, or any file with `download`). Call it straight from a
 * click: the tab is opened before the signed URL arrives, or popup blockers
 * would stop it.
 */
export async function openFile(f: ItemFile, { download = false } = {}): Promise<void> {
  const inline = !download && opensInline(f.mime);
  const tab = inline ? window.open("", "_blank") : null;
  try {
    const { data, error } = await supabase.storage
      .from(FILES_BUCKET)
      .createSignedUrl(f.path, expiresIn(f, inline), inline ? undefined : { download: f.name });
    if (error || !data) throw error ?? new Error("no-url");
    if (tab) {
      tab.opener = null;
      tab.location.href = data.signedUrl;
    } else if (inline) {
      window.location.assign(data.signedUrl); // the tab was blocked: open it here instead
    } else {
      const a = Object.assign(document.createElement("a"), { href: data.signedUrl, rel: "noopener" });
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  } catch (err) {
    tab?.close();
    throw err;
  }
}

/**
 * Signed URLs for the previews of these items' files, in one request. Path -> URL.
 * Also for links with a picture of their own: the file's preview stands in if
 * that picture fails to load.
 */
export function useFileThumbs(items: readonly ItemWithCollections[] | undefined, enabled: boolean): Map<string, string> {
  const paths = useMemo(
    () => [...new Set((items ?? []).map((i) => thumbFile(i)?.thumb_path).filter((p): p is string => !!p))].sort(),
    [items],
  );
  const query = useQuery({
    queryKey: ["file-thumbs", paths],
    enabled: enabled && paths.length > 0,
    staleTime: 45 * 60 * 1000, // the URLs last an hour
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(FILES_BUCKET).createSignedUrls(paths, 3600);
      if (error) throw error;
      const urls = new Map<string, string>();
      for (const d of data) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
      return urls;
    },
  });
  return query.data ?? EMPTY;
}

const EMPTY = new Map<string, string>();
