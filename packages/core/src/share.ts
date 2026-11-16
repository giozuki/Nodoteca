/**
 * Turns what the Android share sheet (Web Share Target) sends into a link to save.
 * Apps are inconsistent: YouTube puts the URL in `text`, Chrome in `url`,
 * some apps send "Title https://…" all in `text`.
 */
export interface SharedData {
  url: string | null;
  title: string | null;
}

const URL_RE = /https?:\/\/[^\s<>"']+/i;

export function extractShared(params: { url?: string | null; text?: string | null; title?: string | null }): SharedData {
  const candidates = [params.url, params.text, params.title].map((v) => v?.trim() ?? "");
  let url: string | null = null;
  for (const c of candidates) {
    const match = c.match(URL_RE)?.[0];
    if (match) {
      url = match.replace(/[).,;!?]+$/, ""); // drop trailing punctuation
      break;
    }
  }

  // A title is whatever text is left once the URL is removed.
  const strip = (s: string) => (url ? s.replace(url, "") : s).replace(/\s+/g, " ").replace(/^[\s\-–—|:.,;]+|[\s\-–—|:.,;]+$/g, "");
  const title = [params.title, params.text].map((v) => strip(v?.trim() ?? "")).find((s) => s.length > 0) ?? null;

  return { url, title };
}
