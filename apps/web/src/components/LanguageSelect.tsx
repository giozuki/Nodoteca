import { LOCALES, isLocale } from "@nodoteca/core";
import { useI18n } from "../lib/i18n.tsx";

export function LanguageSelect() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="lang">
      <span className="sr-only">{t("settings.language")}</span>
      <span aria-hidden="true">🌐</span>
      <select
        value={locale}
        onChange={(e) => {
          if (isLocale(e.target.value)) setLocale(e.target.value);
        }}
      >
        {Object.entries(LOCALES).map(([code, { label }]) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
