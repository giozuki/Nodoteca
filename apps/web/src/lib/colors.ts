/** Collection colors. Readable as dots on both light and dark backgrounds. */
export const COLLECTION_COLORS = [
  "#8E7BFF", // violet
  "#3DD6B5", // teal
  "#FF7A59", // coral
  "#F2C46D", // gold
  "#5AA9E6", // sky
  "#E66BA8", // pink
  "#8BC34A", // green
  "#A1887F", // clay
] as const;

/** A stable color for a name, used when a collection has none. */
export function colorFor(name: string, color: string | null | undefined): string {
  if (color) return color;
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return COLLECTION_COLORS[h % COLLECTION_COLORS.length]!;
}
