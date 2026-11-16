import { useState } from "react";
import { useI18n } from "../lib/i18n.tsx";

/** Desktop only: drag the sidebar's right edge to resize it. The width is saved per browser. */

const STORAGE_KEY = "nodoteca.sidebarWidth";
export const SIDEBAR_DEFAULT = 272;
export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 480;
const STEP = 16;

const clamp = (w: number) => Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w)));

function readSaved(): number {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY));
    return n ? clamp(n) : SIDEBAR_DEFAULT;
  } catch {
    return SIDEBAR_DEFAULT;
  }
}

/** Sets the CSS variable directly so dragging doesn't re-render the whole app. */
function apply(width: number) {
  document.documentElement.style.setProperty("--sidebar", `${width}px`);
}

function save(width: number) {
  try {
    if (width === SIDEBAR_DEFAULT) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    /* not persisted */
  }
}

// Apply the saved width before the first paint.
apply(readSaved());

export function SidebarResizer() {
  const { t } = useI18n();
  const [width, setWidth] = useState(readSaved);
  const [dragging, setDragging] = useState(false);

  function commit(w: number) {
    const next = clamp(w);
    apply(next);
    setWidth(next);
    save(next);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const startX = e.clientX;
    const startW = width;
    let current = startW;
    handle.setPointerCapture(e.pointerId);
    setDragging(true);

    const move = (ev: PointerEvent) => {
      current = clamp(startW + ev.clientX - startX);
      apply(current);
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      setDragging(false);
      commit(current);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const next =
      e.key === "ArrowLeft" ? width - STEP
      : e.key === "ArrowRight" ? width + STEP
      : e.key === "Home" ? SIDEBAR_MIN
      : e.key === "End" ? SIDEBAR_MAX
      : null;
    if (next === null) return;
    e.preventDefault();
    commit(next);
  }

  return (
    <div
      className={`sidebar-resizer ${dragging ? "is-dragging" : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={t("nav.resize")}
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      aria-valuenow={width}
      title={t("nav.resizeHint")}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={() => commit(SIDEBAR_DEFAULT)}
      onKeyDown={onKeyDown}
    />
  );
}
