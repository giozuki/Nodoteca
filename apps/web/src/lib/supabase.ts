import { createClient, type PostgrestError } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env at the repo root.");
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // The web app uses PKCE; the extension build switches to "implicit" (see its vite.config.ts).
    flowType: import.meta.env.VITE_AUTH_FLOW === "implicit" ? "implicit" : "pkce",
  },
});

/** Unwraps a Supabase response: returns data or throws the error. */
export function must<T>({ data, error }: { data: T | null; error: PostgrestError | null }): T {
  if (error) throw error;
  return data as T;
}

/** Postgres error codes we turn into friendly messages. */
export function errorCode(err: unknown): string | undefined {
  return typeof err === "object" && err && "code" in err ? String((err as { code: unknown }).code) : undefined;
}
