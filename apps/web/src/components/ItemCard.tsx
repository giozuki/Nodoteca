import { Link } from "react-router";
import type { CollectionGraph, ItemWithCollections } from "@nodoteca/core";
import { useDeleteItem } from "../lib/api.ts";
import { colorFor } from "../lib/colors.ts";
import { useI18n } from "../lib/i18n.tsx";

interface Props {
  item: ItemWithCollections;
  graph: CollectionGraph;
  onEdit: () => void;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function ItemCard({ item, graph, onEdit }: Props) {
  const { t, locale } = useI18n();
  const remove = useDeleteItem();
  const site = item.site_name || hostOf(item.url);
  const date = new Date(item.created_at).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  const collections = item.item_collections
    .map((r) => graph.byId.get(r.collection_id))
    .filter((c) => !!c)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <article className="card">
      <a className="card__thumb" href={item.url} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true">
        {item.thumbnail_url ? (
          <img src={item.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <span className="card__placeholder">{site.slice(0, 1).toUpperCase()}</span>
        )}
      </a>
      <div className="card__body">
        <a className="card__title" href={item.url} target="_blank" rel="noopener noreferrer">
          {item.title || item.url || t("item.untitled")}
        </a>
        <p className="card__meta">
          {site} · <time dateTime={item.created_at}>{date}</time>
        </p>
        {item.note && <p className="card__note">{item.note}</p>}
        {collections.length > 0 && (
          <ul className="card__chips">
            {collections.map((c) => (
              <li key={c.id}>
                <Link to={`/c/${c.id}`} className="chip chip--link" style={{ "--chip": colorFor(c.name, c.color) } as React.CSSProperties}>
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="card__actions">
        <button className="icon-btn" onClick={onEdit} aria-label={t("item.edit")} title={t("item.edit")}>
          ✎
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
          🗑
        </button>
      </div>
    </article>
  );
}
