#!/usr/bin/env python3
"""Repair Scout's original GIF matte without regenerating artwork.

Requires Pillow and NumPy. Pass an untouched source GIF (not the output GIF):
  python3 scripts/assets/clean-scout-working.py /path/to/original.gif
Writes the GIF fallback and lossless animated WebP into web/public/brand.
"""
import argparse
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

AFFECTED = {3, 4, 6, 7, *range(15, 26), 33, 37, 38,
            160, 161, 165, *range(173, 184), 191, 192, 194, 195}


def pocket_core(frame):
    """Clear only thick dark pocket interiors; retain two pixels of outline."""
    a = np.asarray(frame)
    dark = ((a[:, :, 0] < 36) & (a[:, :, 1] < 27)
            & (a[:, :, 2] < 25) & (a[:, :, 3] > 0))
    core = np.asarray(Image.fromarray(dark.astype('uint8') * 255)
                      .filter(ImageFilter.MinFilter(5))) > 0
    core[:140] = False
    core[275:] = False
    core[:, :445] = False
    core[:, 530:] = False
    seen = set()
    selected = np.zeros(core.shape, dtype=bool)
    for y, x in zip(*np.where(core)):
        if (y, x) in seen:
            continue
        queue = deque([(y, x)])
        seen.add((y, x))
        component = []
        while queue:
            yy, xx = queue.popleft()
            component.append((yy, xx))
            for q in [(yy, xx + 1), (yy, xx - 1),
                      (yy + 1, xx), (yy - 1, xx)]:
                if (0 <= q[0] < core.shape[0] and 0 <= q[1] < core.shape[1]
                        and core[q] and q not in seen):
                    seen.add(q)
                    queue.append(q)
        if len(component) > 15:
            for point in component:
                selected[point] = True
    return selected


def smooth_webp_edges(frame):
 a=np.array(frame)
 matte=frame.getchannel('A')
 inside=np.asarray(matte.filter(ImageFilter.MinFilter(5)))>0
 boundary=(a[:,:,3]>0)&~inside
 # Pale GIF matte pixels at the border become bright speckles in dark mode.
 fringe=boundary&(a[:,:,:3].min(2)>90)&(np.ptp(a[:,:,:3].astype(float),axis=2)<65)
 colour=a[:,:,:3].copy();colour[a[:,:,3]==0]=255
 minimum=np.array(Image.fromarray(colour).filter(ImageFilter.MinFilter(5)))
 a[fringe,:3]=minimum[fringe]
 # Premultiplied filtering gives newly antialiased pixels their stroke colour,
 # rather than the arbitrary RGB stored in transparent GIF pixels.
 alpha=np.asarray(matte).astype(float)/255
 feather=np.asarray(matte.filter(ImageFilter.GaussianBlur(.7)))
 den=np.asarray(matte.filter(ImageFilter.GaussianBlur(.7))).astype(float)
 for c in range(3):
  weighted=Image.fromarray(np.rint(a[:,:,c]*alpha).astype('uint8'))
  num=np.asarray(weighted.filter(ImageFilter.GaussianBlur(.7))).astype(float)
  edge=(feather>0)&(feather<255)
  a[:,:,c][edge]=np.clip(np.rint(num[edge]*255/np.maximum(den[edge],1)),0,255).astype('uint8')
 a[:,:,3]=feather
 return Image.fromarray(a)


def indexed(frame):
    """Losslessly retain each source frame's RGB colours plus transparency."""
    a = np.array(frame)
    opaque = a[:, :, 3] != 0
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
        raise ValueError('Expected the original 800×450, 198-frame working animation')
    gif_frames, webp_frames, durations, report = [], [], [], []
    for i in range(source.n_frames):
        source.seek(i)
        frame = source.convert('RGBA')
        a = np.array(frame)
        original_alpha = a[:, :, 3].copy()
        pocket = pocket_core(frame) if i in AFFECTED else np.zeros(a.shape[:2], bool)
        a[pocket, 3] = 0
        # Restrict median cleanup to the exterior silhouette: pocket cores retain
        # their full two-pixel border instead of eroding legitimate dark artwork.
        matte = Image.fromarray(original_alpha)
        median = np.asarray(matte.filter(ImageFilter.MedianFilter(3)))
        alpha = np.minimum(original_alpha, median)
        alpha[pocket] = 0
        a[:, :, 3] = alpha
        cleaned = Image.fromarray(a)
        gif_frames.append(indexed(cleaned))
        # Correct pale GIF matte pixels before smoothing the alpha boundary.
        webp_frames.append(smooth_webp_edges(cleaned))
        durations.append(source.info.get('duration', 100))
        report.append({'frame': i, 'pocket_pixels': int(pocket.sum()),
                       'silhouette_pixels': int(((alpha != original_alpha) & ~pocket).sum())})
    args.output.mkdir(parents=True, exist_ok=True)
    gif_tmp = args.output / '.scout-working.tmp.gif'
    webp_tmp = args.output / '.scout-working.tmp.webp'
    gif_frames[0].save(gif_tmp, save_all=True,
                       append_images=gif_frames[1:], duration=durations,
                       loop=0, disposal=2, transparency=255, optimize=False)
    webp_frames[0].save(webp_tmp, save_all=True,
                       append_images=webp_frames[1:], duration=durations,
                       loop=0, lossless=True, quality=100, method=4, exact=True)
    gif_tmp.replace(args.output / 'scout-working.gif')
    webp_tmp.replace(args.output / 'scout-working.webp')
    print(json.dumps({'frames': len(durations), 'duration_ms': sum(durations),
                      'pocket_pixels': sum(r['pocket_pixels'] for r in report),
                      'details': report}, indent=2))


if __name__ == '__main__':
    main()
