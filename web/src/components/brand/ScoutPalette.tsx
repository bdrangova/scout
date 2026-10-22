/** Shared color mapping keeps the logo and every animation frame in the same dark palette.
 * Alpha is unchanged, so the supplied transparent animations keep their original motion.
 */
export function ScoutPalette() {
  return (
    <svg aria-hidden width="0" height="0" className="pointer-events-none absolute" focusable="false">
      <defs>
        <filter id="scout-dark-palette" colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
          <feColorMatrix type="matrix" values="
            0.15 0.70 0.15 0 0
            0.35 0.45 0.20 0 0
            0.85 0.10 0.05 0 0
            0    0    0    1 0
          " />
        </filter>
      </defs>
    </svg>
  )
}
