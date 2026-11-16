import { useState } from "react";
import { supabase } from "../lib/supabase.ts";
import { useI18n } from "../lib/i18n.tsx";
import { LanguageSelect } from "./LanguageSelect.tsx";
import { Logo } from "./Logo.tsx";
import { ThemeSelect } from "./ThemeSelect.tsx";

export function Login() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setState("sending");
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setError(error.message || t("common.error"));
      setState("idle");
    } else {
      setState("sent");
    }
  }

  return (
    <main className="login">
      <div className="login__card">
        <Logo size={56} />
        <h1>{t("app.name")}</h1>
        <p className="muted">{t("app.tagline")}</p>

        {state === "sent" ? (
          <>
            <p className="notice">{t("auth.checkInbox", { email: email.trim() })}</p>
            <button className="btn btn--ghost" onClick={() => setState("idle")}>
              {t("auth.useAnotherEmail")}
            </button>
          </>
        ) : (
          <form
            className="login__form"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <p>{t("auth.intro")}</p>
            <label className="field">
              <span>{t("auth.email")}</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="btn btn--primary" disabled={state === "sending"}>
              {state === "sending" ? t("auth.sending") : t("auth.sendMagicLink")}
            </button>
          </form>
        )}
      </div>
      <div className="login__prefs">
        <LanguageSelect />
        <ThemeSelect />
      </div>
    </main>
  );
}
