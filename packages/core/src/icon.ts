/**
 * Collection icons are a single emoji, stored as text in collections.icon
 * (the column allows up to 32 characters, enough for ZWJ sequences and flags).
 */

export const ICON_MAX_LENGTH = 32;

const PICTOGRAPHIC = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
// Keycaps (1️⃣, #️⃣) are digits followed by U+20E3.
const KEYCAP = /^[0-9#*]️?⃣$/u;

function graphemes(s: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)].map((g) => g.segment);
  }
  return [...s]; // very old engines: code points are close enough for a check
}

/**
 * Returns the emoji if `input` is exactly one emoji (surrounding spaces are
 * ignored), otherwise null. Use it before saving and when importing.
 */
export function normalizeIcon(input: string | null | undefined): string | null {
  const s = input?.trim();
  if (!s || s.length > ICON_MAX_LENGTH) return null;
  const parts = graphemes(s);
  if (parts.length !== 1) return null;
  const g = parts[0]!;
  return PICTOGRAPHIC.test(g) || KEYCAP.test(g) ? g : null;
}

/** The last emoji typed or pasted into a field (people often type next to an existing one). */
export function lastIcon(input: string): string | null {
  const parts = graphemes(input.trim());
  for (let i = parts.length - 1; i >= 0; i--) {
    const icon = normalizeIcon(parts[i]);
    if (icon) return icon;
  }
  return null;
}

