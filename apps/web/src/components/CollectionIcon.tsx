import { colorFor } from "../lib/colors.ts";

interface Props {
  collection: { name: string; color: string | null; icon: string | null };
  /** sm: chips and lists · md: sidebar · lg: page title · xl: collection dialog */
  size?: "sm" | "md" | "lg" | "xl";
}

/**
 * A collection's emoji, or, without one, its initial on a tile of its colour.
 * Same footprint either way, so rows line up whatever the collection has.
 */
export function CollectionIcon({ collection, size = "md" }: Props) {
  const { name, color, icon } = collection;
  if (icon) {
    return (
      <span className={`cicon cicon--${size} cicon--emoji`} aria-hidden="true">
        {icon}
      </span>
    );
  }
  const initial = [...name.trim()][0]?.toLocaleUpperCase() ?? "?";
  return (
    <span className={`cicon cicon--${size} cicon--initial`} style={{ "--c": colorFor(name, color) } as React.CSSProperties} aria-hidden="true">
      {initial}
    </span>
  );
}
