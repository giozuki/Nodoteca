import { THEMES, useTheme, type Theme } from "../lib/theme.ts";
import { useI18n } from "../lib/i18n.tsx";

const ICONS: Record<Theme, string> = { system: "◐", light: "☀", dark: "☾" };

/** Segmented control: System / Light / Dark. */
export function ThemeSelect() {
  const { t } = useI18n();
  const [theme, setTheme] = useTheme();
  return (
    <div className="segmented" role="radiogroup" aria-label={t("settings.theme")}>
      {THEMES.map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          className={theme === value ? "is-active" : ""}
          onClick={() => setTheme(value)}
        >
          <span aria-hidden="true">{ICONS[value]}</span> {t(`theme.${value}`)}
        </button>
      ))}
    </div>
  );
}
