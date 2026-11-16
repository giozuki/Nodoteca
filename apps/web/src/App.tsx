import { useEffect, useState } from "react";
import { Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import type { Session } from "@supabase/supabase-js";
import type { Uuid } from "@nodoteca/core";
import { extractShared } from "@nodoteca/core";
import { useRealtimeSync } from "./lib/api.ts";
import { useI18n } from "./lib/i18n.tsx";
import { supabase } from "./lib/supabase.ts";
import { CollectionDialog } from "./components/CollectionDialog.tsx";
import { ItemDialog } from "./components/ItemDialog.tsx";
import { LanguageSelect } from "./components/LanguageSelect.tsx";
import { Library } from "./components/Library.tsx";
import { Login } from "./components/Login.tsx";
import { Logo } from "./components/Logo.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { ThemeSelect } from "./components/ThemeSelect.tsx";

function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
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
  const [search, setSearch] = useState(params.get("q") ?? "");

  useRealtimeSync(session.user.id);

  // Close the mobile drawer on navigation.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <div className={`shell ${menuOpen ? "menu-open" : ""}`}>
      <header className="topbar">
        <button className="icon-btn topbar__menu" onClick={() => setMenuOpen((o) => !o)} aria-label={t("nav.menu")} aria-expanded={menuOpen}>
          ☰
        </button>
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
        >
          <Logo />
          <span>{t("app.name")}</span>
        </a>
        <form
          className="search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const q = search.trim();
            navigate(q ? `/search?q=${encodeURIComponent(q)}` : "/");
          }}
        >
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search.placeholder")} aria-label={t("search.placeholder")} />
        </form>
        <AddButton onAdd={setAdding} />
        <details className="account">
          <summary className="icon-btn" aria-label={t("settings.title")} title={t("settings.title")}>
            ⚙
          </summary>
          <div className="account__menu">
            <p className="muted small account__email">{session.user.email}</p>
            <LanguageSelect />
            <ThemeSelect />
            <button className="btn btn--ghost" onClick={() => void supabase.auth.signOut()}>
              {t("auth.signOut")}
            </button>
          </div>
        </details>
      </header>

      <aside className="sidebar">
        <Sidebar onNewCollection={() => setNewCollection(true)} onNavigate={() => setMenuOpen(false)} />
      </aside>
      <div className="scrim" onClick={() => setMenuOpen(false)} />

      <main className="main">
        <Routes>
          <Route path="/" element={<Library view="all" onAdd={setAdding} />} />
          <Route path="/unfiled" element={<Library view="unfiled" onAdd={setAdding} />} />
          <Route path="/c/:id" element={<Library view="collection" onAdd={setAdding} />} />
          <Route path="/search" element={<Library view="search" onAdd={setAdding} />} />
          <Route path="/share" element={<ShareTarget />} />
          <Route path="*" element={<Library view="all" onAdd={setAdding} />} />
        </Routes>
      </main>

      {adding && <ItemDialog initial={{ collectionIds: adding }} onClose={() => setAdding(null)} />}
      {newCollection && <CollectionDialog onClose={() => setNewCollection(false)} />}
    </div>
  );
}

/** "Save link" pre-selects the collection being viewed, if any. */
function AddButton({ onAdd }: { onAdd: (ids: Uuid[]) => void }) {
  const { t } = useI18n();
  return (
    <Routes>
      <Route path="/c/:id" element={<AddButtonInner onAdd={onAdd} label={t("item.add")} />} />
      <Route path="*" element={<AddButtonInner onAdd={onAdd} label={t("item.add")} />} />
    </Routes>
  );
}

function AddButtonInner({ onAdd, label }: { onAdd: (ids: Uuid[]) => void; label: string }) {
  const { id } = useParams();
  return (
    <button className="btn btn--primary topbar__add" onClick={() => onAdd(id ? [id] : [])}>
      <span aria-hidden="true">+</span>
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
