import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { descendants, type ItemWithCollections, type Uuid } from "@nodoteca/core";
import { useGraph, useItems, type ItemScope } from "../lib/api.ts";
import { useI18n } from "../lib/i18n.tsx";
import { useOnline } from "../lib/offline.ts";
import { CollectionDialog } from "./CollectionDialog.tsx";
import { ItemCard } from "./ItemCard.tsx";
import { ItemDialog } from "./ItemDialog.tsx";
import { IconEdit, IconPlus } from "./Icons.tsx";
import { CollectionIcon } from "./CollectionIcon.tsx";
import { NodeGraph } from "./NodeGraph.tsx";

const INCLUDE_SUB_KEY = "nodoteca.includeSub";

export type View = "all" | "unfiled" | "collection" | "search";

/** The main pane: a list of items for the current view. */
export function Library({ view, onAdd }: { view: View; onAdd: (collectionIds: Uuid[]) => void }) {
  const { t } = useI18n();
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { graph } = useGraph();
  const [editing, setEditing] = useState<ItemWithCollections | null>(null);
  const [editingCollection, setEditingCollection] = useState(false);
  const [includeSub, setIncludeSub] = useState(() => {
    try {
      return localStorage.getItem(INCLUDE_SUB_KEY) !== "0";
    } catch {
      return true;
    }
  });

  const query = params.get("q")?.trim() ?? "";
  const collection = id ? graph.byId.get(id) : undefined;
  const hasChildren = !!id && (graph.children.get(id)?.length ?? 0) > 0;

  const scope = useMemo<ItemScope>(() => {
    if (view === "collection" && id) {
      const ids = includeSub ? [id, ...descendants(graph, id)] : [id];
      return { kind: "collection", ids: ids.sort() };
    }
    if (view === "search") return { kind: "search", query };
    return { kind: view === "unfiled" ? "unfiled" : "all" };
  }, [view, id, includeSub, graph, query]);

  const items = useItems(scope);
  const online = useOnline();

  const title =
    view === "collection" ? (collection?.name ?? "") : view === "search" ? t("search.results", { query }) : view === "unfiled" ? t("nav.unfiled") : t("nav.all");

  const empty =
    view === "search" ? t("search.noResults", { query }) : view === "all" ? t("library.empty") : t("collection.empty");

  const parents = id ? (graph.parents.get(id) ?? []).map((p) => graph.byId.get(p)).filter((c) => !!c) : [];

  return (
    <section className="library">
      <header className="library__header">
        <div>
          <p className="eyebrow breadcrumbs">
            {parents.length > 0 ? (
              <>
                {parents.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && " · "}
                    <Link to={`/c/${p.id}`}>{p.name}</Link>
                  </span>
                ))}
                {" /"}
              </>
            ) : (
              t("app.name")
            )}
          </p>
          <h1 className="library__title">
            {collection && <CollectionIcon collection={collection} size="lg" />}
            {title}
            {items.data && <span className="count count--title">{String(items.data.length).padStart(2, "0")}</span>}
          </h1>
        </div>
        <div className="library__tools">
          {hasChildren && (
            <label className="toggle">
              <input
                type="checkbox"
                checked={includeSub}
                onChange={(e) => {
                  setIncludeSub(e.target.checked);
                  try {
                    localStorage.setItem(INCLUDE_SUB_KEY, e.target.checked ? "1" : "0");
                  } catch {
                    /* not persisted */
                  }
                }}
              />
              {t("collection.includeSub")}
            </label>
          )}
          {collection && online && (
            <button className="btn btn--ghost" onClick={() => setEditingCollection(true)}>
              <IconEdit s={15} /> {t("collection.edit")}
            </button>
          )}
        </div>
      </header>

      {items.isLoading && (
        <div className="grid skeleton-grid" aria-busy="true" aria-label={t("common.loading")}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="card" style={{ "--i": i } as React.CSSProperties}>
              <div className="card__thumb skeleton" />
              <div className="card__body">
                <div className="skeleton" style={{ height: 10, width: "40%" }} />
                <div className="skeleton" style={{ height: 14, width: "90%" }} />
                <div className="skeleton" style={{ height: 14, width: "65%" }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {items.error && <p className="error">{t("common.error")}</p>}

      {items.data?.length === 0 && (
        <div className="empty">
          {view !== "search" && <NodeGraph className="empty__art" pulses={false} />}
          <p>{empty}</p>
          {view !== "search" && online && (
            <button className="btn btn--primary" onClick={() => onAdd(id ? [id] : [])}>
              <IconPlus s={16} /> {t("item.add")}
            </button>
          )}
        </div>
      )}

      <div className="grid">
        {items.data?.map((item, i) => (
          <ItemCard key={item.id} item={item} graph={graph} index={i} onEdit={() => setEditing(item)} />
        ))}
      </div>

      {editing && <ItemDialog item={editing} onClose={() => setEditing(null)} />}
      {editingCollection && collection && (
        <CollectionDialog collection={collection} onClose={() => setEditingCollection(false)} onDeleted={() => navigate("/")} />
      )}
    </section>
  );
}
