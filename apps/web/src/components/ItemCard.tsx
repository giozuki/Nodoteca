import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { CollectionGraph, ItemWithCollections } from "@nodoteca/core";
import { useDeleteItem, useRefreshPreview } from "../lib/api.ts";
import { COLLECTION_COLORS, colorFor } from "../lib/colors.ts";
import { useI18n } from "../lib/i18n.tsx";
import { useOnline } from "../lib/offline.ts";
import { CollectionIcon } from "./CollectionIcon.tsx";
import { IconEdit, IconRefresh, IconTrash } from "./Icons.tsx";

interface Props {
  item: ItemWithCollections;
  graph: CollectionGraph;
  onEdit: () => void;
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

export function ItemCard({ item, graph, onEdit, index = 0 }: Props) {
  const { t, locale } = useI18n();
  const remove = useDeleteItem();
  const refresh = useRefreshPreview();
  const online = useOnline();
  // Images that failed while offline get another chance once the connection is back.
  useEffect(() => {
    if (online) setBrokenThumb(null);
  }, [online]);
  const [brokenThumb, setBrokenThumb] = useState<string | null>(null);
  const showThumb = !!item.thumbnail_url && brokenThumb !== item.thumbnail_url;
  // Portrait or square pictures are shown whole, over a blurred copy of themselves.
  const [tallThumb, setTallThumb] = useState<string | null>(null);
  const fitThumb = showThumb && tallThumb === item.thumbnail_url;
  const measureThumb = (img: HTMLImageElement) => {
    const { naturalWidth: w, naturalHeight: h } = img;
    if (h > 0) setTallThumb(w / h < FIT_BELOW_RATIO ? item.thumbnail_url : null);
  };
  const host = hostOf(item.url);
  const site = item.site_name || host;
  const date = new Date(item.created_at).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  const collections = item.item_collections
    .map((r) => graph.byId.get(r.collection_id))
    .filter((c) => !!c)
    .sort((a, b) => a.name.localeCompare(b.name));
  const tint = tintFor(host, collections[0] && colorFor(collections[0].name, collections[0].color));

  return (
    <article className="card" style={{ "--i": Math.min(index, 12) } as React.CSSProperties}>
      <a className="card__thumb" href={item.url} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true">
        {showThumb ? (
          <>
            {fitThumb && <img className="card__thumb-backdrop" src={item.thumbnail_url!} alt="" referrerPolicy="no-referrer" />}
            <img
              className={fitThumb ? "card__thumb-fit" : undefined}
              src={item.thumbnail_url!}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              // Measured on load, and right away when the picture is already there (cache, remount).
              ref={(img) => {
                if (img?.complete) measureThumb(img);
              }}
              onLoad={(e) => measureThumb(e.currentTarget)}
              onError={() => setBrokenThumb(item.thumbnail_url)}
            />
          </>
        ) : (
          <span className="card__placeholder" style={{ "--tint": tint } as React.CSSProperties}>
            <span className="card__placeholder-letter">{site.slice(0, 1).toUpperCase()}</span>
            <span className="card__placeholder-host">{host}</span>
          </span>
        )}
      </a>
      <div className="card__body">
        <p className="card__meta">
          <span className="card__site">{site}</span>
          <time dateTime={item.created_at}>{date}</time>
        </p>
        <a className="card__title" href={item.url} target="_blank" rel="noopener noreferrer">
          {item.title || item.url || t("item.untitled")}
        </a>
        {item.note && <p className="card__note">{item.note}</p>}
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
            <button className="icon-btn" onClick={onEdit} aria-label={t("item.edit")} title={t("item.edit")}>
              <IconEdit s={16} />
            </button>
            <button
              className="icon-btn icon-btn--danger"
              aria-label={t("item.delete")}
              title={t("item.delete")}
              disabled={remove.isPending}
              onClick={() => {
                if (confirm(t("item.deleteConfirm"))) remove.mutate(item.id);
              }}
            >
              <IconTrash s={16} />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
