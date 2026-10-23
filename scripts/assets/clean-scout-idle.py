#!/usr/bin/env python3
"""Clean Scout's idle matte without regenerating or recolouring the artwork.

Requires Pillow and NumPy. Run with an untouched original GIF:
  python3 scripts/assets/clean-scout-idle.py /path/to/original.gif
Never pass the cleaned output as the original: alpha cleanup is cumulative.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def indexed(frame):
    """Preserve the exact source RGB palette and binary transparency for GIF."""
    a = np.asarray(frame)
    opaque = a[:, :, 3] > 0
    colours, indices = np.unique(a[:, :, :3][opaque], axis=0, return_inverse=True)
    if len(colours) > 255:
        raise ValueError('Source has more than 255 opaque colours')
    pixels = np.full(a.shape[:2], 255, dtype='uint8')
    pixels[opaque] = indices
    result = Image.fromarray(pixels, 'P')
    palette = colours.flatten().tolist()
    result.putpalette(palette + [0] * (768 - len(palette)))
    result.info['transparency'] = 255
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('original', type=Path)
    parser.add_argument('--output', type=Path, default=Path('web/public/brand'))
    args = parser.parse_args()
    source = Image.open(args.original)
    if source.size != (800, 450) or source.n_frames != 198:
        raise ValueError('Expected the original 800×450, 198-frame idle GIF')
    loop = source.info.get('loop', 0)
    gif_frames, webp_frames, durations, report = [], [], [], []
    for i in range(source.n_frames):
        source.seek(i)
        a = np.array(source.convert('RGBA'))
        original_alpha = a[:, :, 3].copy()
        # Alpha-only, subtractive filtering removes isolated matte pixels; it
        # cannot add opacity outside the original silhouette or alter RGB.
        median = np.asarray(Image.fromarray(original_alpha)
                            .filter(ImageFilter.MedianFilter(3)))
        alpha = np.minimum(original_alpha, median)
        a[:, :, 3] = alpha
        gif_frames.append(indexed(Image.fromarray(a)))
        feather = np.asarray(Image.fromarray(alpha)
                             .filter(ImageFilter.GaussianBlur(0.45)))
        a[:, :, 3] = np.minimum(alpha, feather)
        webp_frames.append(Image.fromarray(a))
        durations.append(source.info.get('duration', 100))
        report.append({'frame': i,
                       'removed_pixels': int((original_alpha != alpha).sum()),
                       'feathered_pixels': int(((a[:, :, 3] > 0)
                                               & (a[:, :, 3] < 255)).sum())})
    args.output.mkdir(parents=True, exist_ok=True)
    gif_tmp = args.output / '.scout-idle.tmp.gif'
    webp_tmp = args.output / '.scout-idle.tmp.webp'
    gif_frames[0].save(gif_tmp, save_all=True, append_images=gif_frames[1:],
                       duration=durations, loop=loop, disposal=2,
                       transparency=255, optimize=False)
    webp_frames[0].save(webp_tmp, save_all=True, append_images=webp_frames[1:],
                        duration=durations, loop=loop, lossless=True,
                        quality=100, method=4, exact=True)
    gif_tmp.replace(args.output / 'scout-idle.gif')
    webp_tmp.replace(args.output / 'scout-idle.webp')
    print(json.dumps({'frames': len(durations), 'duration_ms': sum(durations),
                      'loop': loop,
                      'removed_pixels': sum(r['removed_pixels'] for r in report),
                      'details': report}, indent=2))


if __name__ == '__main__':
    main()
