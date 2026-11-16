import { useState } from "react";
import { NavLink } from "react-router";
import type { CollectionGraph, Uuid } from "@nodoteca/core";
import { useCounts, useGraph } from "../lib/api.ts";
import { colorFor } from "../lib/colors.ts";
import { useI18n } from "../lib/i18n.tsx";

const EXPANDED_KEY = "nodoteca.expanded";
const MAX_DEPTH = 32;

function loadExpanded(): Set<Uuid> {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "[]") as Uuid[]);
  } catch {
    return new Set();
  }
}

interface Props {
  onNewCollection: () => void;
  onNavigate: () => void;
}

export function Sidebar({ onNewCollection, onNavigate }: Props) {
  const { t } = useI18n();
  const { graph, isLoading } = useGraph();
  const counts = useCounts().data;
  const [expanded, setExpanded] = useState(loadExpanded);

  function toggle(id: Uuid) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
      } catch {
        /* not persisted */
      }
      return next;
    });
  }

  const linkClass = ({ isActive }: { isActive: boolean }) => `nav-link ${isActive ? "is-active" : ""}`;

  return (
    <nav className="sidebar__nav" aria-label={t("nav.collections")}>
      <NavLink to="/" end className={linkClass} onClick={onNavigate}>
        <span className="nav-icon" aria-hidden="true">◎</span>
        {t("nav.all")}
      </NavLink>
      <NavLink to="/unfiled" className={linkClass} onClick={onNavigate}>
        <span className="nav-icon" aria-hidden="true">○</span>
        {t("nav.unfiled")}
      </NavLink>

      <div className="sidebar__heading">
        <span>{t("nav.collections")}</span>
        <button className="icon-btn" onClick={onNewCollection} aria-label={t("collection.new")} title={t("collection.new")}>
          +
        </button>
      </div>

      {!isLoading && graph.roots.length === 0 && <p className="muted small sidebar__empty">{t("collection.none")}</p>}

      <ul className="tree" role="tree">
        {graph.roots.map((id) => (
          <TreeNode
            key={id}
            id={id}
            depth={0}
            graph={graph}
            counts={counts}
            expanded={expanded}
            onToggle={toggle}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </nav>
  );
}

interface NodeProps {
  id: Uuid;
  depth: number;
  graph: CollectionGraph;
  counts: Map<Uuid, number> | undefined;
  expanded: Set<Uuid>;
  onToggle: (id: Uuid) => void;
  onNavigate: () => void;
}

/** A collection with several parents appears under each of them: same node, same links. */
function TreeNode({ id, depth, graph, counts, expanded, onToggle, onNavigate }: NodeProps) {
  const { t } = useI18n();
  const c = graph.byId.get(id);
  if (!c || depth > MAX_DEPTH) return null;
  const children = graph.children.get(id) ?? [];
  const parents = graph.parents.get(id) ?? [];
  const isOpen = expanded.has(id);
  const parentNames = parents.map((p) => graph.byId.get(p)?.name).filter(Boolean).join(", ");

  return (
    <li role="treeitem" aria-expanded={children.length ? isOpen : undefined}>
      <div className="tree__row" style={{ "--depth": depth } as React.CSSProperties}>
        {children.length > 0 ? (
          <button className={`tree__toggle ${isOpen ? "is-open" : ""}`} onClick={() => onToggle(id)} aria-label={c.name}>
            ▸
          </button>
        ) : (
          <span className="tree__toggle" />
        )}
        <NavLink
          to={`/c/${id}`}
          className={({ isActive }) => `nav-link ${isActive ? "is-active" : ""}`}
          onClick={onNavigate}
          title={parents.length > 1 ? t("collection.alsoIn", { names: parentNames }) : undefined}
        >
          <span className="dot" style={{ background: colorFor(c.name, c.color) }} />
          <span className="nav-link__label">{c.name}</span>
          {parents.length > 1 && (
            <span className="multi-parent" aria-hidden="true">
              ⑂
            </span>
          )}
          <span className="count">{counts?.get(id) ?? ""}</span>
        </NavLink>
      </div>
      {isOpen && children.length > 0 && (
        <ul role="group">
          {children.map((child) => (
            <TreeNode
              key={child}
              id={child}
              depth={depth + 1}
              graph={graph}
              counts={counts}
              expanded={expanded}
              onToggle={onToggle}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
