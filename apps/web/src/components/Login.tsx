import { useState } from "react";
import { supabase } from "../lib/supabase.ts";
import { useI18n } from "../lib/i18n.tsx";
import { LanguageSelect } from "./LanguageSelect.tsx";
import { Logo } from "./Logo.tsx";
import { NodeGraph } from "./NodeGraph.tsx";
import { ThemeSelect } from "./ThemeSelect.tsx";

const PENDING_KEY = "nodoteca.pendingEmail";

/** The code needs {{ .Token }} in the email template, which needs custom SMTP. */
export const CODE_ENABLED = import.meta.env.VITE_AUTH_CODE === "true";

function loadPending(): string {
  try {
    return localStorage.getItem(PENDING_KEY) ?? "";
  } catch {
    return "";
  }
}

function savePending(email: string | null) {
  try {
    if (email) localStorage.setItem(PENDING_KEY, email);
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* not persisted */
  }
}

interface Props {
  /** Where the email link should land. */
  redirectTo?: string;
  /** Message shown once the email is sent (defaults to "check your inbox"). */
  sentMessage?: (email: string) => string;
  compact?: boolean;
}

/**
 * Passwordless sign-in with an email link. Optionally (VITE_AUTH_CODE) the email
 * also carries a one-time code to type in. The pending email survives a reload,
 * so closing the extension popup to read the email is fine.
 */
export function Login({ redirectTo, sentMessage, compact = false }: Props) {
  const { t } = useI18n();
  const pending = loadPending();
  const [email, setEmail] = useState(pending);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "sent">(pending ? "sent" : "email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendEmail() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: redirectTo ? { emailRedirectTo: redirectTo } : {},
    });
    setBusy(false);
    if (error) return setError(error.message || t("common.error"));
    savePending(email.trim());
    setStep("sent");
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) return setError(t("auth.invalidCode"));
    savePending(null);
  }

  function restart() {
    savePending(null);
    setCode("");
    setError(null);
    setStep("email");
  }

  const tagline = t("app.tagline");
  const comma = tagline.indexOf(",");

  return (
    <main className={`login ${compact ? "login--compact" : ""}`}>
      {!compact && (
        <section className="login__hero">
          <div className="login__brand">
            <Logo size={30} />
            <span>{t("app.name")}</span>
          </div>
          <div>
            <p className="login__headline">
              {comma > 0 ? (
                <>
                  {tagline.slice(0, comma + 1)} <em>{tagline.slice(comma + 1).trim()}</em>
                </>
              ) : (
                tagline
              )}
            </p>
            <NodeGraph className="login__graph" />
          </div>
          <div className="login__foot" aria-hidden="true">
            <span>PWA</span>
            <span>Offline</span>
            <span>Open source</span>
          </div>
        </section>
      )}
      <div className={compact ? "" : "login__panel"}>
      <div className="login__card">
        <Logo size={compact ? 40 : 56} />
        <h1>{compact ? t("app.name") : t("auth.verify")}</h1>

        {step === "email" ? (
          <form
            className="login__form"
            onSubmit={(e) => {
              e.preventDefault();
              void sendEmail();
            }}
          >
            <p>{t("auth.intro")}</p>
            <label className="field">
              <span>{t("auth.email")}</span>
              <input
                type="email"
                required
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="btn btn--primary" disabled={busy}>
              {busy ? t("auth.sending") : t("auth.sendMagicLink")}
            </button>
          </form>
        ) : (
          <form
            className="login__form"
            onSubmit={(e) => {
              e.preventDefault();
              void verify();
            }}
          >
            <p className="notice">
              {sentMessage ? sentMessage(email.trim()) : t("auth.checkInbox", { email: email.trim() })}{" "}
              {CODE_ENABLED ? t("auth.codeHint") : ""}
            </p>
            {CODE_ENABLED && (
            <>
            <label className="field">
              <span>{t("auth.code")}</span>
              <input
                className="code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                pattern="[0-9]{6,10}"
                maxLength={10}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="btn btn--primary" disabled={busy || code.length < 6}>
              {t("auth.verify")}
            </button>
            </>
            )}
            <button type="button" className="btn btn--ghost" onClick={restart}>
              {t("auth.useAnotherEmail")}
            </button>
          </form>
        )}
      </div>
      {!compact && (
        <div className="login__prefs">
          <LanguageSelect />
          <ThemeSelect />
        </div>
      )}
      </div>
    </main>
  );
}
