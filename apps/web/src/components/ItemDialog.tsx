import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  MAX_FILES_PER_ITEM,
  fileExtension,
  filesOf,
  formatBytes,
  normalizeUrl,
  stripExtension,
  type CollectionGraph,
  type ItemFile,
  type ItemWithCollections,
  type LinkPreview,
  type SavedMatch,
  type Uuid,
} from "@nodoteca/core";
import { fetchPreview, findSaved, useGraph, useSaveItem, useStorageUsage, useUpdateItem } from "../lib/api.ts";
import { fileErrorReason, findSavedFile, hasDraggedFiles, type FileErrorReason } from "../lib/files.ts";
import { useI18n } from "../lib/i18n.tsx";
import { useOnline } from "../lib/offline.ts";
import { CollectionPicker } from "./CollectionPicker.tsx";
import { Dialog } from "./Dialog.tsx";
import { IconArrowUp, IconClose, IconPaperclip } from "./Icons.tsx";

interface Props {
  /** Edit this item; omit to save a new one. */
  item?: ItemWithCollections;
  /** Pre-filled values for a new item (current collection, shared URL, dropped files…). */
  initial?: { url?: string; title?: string; collectionIds?: Uuid[]; files?: File[] };
  /** Editing: files to attach right away (dropped on the card). */
  addFiles?: File[];
  onClose: () => void;
}

type Mode = "link" | "file";

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** "Already saved in A, B" for a set of earlier saves, or null if there are none. */
function savedInText(matches: SavedMatch[] | undefined, graph: CollectionGraph, t: ReturnType<typeof useI18n>["t"]): string | null {
  if (!matches?.length) return null;
  const names = [...new Set(matches.flatMap((m) => m.collection_ids))]
    .map((id) => graph.byId.get(id)?.name)
    .filter(Boolean)
    .join(", ");
  return names ? t("item.alreadySaved", { collections: names }) : t("item.alreadySavedNowhere");
}

