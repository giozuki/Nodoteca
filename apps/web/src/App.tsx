import { useEffect, useRef, useState } from "react";
import { NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import type { Session } from "@supabase/supabase-js";
import type { Uuid } from "@nodoteca/core";
import { extractShared } from "@nodoteca/core";
import { useRealtimeSync } from "./lib/api.ts";
import { clearSnapshot, useOfflineSync, useOnline, useSavedAt } from "./lib/offline.ts";
import { useI18n } from "./lib/i18n.tsx";
import { supabase } from "./lib/supabase.ts";
import { CollectionDialog } from "./components/CollectionDialog.tsx";
import { ExportDialog } from "./components/ExportDialog.tsx";
import { ImportDialog } from "./components/ImportDialog.tsx";
import { ItemDialog } from "./components/ItemDialog.tsx";
import { Library } from "./components/Library.tsx";
import { Login } from "./components/Login.tsx";
import { Logo } from "./components/Logo.tsx";
import { SettingsMenu } from "./components/SettingsMenu.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { SidebarResizer } from "./components/SidebarResizer.tsx";
import { IconAll, IconCollections, IconOffline, IconPlus, IconSearch } from "./components/Icons.tsx";

/**
 * Offline with an expired access token, Supabase can't refresh it and reports
 * no session. The stored session is still good enough to show the offline copy;
 * the token is refreshed automatically once the connection is back.
 */
function storedSessionWhileOffline(): Session | null {
  if (navigator.onLine) return null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("sb-") && key.endsWith("-auth-token")) {
        const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as Session | null;
        if (parsed?.user?.id) return parsed;
      }
    }
  } catch {
    /* no usable stored session */
  }
  return null;
}

function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session ?? storedSessionWhileOffline()));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s ?? storedSessionWhileOffline());
      if (event === "SIGNED_OUT") void clearSnapshot();
      if (event === "SIGNED_IN") {
        try {
          localStorage.removeItem("nodoteca.pendingEmail");
        } catch {
          /* nothing to clean */
        }
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

export function App() {
  const session = useSession();
  if (session === undefined) return <div className="splash"><Logo size={48} /></div>;
  if (!session) return <Login redirectTo={window.location.origin + import.meta.env.BASE_URL} />;
  return <Shell session={session} />;
}

function Shell({ session }: { session: Session }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [adding, setAdding] = useState<Uuid[] | null>(null);
  const [newCollection, setNewCollection] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState(params.get("q") ?? "");

  useRealtimeSync(session.user.id);
  useOfflineSync(session.user.id);
  const online = useOnline();

  // Close the mobile drawer on navigation.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const searchRef = useRef<HTMLInputElement>(null);

  // "/" or Ctrl/Cmd+K jumps to search from anywhere (not while typing elsewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        if (document.querySelector("dialog[open]")) return;
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const goHome = (e: React.MouseEvent) => {
    e.preventDefault();
    navigate("/");
  };

  return (
    <div className={`shell ${menuOpen ? "menu-open" : ""}`}>
      <aside className="sidebar" aria-label={t("nav.collections")}>
        <div className="sidebar__brand">
          <a className="brand" href="/" onClick={goHome}>
            <Logo />
            <span>{t("app.name")}</span>
          </a>
        </div>
        <div className="sidebar__grabber" aria-hidden="true" />
        <div className="sidebar__scroll">
          <Sidebar onNewCollection={() => setNewCollection(true)} onNavigate={() => setMenuOpen(false)} />
        </div>
      </aside>
      <SidebarResizer />
      <div className="scrim" onClick={() => setMenuOpen(false)} />

      <div className="main-col">
        <header className="topbar">
          <a className="brand topbar__brand" href="/" onClick={goHome} aria-label={t("app.name")}>
            <Logo size={26} />
            <span>{t("app.name")}</span>
          </a>
          <form
            className="search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              const q = search.trim();
              searchRef.current?.blur();
              navigate(q ? `/search?q=${encodeURIComponent(q)}` : "/");
            }}
          >
            <span className="search__icon"><IconSearch s={16} /></span>
            <input
              ref={searchRef}
              type="search"
              enterKeyHint="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search.placeholder")}
              aria-label={t("search.placeholder")}
            />
            <kbd className="kbd" aria-hidden="true">{IS_MAC ? "⌘" : "Ctrl"} K</kbd>
          </form>
          <AddButton onAdd={setAdding} />
          <SettingsMenu
            email={session.user.email}
            online={online}
            onImport={() => setImporting(true)}
            onExport={() => setExporting(true)}
            onSignOut={() => {
              void clearSnapshot();
              void supabase.auth.signOut();
            }}
          />
        </header>

        <main className="main">
          {!online && <OfflineBanner />}
          <Routes>
            <Route path="/" element={<Library view="all" onAdd={setAdding} />} />
            <Route path="/unfiled" element={<Library view="unfiled" onAdd={setAdding} />} />
            <Route path="/c/:id" element={<Library view="collection" onAdd={setAdding} />} />
            <Route path="/search" element={<Library view="search" onAdd={setAdding} />} />
            <Route path="/share" element={<ShareTarget />} />
            <Route path="*" element={<Library view="all" onAdd={setAdding} />} />
          </Routes>
        </main>
      </div>

      {/* Phone: a floating dock with the three things you do most. */}
      <nav className="dock" aria-label={t("nav.menu")}>
        <NavLink to="/" end className={({ isActive }) => `dock__item ${isActive && !menuOpen ? "is-active" : ""}`}>
          <IconAll s={20} />
          <span>{t("nav.all")}</span>
        </NavLink>
        <AddButton onAdd={setAdding} variant="dock" />
        <button
          type="button"
          className={`dock__item ${menuOpen ? "is-active" : ""}`}
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
        >
          <IconCollections s={20} />
          <span>{t("nav.collections")}</span>
        </button>
      </nav>

      {adding && <ItemDialog initial={{ collectionIds: adding }} onClose={() => setAdding(null)} />}
      {newCollection && <CollectionDialog onClose={() => setNewCollection(false)} />}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
    </div>
  );
}

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** "Save link" pre-selects the collection being viewed, if any. */
type AddVariant = "topbar" | "dock";

