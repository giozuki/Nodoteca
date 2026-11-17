/**
 * The Nodoteca mark: one link (the card) connected to three collections,
 * on an ink tile. Same drawing as public/favicon.svg and the PNG icons.
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="logo">
      <rect width="64" height="64" rx="15" fill="#17160F" />
      <g fill="none" stroke="#F3F0E8" strokeOpacity=".5" strokeWidth="2.4" strokeLinecap="round">
        <path d="M30 32 C 39 32, 40 17, 48 17" />
        <path d="M30 32 L 49 32" />
        <path d="M30 32 C 39 32, 40 47, 48 47" />
      </g>
      <rect x="10" y="21" width="19" height="22" rx="4.5" fill="#F3F0E8" />
      <rect x="13" y="24" width="13" height="8" rx="2" fill="#FF6A35" fillOpacity=".85" />
      <rect x="13" y="35" width="10" height="2.6" rx="1.3" fill="#17160F" fillOpacity=".45" />
      <circle cx="49" cy="17" r="4.6" fill="#3DD6B5" />
      <circle cx="51" cy="32" r="4.6" fill="#F2C46D" />
      <circle cx="49" cy="47" r="4.6" fill="#5AA9E6" />
    </svg>
  );
}
