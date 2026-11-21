import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  attachmentsOf,
  fileExtension,
  filesOf,
  formatBytes,
  primaryFile,
  thumbFile,
  type CollectionGraph,
  type ItemFile,
  type ItemWithCollections,
} from "@nodoteca/core";
import { useDeleteItem, useRefreshPreview } from "../lib/api.ts";
import { COLLECTION_COLORS, colorFor } from "../lib/colors.ts";
import { hasDraggedFiles, openFile } from "../lib/files.ts";
import { useI18n } from "../lib/i18n.tsx";
import { useOnline } from "../lib/offline.ts";
import { CollectionIcon } from "./CollectionIcon.tsx";
import { IconEdit, IconPaperclip, IconRefresh, IconTrash } from "./Icons.tsx";

interface Props {
  item: ItemWithCollections;
  graph: CollectionGraph;
  /** Signed URLs of file previews, by Storage path (see useFileThumbs). */
  thumbs: Map<string, string>;
  onEdit: () => void;
  /** Files dropped on the card, to attach to this item. */
  onDropFiles?: (files: File[]) => void;
  /** Position in the list: staggers the entrance of the first few cards. */
  index?: number;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Below this width/height ratio (the frame is 1.6) a picture would lose too much to cropping. */
const FIT_BELOW_RATIO = 1.25;

/** A stable tint for a card without a picture: its first collection's colour, else one from the host. */
function tintFor(host: string, first: string | undefined): string {
  if (first) return first;
  let h = 0;
  for (const ch of host) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return COLLECTION_COLORS[h % COLLECTION_COLORS.length]!;
}

export function ItemCard({ item, graph, thumbs, onEdit, onDropFiles, index = 0 }: Props) {
  const { t, locale } = useI18n();
  const remove = useDeleteItem();
  const refresh = useRefreshPreview();
  const online = useOnline();
  const [dropping, setDropping] = useState(false);

  // A link's own picture, else the preview of one of its files (private, signed URL).
  const fileThumb = thumbFile(item)?.thumb_path;
  const thumbSrc = item.thumbnail_url ?? (fileThumb ? thumbs.get(fileThumb) : undefined) ?? null;

  // Images that failed while offline get another chance once the connection is back.
  useEffect(() => {
    if (online) setBrokenThumb(null);
  }, [online]);
  const [brokenThumb, setBrokenThumb] = useState<string | null>(null);
  const showThumb = !!thumbSrc && brokenThumb !== thumbSrc;
  // Portrait or square pictures are shown whole, over a blurred copy of themselves.
  const [tallThumb, setTallThumb] = useState<string | null>(null);
  const fitThumb = showThumb && tallThumb === thumbSrc;
  const measureThumb = (img: HTMLImageElement) => {
    const { naturalWidth: w, naturalHeight: h } = img;
    if (h > 0) setTallThumb(w / h < FIT_BELOW_RATIO ? thumbSrc : null);
  };

  const primary = primaryFile(item);
  const attachments = attachmentsOf(item);
  const fileCount = filesOf(item).length;
  const host = item.url ? hostOf(item.url) : null;
  const kindLabel = primary ? fileExtension(primary.name) || t("files.file") : "";
  const site = item.url ? item.site_name || host! : primary ? `${kindLabel} · ${formatBytes(primary.size, locale)}` : "";
  const date = new Date(item.created_at).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  const collections = item.item_collections
    .map((r) => graph.byId.get(r.collection_id))
    .filter((c) => !!c)
    .sort((a, b) => a.name.localeCompare(b.name));
  const tint = tintFor(host ?? primary?.name ?? "", collections[0] && colorFor(collections[0].name, collections[0].color));
  const label = item.title || item.url || primary?.name || t("item.untitled");

  const open = (f: ItemFile) => {
    if (!online) return alert(t("files.offline"));
    openFile(f).catch(() => alert(t("files.openFailed")));
  };

  const thumbInner: ReactNode = showThumb ? (
    <>
      {fitThumb && <img className="card__thumb-backdrop" src={thumbSrc!} alt="" referrerPolicy="no-referrer" />}
      <img
        className={fitThumb ? "card__thumb-fit" : undefined}
        src={thumbSrc!}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        // Measured on load, and right away when the picture is already there (cache, remount).
        ref={(img) => {
          if (img?.complete) measureThumb(img);
        }}
        onLoad={(e) => measureThumb(e.currentTarget)}
        onError={() => setBrokenThumb(thumbSrc)}
      />
    </>
  ) : (
    <span className="card__placeholder" style={{ "--tint": tint } as React.CSSProperties}>
      {item.url ? (
        <span className="card__placeholder-letter">{site.slice(0, 1).toUpperCase()}</span>
      ) : (
        <span className="card__placeholder-letter card__placeholder-letter--ext">{kindLabel.slice(0, 4)}</span>
      )}
      <span className="card__placeholder-host">{host ?? primary?.name}</span>
    </span>
  );

  return (
    <article
      className="card"
      style={{ "--i": Math.min(index, 12) } as React.CSSProperties}
      onDragOver={(e) => {
        if (!onDropFiles || !online || !hasDraggedFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(e) => {
        if (!onDropFiles || !hasDraggedFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setDropping(false);
        const files = [...e.dataTransfer.files];
        if (files.length) onDropFiles(files);
      }}
    >
      {item.url ? (
        <a className="card__thumb" href={item.url} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true">
          {thumbInner}
        </a>
      ) : (
        <button type="button" className="card__thumb" tabIndex={-1} aria-hidden="true" onClick={() => primary && open(primary)}>
          {thumbInner}
        </button>
      )}
      <div className="card__body">
        <p className="card__meta">
          <span className="card__site">{site}</span>
          <time dateTime={item.created_at}>{date}</time>
        </p>
        {item.url ? (
          <a className="card__title" href={item.url} target="_blank" rel="noopener noreferrer">
            {label}
          </a>
        ) : (
          <button type="button" className="card__title" onClick={() => primary && open(primary)}>
            <span>{label}</span>
          </button>
        )}
        {item.note && <p className="card__note">{item.note}</p>}
        {attachments.length > 0 && (
          <ul className="card__chips card__files">
            {attachments.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  className="chip chip--link chip--file"
                  title={`${f.name} · ${formatBytes(f.size, locale)}`}
                  onClick={() => open(f)}
                >
                  <IconPaperclip s={13} />
                  <span className="chip__label">{f.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {collections.length > 0 && (
          <ul className="card__chips">
            {collections.map((c) => (
              <li key={c.id}>
                <Link to={`/c/${c.id}`} className="chip chip--link" style={{ "--chip": colorFor(c.name, c.color) } as React.CSSProperties}>
                  <CollectionIcon collection={c} size="sm" />
                  <span className="chip__label">{c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {online && (
          <div className="card__actions">
            {item.url && (
              <button
                className={`icon-btn ${refresh.isPending ? "is-spinning" : ""}`}
                aria-label={t("item.refreshPreview")}
                title={t("item.refreshPreview")}
                disabled={refresh.isPending}
                onClick={() =>
                  refresh.mutate(item, {
                    onSuccess: () => setBrokenThumb(null),
                    onError: () => alert(t("item.previewFailed")),
                  })
                }
              >
                <IconRefresh s={16} />
              </button>
            )}
            <button className="icon-btn" onClick={onEdit} aria-label={t("item.edit")} title={t("item.edit")}>
              <IconEdit s={16} />
            </button>
            <button
              className="icon-btn icon-btn--danger"
              aria-label={t("item.delete")}
              title={t("item.delete")}
              disabled={remove.isPending}
              onClick={() => {
                if (confirm(fileCount > 0 ? t("item.deleteConfirmFiles") : t("item.deleteConfirm"))) remove.mutate(item);
              }}
            >
              <IconTrash s={16} />
            </button>
          </div>
        )}
      </div>
      {dropping && <div className="card__drop">{t("files.dropToAttach")}</div>}
    </article>
  );
}
