import { useEffect, useRef } from "react";
import { formatBytes } from "@nodoteca/core";
import { useStorageUsage } from "../lib/api.ts";
import { useI18n } from "../lib/i18n.tsx";
import { LanguageSelect } from "./LanguageSelect.tsx";
import { ThemeSelect } from "./ThemeSelect.tsx";

interface Props {
  email: string | undefined;
  online: boolean;
  onImport: () => void;
  onExport: () => void;
  onSignOut: () => void;
}

const icon = (d: string) => (
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ICON_IMPORT = icon("M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M4 13.5V16h12v-2.5");
const ICON_EXPORT = icon("M10 12V3m0 0L6.5 6.5M10 3l3.5 3.5M4 13.5V16h12v-2.5");
const ICON_SIGNOUT = icon("M8 4H5v12h3m4-9 3 3-3 3m3-3H8");
// Two sliders: reads as "settings" and stays crisp at 18px.
const ICON_SETTINGS = icon("M3 6.5h8m4 0h2M3 13.5h2m4 0h8M11 6.5a2 2 0 1 0 4 0 2 2 0 1 0-4 0M5 13.5a2 2 0 1 0 4 0 2 2 0 1 0-4 0");

/** The ⚙ menu in the top bar: account, library actions, preferences, sign out. */
export function SettingsMenu({ email, online, onImport, onExport, onSignOut }: Props) {
  const { t, locale } = useI18n();
  const ref = useRef<HTMLDetailsElement>(null);
  const usage = useStorageUsage(online);

  const close = () => ref.current?.removeAttribute("open");

  // Close on a click outside the menu or on Escape.
  useEffect(() => {
    // A press outside the menu closes it. (The phone backdrop is handled on
    // click below: closing it on press would let the tap's click land on
    // whatever was underneath, e.g. open a link.)
    const onPointer = (e: PointerEvent) => {
      const el = ref.current;
      if (el?.open && !el.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current?.open) {
        close();
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const run = (action: () => void) => () => {
    close();
    action();
  };

  return (
    <details
      className="account"
      ref={ref}
      onClick={(e) => {
        // On phones the dimmed backdrop is the <details>' own ::before, so a tap
        // on it targets the <details> itself. The backdrop is still there when the
        // click fires, so the tap is used up here and never reaches the page.
        if (e.target === e.currentTarget) {
          e.preventDefault();
          close();
        }
      }}
    >
      <summary className="icon-btn" aria-label={t("settings.title")} title={t("settings.title")}>
        {ICON_SETTINGS}
      </summary>
      <div className="menu">
        <div className="menu__account">
          <span className="menu__avatar" aria-hidden="true">
            {(email?.[0] ?? "?").toUpperCase()}
          </span>
          <div className="menu__account-text">
            <span className="menu__caption">{t("settings.signedInAs")}</span>
            <span className="menu__email" title={email}>
              {email}
            </span>
          </div>
        </div>

        <div className="menu__section">
          <p className="menu__heading">{t("settings.library")}</p>
          <button className="menu__item" disabled={!online} onClick={run(onImport)}>
            <span className="menu__icon">{ICON_IMPORT}</span>
            <span className="menu__text">
              <span>{t("import.menu")}</span>
              <span className="menu__hint">{t("settings.importHint")}</span>
            </span>
          </button>
          <button className="menu__item" disabled={!online} onClick={run(onExport)}>
            <span className="menu__icon">{ICON_EXPORT}</span>
            <span className="menu__text">
              <span>{t("export.menu")}</span>
              <span className="menu__hint">{t("settings.exportHint")}</span>
            </span>
          </button>
          {usage.data && usage.data.max_total_bytes > 0 && (
            <div className="menu__row menu__row--stack menu__usage">
              <span className="menu__usage-head">
                <span>{t("files.usage")}</span>
                <span className="menu__hint">
                  {t("files.usageValue", {
                    used: formatBytes(usage.data.used_bytes, locale),
                    total: formatBytes(usage.data.max_total_bytes, locale),
                  })}
                </span>
              </span>
              <progress value={usage.data.used_bytes} max={usage.data.max_total_bytes} />
            </div>
          )}
        </div>

        <div className="menu__section">
          <p className="menu__heading">{t("settings.preferences")}</p>
          <div className="menu__row">
            <span>{t("settings.language")}</span>
            <LanguageSelect bare />
          </div>
          <div className="menu__row menu__row--stack">
            <span>{t("settings.theme")}</span>
            <ThemeSelect />
          </div>
        </div>

        <div className="menu__section">
          <button className="menu__item menu__item--danger" onClick={run(onSignOut)}>
            <span className="menu__icon">{ICON_SIGNOUT}</span>
            <span className="menu__text">
              <span>{t("auth.signOut")}</span>
            </span>
          </button>
        </div>
      </div>
    </details>
  );
}
