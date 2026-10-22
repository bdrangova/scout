# Scout artwork

Runtime assets live in `web/public/brand/`.

- `scout-idle.gif` and `scout-working.gif`: original user-supplied animations, copied without changes. They retain transparency and timing.
- `scout-head.png`: standalone transparent head extracted from the supplied logo sheet with the built-in imagegen tool. Used for the header, review completion, and reduced-motion fallback.

Extraction prompt:

> Extract ONLY the first logo at top left labelled HEAD LOGO from this sheet into one standalone transparent PNG asset for a website header/favicon. Preserve the exact existing mascot design, colors, goggles, cream face, orange earphones, dark brown outlines and olive scarf. No redesign, no text or labels, no white or black background. Tight square framing with modest 4% transparent margin all around. Single head logo only; remove all other sheet content.

Preview both animations at `/__kit`. The working illustration accompanies the actual agent's status; Scout is the product identity, while the status text still identifies Claude Code. Internal package names, CLI commands and saved preference keys remain compatible.

## Dark mode and favicon

The original indigo UI palette is preserved. `ScoutPalette.tsx` and the `--scout-art-filter` token create a cooler rendition of the head and both GIFs in dark mode. A shared color matrix maps copper/orange toward periwinkle, cream toward cool ivory, and brown toward slate; it preserves alpha and timing. These are runtime artwork variants, not regenerated animation frames.

`scout-favicon.svg` and `scout-favicon-dark.svg` are code-native optical-size variants based on the supplied monogram: face, two large goggles, bold outlines, no scarf, no fine shading. The app's resolved theme selects the appropriate icon before first paint and after theme changes.
