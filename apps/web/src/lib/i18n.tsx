import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createTranslator, isLocale, resolveLocale, type Locale } from "@nodoteca/core";

const STORAGE_KEY = "nodoteca.locale";

type Translate = ReturnType<typeof createTranslator>;
interface I18n {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: Translate;
}

const I18nContext = createContext<I18n | null>(null);

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    /* storage unavailable: fall back to the browser language */
  }
  return resolveLocale(navigator.languages);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18n>(
    () => ({
      locale,
      t: createTranslator(locale),
      setLocale: (l) => {
        setLocaleState(l);
        try {
          localStorage.setItem(STORAGE_KEY, l);
        } catch {
          /* not persisted, still applied */
        }
      },
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
