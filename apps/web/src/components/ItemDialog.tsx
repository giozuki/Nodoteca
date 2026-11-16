import { useEffect, useMemo, useState } from "react";
import { normalizeUrl, type ItemWithCollections, type LinkPreview, type SavedMatch, type Uuid } from "@nodoteca/core";
import { fetchPreview, findSaved, useGraph, useSaveItem, useUpdateItem } from "../lib/api.ts";
import { useI18n } from "../lib/i18n.tsx";
import { useOnline } from "../lib/offline.ts";
import { CollectionPicker } from "./CollectionPicker.tsx";
import { Dialog } from "./Dialog.tsx";

interface Props {
  /** Edit this item; omit to save a new one. */
  item?: ItemWithCollections;
  /** Pre-filled values for a new item (current collection, shared URL…). */
  initial?: { url?: string; title?: string; collectionIds?: Uuid[] };
  onClose: () => void;
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function ItemDialog({ item, initial, onClose }: Props) {
  const { t } = useI18n();
  const { graph } = useGraph();
  const save = useSaveItem();
  const update = useUpdateItem();
  const editing = !!item;
  const online = useOnline();

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

  const options = useMemo(() => [...graph.byId.values()], [graph]);
  const valid = isHttpUrl(url);

  // New item: when the URL settles, look for earlier saves and fetch a preview.
  useEffect(() => {
    if (editing || !valid) {
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
      if (p?.title) setTitle((current) => current || p.title || "");
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [url, valid, editing]);

  const savedIn = [...new Set(matches.flatMap((m) => m.collection_ids))]
    .map((id) => graph.byId.get(id)?.name)
    .filter(Boolean)
    .join(", ");

  async function submit() {
    setError(null);
    try {
      if (editing) {
        await update.mutateAsync({ id: item.id, title: title.trim() || null, note: note.trim() || null, collectionIds });
      } else {
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
        });
      }
      onClose();
    } catch {
      setError(t("common.error"));
    }
  }

  const busy = save.isPending || update.isPending;
  const thumb = editing ? item.thumbnail_url : preview?.thumbnail_url;

  return (
    <Dialog
      title={editing ? t("item.edit") : t("item.add")}
      onClose={onClose}
      onSubmit={() => void submit()}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button className="btn btn--primary" disabled={!online || busy || (!editing && !valid)}>
            {matches.length && !editing ? t("item.saveAnyway") : t("common.save")}
          </button>
        </>
      }
    >
      <label className="field">
        <span>{t("item.url")}</span>
        <input
          type="url"
          inputMode="url"
          required
          autoFocus={!editing}
          readOnly={editing}
          value={url}
          placeholder={t("item.urlPlaceholder")}
          onChange={(e) => setUrl(e.target.value)}
        />
        {url && !valid && <small className="error">{t("item.invalidUrl")}</small>}
      </label>

      {loadingPreview && <p className="muted small">{t("item.loadingPreview")}</p>}
      {matches.length > 0 && (
        <p className="warning">{savedIn ? t("item.alreadySaved", { collections: savedIn }) : t("item.alreadySavedNowhere")}</p>
      )}
      {thumb && <img className="dialog__thumb" src={thumb} alt="" referrerPolicy="no-referrer" />}

      <label className="field">
        <span>{t("item.title")}</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={preview?.title ?? ""} />
      </label>

      <CollectionPicker label={t("collection.addTo")} options={options} value={collectionIds} onChange={setCollectionIds} />

      <label className="field">
        <span>{t("item.note")}</span>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      {error && <p className="error">{error}</p>}
    </Dialog>
  );
}
