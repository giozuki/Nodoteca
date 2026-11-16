import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { normalizeUrl, type LinkPreview, type SavedMatch, type Uuid } from "@nodoteca/core";
import { fetchPreview, findSaved, useGraph, useSaveItem } from "@web/lib/api.ts";
import { useI18n } from "@web/lib/i18n.tsx";
import { supabase } from "@web/lib/supabase.ts";
import { CollectionPicker } from "@web/components/CollectionPicker.tsx";
import { Login } from "@web/components/Login.tsx";
import { Logo } from "@web/components/Logo.tsx";
import { HANDOFF_KEY } from "./handoff.ts";

/** Where "Open Nodoteca" goes. */
const APP_URL = import.meta.env.VITE_APP_URL || "https://giozuki.github.io/Nodoteca/";

/** A session handed over by connect-extension.html (via the service worker), if any. */
async function consumeHandoff(): Promise<void> {
  const stored = await chrome.storage.local.get(HANDOFF_KEY);
  const tokens = stored[HANDOFF_KEY] as { access_token: string; refresh_token: string } | undefined;
  if (!tokens) return;
  await chrome.storage.local.remove(HANDOFF_KEY);
  await supabase.auth.setSession(tokens);
  try {
    localStorage.removeItem("nodoteca.pendingEmail");
  } catch {
    /* nothing to clean */
  }
}

function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    void consumeHandoff()
      .catch(() => {})
      .then(() => supabase.auth.getSession())
      .then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

function openApp() {
  void chrome.tabs.create({ url: APP_URL });
  window.close();
}

export function Popup() {
  const session = useSession();
  if (session === undefined) return <div className="ext-splash"><Logo size={36} /></div>;
  // The email link opens connect-extension.html on the web app, which hands the
  // session to this extension (identified by its id).
  if (!session) return <ExtensionLogin />;
  return <SaveCurrentTab />;
}

function ExtensionLogin() {
  const { t } = useI18n();
  const redirectTo = `${APP_URL}connect-extension.html?ext=${chrome.runtime.id}`;
  return <Login compact redirectTo={redirectTo} sentMessage={(email) => t("auth.extCheckInbox", { email })} />;
}

function SaveCurrentTab() {
  const { t } = useI18n();
  const { graph } = useGraph();
  const save = useSaveItem();
  const [tab, setTab] = useState<{ url: string; title: string } | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [collectionIds, setCollectionIds] = useState<Uuid[]>([]);
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [matches, setMatches] = useState<SavedMatch[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // activeTab: clicking the toolbar button grants access to this tab's URL and title.
  useEffect(() => {
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([active]) => {
      setTab({ url: active?.url ?? "", title: active?.title ?? "" });
      setTitle(active?.title ?? "");
    });
  }, []);

  const supported = !!tab && /^https?:\/\//.test(tab.url);
  const url = supported ? normalizeUrl(tab.url) : "";

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void Promise.all([findSaved(url).catch(() => []), fetchPreview(url)]).then(([found, p]) => {
      if (cancelled) return;
      setMatches(found);
      setPreview(p);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const options = useMemo(() => [...graph.byId.values()], [graph]);
  const savedIn = [...new Set(matches.flatMap((m) => m.collection_ids))]
    .map((id) => graph.byId.get(id)?.name)
    .filter(Boolean)
    .join(", ");

  async function submit() {
    setError(null);
    try {
      await save.mutateAsync({
        p_url: url,
        p_collection_ids: collectionIds,
        p_title: title.trim() || preview?.title || null,
        p_note: note.trim() || null,
        p_description: preview?.description ?? null,
        p_thumbnail_url: preview?.thumbnail_url ?? null,
        p_site_name: preview?.site_name ?? null,
        p_metadata: preview?.metadata ?? {},
      });
      setSaved(true);
      setTimeout(() => window.close(), 1400);
    } catch {
      setError(t("common.error"));
    }
  }

  return (
    <div className="ext-popup">
      <header className="ext-header">
        <Logo size={22} />
        <strong>{t("app.name")}</strong>
        <button className="link-btn" onClick={openApp}>
          {t("ext.open")} ↗
        </button>
      </header>

      {!tab ? null : !supported ? (
        <p className="muted ext-message">{t("ext.unsupported")}</p>
      ) : saved ? (
        <p className="ext-saved">✓ {t("ext.saved")}</p>
      ) : (
        <form
          className="ext-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="ext-target">
            {preview?.thumbnail_url && <img src={preview.thumbnail_url} alt="" referrerPolicy="no-referrer" />}
            <span className="ext-url" title={url}>
              {url.replace(/^https?:\/\/(www\.)?/, "")}
            </span>
          </div>

          {matches.length > 0 && (
            <p className="warning">{savedIn ? t("item.alreadySaved", { collections: savedIn }) : t("item.alreadySavedNowhere")}</p>
          )}

          <label className="field">
            <span>{t("item.title")}</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <CollectionPicker label={t("collection.addTo")} options={options} value={collectionIds} onChange={setCollectionIds} />

          <label className="field">
            <span>{t("item.note")}</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>

          {error && <p className="error">{error}</p>}

          <button className="btn btn--primary" disabled={save.isPending}>
            {matches.length ? t("item.saveAnyway") : t("item.add")}
          </button>
        </form>
      )}

      <footer className="ext-footer">
        <button className="link-btn muted" onClick={() => void supabase.auth.signOut()}>
          {t("auth.signOut")}
        </button>
      </footer>
    </div>
  );
}