function AddButton({ onAdd, variant = "topbar" }: { onAdd: (ids: Uuid[]) => void; variant?: AddVariant }) {
  const { t } = useI18n();
  const inner = <AddButtonInner onAdd={onAdd} label={t("item.add")} variant={variant} />;
  return (
    <Routes>
      <Route path="/c/:id" element={inner} />
      <Route path="*" element={inner} />
    </Routes>
  );
}

function AddButtonInner({ onAdd, label, variant }: { onAdd: (ids: Uuid[]) => void; label: string; variant: AddVariant }) {
  const { id } = useParams();
  const online = useOnline();
  if (variant === "dock") {
    return (
      <button className="dock__add" disabled={!online} onClick={() => onAdd(id ? [id] : [])} aria-label={label}>
        <IconPlus s={24} />
      </button>
    );
  }
  return (
    <button className="btn btn--primary topbar__add" disabled={!online} onClick={() => onAdd(id ? [id] : [])}>
      <IconPlus s={16} />
      <span className="topbar__add-label">{label}</span>
    </button>
  );
}

/**
 * Android share sheet lands here (manifest share_target): /share?title=…&text=…&url=…
 * Opens the save dialog pre-filled, then goes back to the library.
 */
function ShareTarget() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const shared = extractShared({ url: params.get("url"), text: params.get("text"), title: params.get("title") });
  const done = () => navigate("/", { replace: true });

  if (!shared.url) {
    return (
      <div className="empty">
        <p>{t("share.noUrl")}</p>
        <button className="btn btn--ghost" onClick={done}>
          {t("common.close")}
        </button>
      </div>
    );
  }
  return <ItemDialog initial={{ url: shared.url, title: shared.title ?? undefined }} onClose={done} />;
}

function OfflineBanner() {
  const { t, locale } = useI18n();
  const savedAt = useSavedAt();
  const when = savedAt
    ? new Date(savedAt).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;
  return (
    <p className="offline-banner" role="status">
      <IconOffline s={18} /> <span>{when ? t("offline.banner", { time: when }) : t("offline.noCopy")}</span>
    </p>
  );
}