export function ItemDialog({ item, initial, addFiles, onClose }: Props) {
  const { t, locale } = useI18n();
  const { graph } = useGraph();
  const save = useSaveItem();
  const update = useUpdateItem();
  const editing = !!item;
  const hadLink = !!item?.url;
  const online = useOnline();
  const usage = useStorageUsage(online);
  const fmt = (n: number) => formatBytes(n, locale);

  const [mode, setMode] = useState<Mode>(item ? (item.url ? "link" : "file") : initial?.files?.length ? "file" : "link");
  const [url, setUrl] = useState(item?.url ?? initial?.url ?? "");
  const [title, setTitle] = useState(item?.title ?? initial?.title ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const [collectionIds, setCollectionIds] = useState<Uuid[]>(
    item?.item_collections.map((r) => r.collection_id) ?? initial?.collectionIds ?? [],
  );
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [matches, setMatches] = useState<SavedMatch[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Files: the ones the item keeps (in order), and new ones to upload.
  const original = useMemo(() => (item ? filesOf(item) : []), [item]);
  const [kept, setKept] = useState<ItemFile[]>(original);
  const [pending, setPending] = useState<File[]>(() => addFiles ?? initial?.files ?? []);
  const [fileMatches, setFileMatches] = useState<Map<File, SavedMatch[]>>(() => new Map());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const options = useMemo(() => [...graph.byId.values()], [graph]);
  const valid = isHttpUrl(url);
  // A new link, or a link added to an item that only had files.
  const urlEditable = !editing || !hadLink;
  const showUrl = editing || mode === "link";
  const linkAdded = editing && !hadLink && valid;

  // When the URL settles, look for earlier saves and fetch a preview.
  useEffect(() => {
    if (!urlEditable || !valid || !showUrl) {
      setMatches([]);
      setPreview(null);
      return;
    }
    const normalized = normalizeUrl(url);
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoadingPreview(true);
      const [found, p] = await Promise.all([findSaved(normalized).catch(() => []), fetchPreview(normalized)]);
      if (cancelled) return;
      setMatches(found);
      setPreview(p);
      setLoadingPreview(false);
      if (p?.title && !editing) setTitle((current) => current || p.title || "");
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [url, valid, urlEditable, showUrl, editing]);

  // Earlier saves of the same file content ("already saved in A, B").
  useEffect(() => {
    let cancelled = false;
    for (const file of pending) {
      if (fileMatches.has(file)) continue;
      findSavedFile(file)
        .then((found) => !cancelled && setFileMatches((m) => new Map(m).set(file, found)))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [pending, fileMatches]);

  const removed = original.filter((f) => !kept.some((k) => k.id === f.id));
  const remaining = original.filter((f) => !removed.includes(f));
  const orderChanged = kept.some((f, i) => f.id !== remaining[i]?.id);

  // Limits, checked here for a quick answer; the database checks them again.
  const maxFile = usage.data?.max_file_bytes;
  const fileCount = kept.length + pending.length;
  const tooMany = fileCount > MAX_FILES_PER_ITEM;
  const pendingBytes = pending.reduce((n, f) => n + f.size, 0);
  const overQuota = !!usage.data && usage.data.used_bytes + pendingBytes > usage.data.max_total_bytes;
  const tooLarge = (f: File) => maxFile !== undefined && f.size > maxFile;
  const filesOk = !tooMany && !overQuota && !pending.some(tooLarge);

  const hasLink = editing ? hadLink || valid : mode === "link" && valid;
  const hasContent = editing ? hasLink || fileCount > 0 : mode === "link" ? valid : pending.length > 0;
  const fileOnly = editing ? !hadLink : mode === "file";

  function reasonText(reason: FileErrorReason): string {
    switch (reason) {
      case "too-large":
        return t("files.error.too-large", { max: fmt(maxFile ?? 0) });
      case "quota":
        return t("files.error.quota", { used: fmt(usage.data?.used_bytes ?? 0), total: fmt(usage.data?.max_total_bytes ?? 0) });
      case "too-many":
        return t("files.error.too-many", { max: MAX_FILES_PER_ITEM });
      case "failed":
        return t("files.error.failed");
    }
  }

  function addPending(files: File[]) {
    if (files.length) setPending((p) => [...p, ...files]);
  }

  function onDrop(e: DragEvent) {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    setDragOver(false);
    addPending([...e.dataTransfer.files]);
  }

  async function submit() {
    setError(null);
    const onProgress = (done: number, total: number) => setProgress({ done, total });
    try {
      if (editing) {
        if (!hasContent) return setError(t("item.needsContent"));
        await update.mutateAsync({
          id: item.id,
          title: title.trim() || null,
          note: note.trim() || null,
          collectionIds,
          link: linkAdded ? { url: normalizeUrl(url), preview } : undefined,
          files: pending,
          removeFileIds: removed.map((f) => f.id),
          fileOrder: orderChanged ? kept.map((f) => f.id) : undefined,
          onProgress,
        });
      } else if (mode === "link") {
        if (!valid) return setError(t("item.invalidUrl"));
        await save.mutateAsync({
          p_url: normalizeUrl(url),
          p_collection_ids: collectionIds,
          p_title: title.trim() || preview?.title || null,
          p_note: note.trim() || null,
          p_description: preview?.description ?? null,
          p_thumbnail_url: preview?.thumbnail_url ?? null,
          p_site_name: preview?.site_name ?? null,
          p_metadata: preview?.metadata ?? {},
          files: pending,
          onProgress,
        });
      } else {
        if (!pending.length) return setError(t("item.needsContent"));
        await save.mutateAsync({
          p_url: null,
          p_collection_ids: collectionIds,
          p_title: title.trim() || stripExtension(pending[0]!.name),
          p_note: note.trim() || null,
          files: pending,
          onProgress,
        });
      }
      onClose();
    } catch (err) {
      const reason = fileErrorReason(err);
      setError(reason !== "failed" ? reasonText(reason) : pending.length ? reasonText("failed") : t("common.error"));
    } finally {
      setProgress(null);
    }
  }

  const busy = save.isPending || update.isPending;
  const thumb = mode === "link" ? (hadLink ? item?.thumbnail_url : preview?.thumbnail_url) : null;
  const savedIn = savedInText(matches, graph, t);
  const dialogTitle = editing ? (hadLink ? t("item.edit") : t("item.editFile")) : mode === "link" ? t("item.add") : t("item.addFile");

  const urlField = (
    <>
      <label className="field">
        <span>{editing && !hadLink ? t("item.linkOptional") : t("item.url")}</span>
        <input
          type="url"
          inputMode="url"
          required={!editing}
          autoFocus={!editing}
          readOnly={!urlEditable}
          value={url}
          placeholder={t("item.urlPlaceholder")}
          onChange={(e) => setUrl(e.target.value)}
        />
        {url && !valid && <small className="error">{t("item.invalidUrl")}</small>}
      </label>
      {loadingPreview && <p className="muted small">{t("item.loadingPreview")}</p>}
      {savedIn && <p className="warning">{savedIn}</p>}
    </>
  );

  const filesField = (
    <div
      className={`field files ${dragOver ? "is-drag" : ""}`}
      onDragOver={(e) => {
        if (!hasDraggedFiles(e) || !online) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
      }}
      onDrop={onDrop}
    >
      <span>{fileOnly ? t("files.files") : t("files.attachments")}</span>
      {fileCount > 0 && (
        <ul className="files__list">
          {kept.map((f, i) => (
            <li key={f.id} className="files__row">
              <span className="files__ext">{fileExtension(f.name) || "·"}</span>
              <span className="files__name" title={f.name}>{f.name}</span>
              <span className="files__size">{fmt(f.size)}</span>
              {i > 0 && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t("files.moveUp")}
                  title={t("files.moveUp")}
                  onClick={() => setKept((k) => [...k.slice(0, i - 1), k[i]!, k[i - 1]!, ...k.slice(i + 1)])}
                >
                  <IconArrowUp s={15} />
                </button>
              )}
              <button
                type="button"
                className="icon-btn icon-btn--danger"
                aria-label={t("files.remove")}
                title={t("files.remove")}
                onClick={() => setKept((k) => k.filter((x) => x.id !== f.id))}
              >
                <IconClose s={15} />
              </button>
            </li>
          ))}
          {pending.map((f, i) => {
            const dup = savedInText(fileMatches.get(f), graph, t);
            return (
              <li key={`${i}:${f.name}:${f.size}`} className="files__row is-new">
                <span className="files__ext">{fileExtension(f.name) || "·"}</span>
                <span className="files__name" title={f.name}>{f.name}</span>
                <span className="files__badge">{t("files.new")}</span>
                <span className="files__size">{fmt(f.size)}</span>
                <button
                  type="button"
                  className="icon-btn icon-btn--danger"
                  aria-label={t("files.remove")}
                  title={t("files.remove")}
                  onClick={() => setPending((p) => p.filter((_, j) => j !== i))}
                >
                  <IconClose s={15} />
                </button>
                {tooLarge(f) ? (
                  <small className="error files__note">{reasonText("too-large")}</small>
                ) : (
                  dup && <small className="files__note files__note--warn">{dup}</small>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="files__add">
        <button type="button" className="btn btn--ghost" disabled={!online || busy} onClick={() => fileInput.current?.click()}>
          <IconPaperclip s={15} /> {t("files.add")}
        </button>
        <small className="muted">
          {dragOver ? t("files.dropHere") : t(fileOnly ? "files.fileHint" : "files.attachHint", { max: fmt(maxFile ?? 50 * 1024 * 1024) })}
        </small>
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          addPending([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {tooMany && <small className="error">{reasonText("too-many")}</small>}
      {overQuota && <small className="error">{reasonText("quota")}</small>}
      {progress && (
        <div className="files__progress" role="status">
          <progress value={progress.done} max={progress.total || 1} />
          <small className="muted">{t("files.uploading", { done: fmt(progress.done), total: fmt(progress.total) })}</small>
        </div>
      )}
    </div>
  );

  return (
    <Dialog
      title={dialogTitle}
      onClose={onClose}
      onSubmit={() => void submit()}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button className="btn btn--primary" disabled={!online || busy || !hasContent || !filesOk}>
            {matches.length && !editing && mode === "link" ? t("item.saveAnyway") : t("common.save")}
          </button>
        </>
      }
    >
      {!editing && (
        <div className="segmented item-mode" role="group" aria-label={dialogTitle}>
          <button type="button" className={mode === "link" ? "is-active" : ""} aria-pressed={mode === "link"} onClick={() => setMode("link")}>
            {t("item.modeLink")}
          </button>
          <button type="button" className={mode === "file" ? "is-active" : ""} aria-pressed={mode === "file"} onClick={() => setMode("file")}>
            {t("item.modeFile")}
          </button>
        </div>
      )}

      {/* An item made of files shows them first; a link shows its address first. */}
      {fileOnly ? filesField : urlField}
      {thumb && <img className="dialog__thumb" src={thumb} alt="" referrerPolicy="no-referrer" />}

      <label className="field">
        <span>{t("item.title")}</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={(mode === "file" && !editing && pending[0] ? stripExtension(pending[0].name) : preview?.title) ?? ""}
        />
      </label>

      <CollectionPicker label={t("collection.addTo")} options={options} value={collectionIds} onChange={setCollectionIds} />

      <label className="field">
        <span>{t("item.note")}</span>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      {fileOnly ? editing && urlField : filesField}

      {error && <p className="error">{error}</p>}
    </Dialog>
  );
}
