/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_APP_URL?: string;
  readonly VITE_AUTH_FLOW?: "pkce" | "implicit";
  /** "true" once custom SMTP lets the email template include {{ .Token }}. */
  readonly VITE_AUTH_CODE?: string;
}
