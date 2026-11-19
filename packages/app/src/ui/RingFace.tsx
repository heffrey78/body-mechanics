import { useId } from "react";

/**
 * The Ring face logo (#63, #74): a combination wrench on the diagonal whose ring end is a screen with
 * a face; the dot on the handle is the joint you're minding. Coloured by the theme (--mark,
 * --mark-screen, --mark-face, and --tabbar for the dot). Below 28 px the face drops to eyes only,
 * as the logo rules say. Decorative unless given a label.
 */
export function RingFace({ size = 32, label }: { size?: number; label?: string }) {
  // Each mark needs its own mask id; React's ids have colons, which url(#…) doesn't like.
  const cut = `cut${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const small = size < 28;
  const face = "var(--mark-face)";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
      <defs>
        <mask id={cut} maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="140">
          <rect x="-20" y="-20" width="140" height="140" fill="#fff" />
          <rect x="72" y="80" width="12" height="22" rx="3" fill="#000" transform="rotate(-45 78 78)" />
        </mask>
      </defs>
      <g mask={`url(#${cut})`} fill="var(--mark)">
        <path d="M46 46 L74 74" fill="none" stroke="var(--mark)" strokeWidth={small ? 17 : 15} strokeLinecap="round" />
        <circle cx="34" cy="34" r={small ? 25 : 24} />
        <circle cx="78" cy="78" r={small ? 16 : 15} />
      </g>
      <circle cx="34" cy="34" r={small ? 15 : 16} fill="var(--mark-screen)" />
      <circle cx="28" cy={small ? 33 : 32} r={small ? 3.6 : 2.8} fill={face} />
      <circle cx="40" cy={small ? 33 : 32} r={small ? 3.6 : 2.8} fill={face} />
      {small ? null : <path d="M28 38 Q34 43 40 38" fill="none" stroke={face} strokeWidth="2.8" strokeLinecap="round" />}
      <circle cx="60" cy="60" r="4.5" fill="var(--tabbar)" />
    </svg>
  );
}
