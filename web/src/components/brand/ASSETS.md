# Scout artwork

Runtime assets live in `web/public/brand/`.

- `scout-idle.webp` and `scout-idle.gif`: original user-supplied idle animation with deterministic alpha-only edge cleanup; see below. They retain the original dimensions, frame count, timing, and loop.
- `scout-working.webp` and `scout-working.gif`: original user-supplied working animation with deterministic frame cleanup; see below. They retain the original dimensions, frame count, timing, and loop.
- `scout-head.png`: standalone transparent head extracted from the supplied logo sheet with the built-in imagegen tool. Used for the header, review completion, and reduced-motion fallback.

Extraction prompt:

> Extract ONLY the first logo at top left labelled HEAD LOGO from this sheet into one standalone transparent PNG asset for a website header/favicon. Preserve the exact existing mascot design, colors, goggles, cream face, orange earphones, dark brown outlines and olive scarf. No redesign, no text or labels, no white or black background. Tight square framing with modest 4% transparent margin all around. Single head logo only; remove all other sheet content.

Preview both animations at `/__kit`. The working illustration accompanies the actual agent's status; Scout is the product identity, while the status text still identifies Claude Code. Internal package names, CLI commands and saved preference keys remain compatible.

## Ready animation

`scout-ready.webp` is the full-body completion animation prepared from the user-supplied `complete.mp4`. It replaces the generated still and CSS bounce. `scripts/assets/prepare-scout-complete.py` trims the first 1.5 seconds of the 10-second clip, skipping the opening pause so Scout reaches his thumbs-up sooner. It also ends at 8.5 seconds in the source, shortly after Scout lowers his hand, removing the trailing pause. The resulting 7-second loop retains the original 24fps (168 frames) in an 800×450 transparent animated WebP. It removes the border-connected cream backdrop and floor shadow while preserving enclosed cream panels, and unmattes the dark silhouette boundary to reduce pale fringes. The source audio is omitted. No new motion or frames are generated. Override the source trim timestamps with `--start SECONDS --end SECONDS` when regenerating.

`scout-ready-still.png` is a thumbs-up frame from the same video, selected before the animation is downloaded when reduced motion is requested. Both completion panels use `ScoutMascot mode="ready"`, and the animation uses the existing dark-theme artwork filter. Preview all three states at `/__kit`.

Regenerate with `python3 scripts/assets/prepare-scout-complete.py /path/to/complete.mp4` (requires ffmpeg, Pillow and NumPy). The original video remains in the user's supplied location.

## Dark mode and favicon

The original indigo UI palette is preserved. `ScoutPalette.tsx` and the `--scout-art-filter` token create a cooler rendition of the head and both GIFs in dark mode. A shared color matrix maps copper/orange toward periwinkle, cream toward cool ivory, and brown toward slate; it preserves alpha and timing. These are runtime artwork variants, not regenerated animation frames.

`scout-favicon.svg` and `scout-favicon-dark.svg` are code-native optical-size variants based on the supplied monogram: face, two large goggles, bold outlines, no scarf, no fine shading. The app's resolved theme selects the appropriate icon before first paint and after theme changes.

## Working animation cleanup

The working animation retains its original 800×450 canvas, 198 frames, 100ms per frame (19.8 seconds), and infinite loop. No character artwork or motion was generated. With user approval, `scripts/assets/clean-scout-working.py` uses Pillow and NumPy to repair the original frames directly. Run it with an **untouched** original GIF as its argument; do not use the already cleaned output as the source.

The red-paper/head gap contained opaque dark background pockets in zero-based frames `3,4,6,7,15–25,33,37,38,160,161,165,173–183,191,192,194,195`. A restricted mask isolates thick near-black pocket interiors while retaining two pixels of surrounding outline. A small median filter removes isolated silhouette pixels without growing the matte into transparent background. The GIF fallback retains binary transparency and each source frame's exact opaque RGB palette. The lossless WebP also corrects pale fringe pixels within the outer two-pixel border, then uses a 0.7px premultiplied-colour feather for a smoother contour on dark backgrounds. Newly partially transparent boundary pixels inherit the adjacent stroke colour, avoiding bright or black halos; interior artwork is unchanged. The feather can extend fractional alpha a few pixels beyond the original binary silhouette, preserving the apparent outline thickness.

Use `scout-working.webp` as the preferred animated source and `scout-working.gif` as fallback. A still image remains the reduced-motion source. The GIF format cannot store the partially transparent edge pixels used by the WebP. Thin original outlines are deliberately preserved rather than globally removing the character's dark colours.

## Idle animation cleanup

The idle animation retains its original 800×450 canvas, 198 frames, 100ms per frame (19.8 seconds), and infinite loop. Following the user's request for the same direct-frame cleanup, `scripts/assets/clean-scout-idle.py` uses Pillow and NumPy to remove isolated silhouette pixels with a subtractive 3×3 median alpha filter. The GIF fallback preserves exact opaque RGB colours and binary transparency. The lossless animated WebP adds the same restrained 0.45px alpha feather as the working animation, with no opacity added outside the original silhouette.

No working-animation pocket masks are applied to idle. The magnifying glass, backpack, scarf, and dark limb outlines are preserved; inspection did not reveal a clearly erroneous thick background pocket that would justify deleting those details. No artwork, expressions, or motion was generated or recoloured. The WebP is the preferred animated source and the GIF remains the fallback; reduced-motion behavior is unchanged.

Regenerate with `python3 scripts/assets/clean-scout-idle.py /path/to/untouched-original.gif` (requires Pillow and NumPy). Never use the cleaned output as the input because edge filtering is cumulative. The untouched source for this cleanup was backed up outside runtime assets at `/private/tmp/scout-idle-cleanup/original.gif`.
