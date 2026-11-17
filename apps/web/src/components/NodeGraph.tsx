import { useId } from "react";

/**
 * The brand idea drawn large: one link (the card on the left) connected to
 * many collections. Lines draw in once, then small pulses travel along them.
 * Purely decorative; pulses are hidden under reduced motion.
 */
const NODES = [
  { y: 46, color: "#3DD6B5", w: 132, d: 0 },
  { y: 118, color: "#F2C46D", w: 104, d: 120 },
  { y: 190, color: "#FF6A35", w: 150, d: 240 },
  { y: 262, color: "#5AA9E6", w: 116, d: 360 },
];

export function NodeGraph({ className, pulses = true }: { className?: string; pulses?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const ox = 150; // where the card's connector sits
  const oy = 154;
  return (
    <svg className={className} viewBox="0 0 560 308" fill="none" aria-hidden="true">
      {NODES.map((n, i) => {
        const d = `M${ox} ${oy} C ${ox + 110} ${oy}, ${300} ${n.y}, ${372} ${n.y}`;
        return (
          <g key={i}>
            <path id={`${uid}-p${i}`} className="graph__line" pathLength={1} d={d} stroke="currentColor" strokeOpacity=".28" strokeWidth="1.5" style={{ "--d": n.d } as React.CSSProperties} />
            <g className="graph__node" style={{ "--d": n.d } as React.CSSProperties}>
              <rect x={372} y={n.y - 17} width={n.w} height={34} rx={17} fill="var(--surface)" stroke="var(--border-strong)" />
              <circle cx={392} cy={n.y} r={6} fill={n.color} />
              <rect x={406} y={n.y - 4} width={n.w - 52} height={8} rx={4} fill="currentColor" fillOpacity=".14" />
            </g>
            {pulses && (
              <circle className="graph__pulse" r="3.5" fill={n.color}>
                <animateMotion dur={`${2.6 + i * 0.35}s`} begin={`${1.8 + i * 0.4}s`} repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.65 0 0.35 1">
                  <mpath href={`#${uid}-p${i}`} />
                </animateMotion>
              </circle>
            )}
          </g>
        );
      })}
      {/* the link card */}
      <g className="graph__item">
        <rect x="8" y="96" width="150" height="116" rx="14" fill="var(--surface)" stroke="var(--border-strong)" />
        <rect x="16" y="104" width="134" height="58" rx="8" fill="var(--accent)" fillOpacity=".16" />
        <path d="M30 150 l22 -24 16 16 12 -10 22 18" stroke="var(--accent)" strokeOpacity=".6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <rect x="18" y="174" width="110" height="8" rx="4" fill="currentColor" fillOpacity=".55" />
        <rect x="18" y="190" width="70" height="7" rx="3.5" fill="currentColor" fillOpacity=".18" />
        <circle cx={ox} cy={oy} r="6" fill="var(--surface)" stroke="currentColor" strokeWidth="2" />
        <circle cx={ox} cy={oy} r="2.5" fill="var(--accent)" />
      </g>
    </svg>
  );
}
