#!/usr/bin/env python3
"""Prepare the supplied Scout completion MP4 as a transparent animated WebP.

Requires ffmpeg, Pillow and NumPy. Usage:
  python3 scripts/assets/prepare-scout-complete.py /path/to/complete.mp4
The border-connected cream backdrop is removed without keying Scout's cream
panels. Edge pixels are unmatted against the backdrop to avoid pale fringes.
"""
import argparse
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def exterior(eligible):
    """Scanline flood fill keeps enclosed cream artwork opaque."""
    outside = np.zeros(eligible.shape, dtype=bool)
    stack = [(0, 0)]
    height, width = eligible.shape
    while stack:
        y, x = stack.pop()
        if outside[y, x] or not eligible[y, x]:
            continue
        blocked = np.flatnonzero(~eligible[y, :x])
        left = int(blocked[-1] + 1) if len(blocked) else 0
        blocked = np.flatnonzero(~eligible[y, x:])
        right = int(x + blocked[0]) if len(blocked) else width
        outside[y, left:right] = True
        for yy in (y - 1, y + 1):
            if 0 <= yy < height:
                span = eligible[yy, left:right] & ~outside[yy, left:right]
                starts = np.flatnonzero(span & np.r_[True, ~span[:-1]])
                stack.extend((yy, int(left + start)) for start in starts)
    return outside


def cutout(rgb):
    pixels = np.asarray(rgb).astype(np.float32)
    # The outside background and floor shadow are near-neutral pale cream.
    eligible = (pixels.min(axis=2) > 185) & (np.ptp(pixels, axis=2) < 48)
    outside = exterior(eligible)
    alpha = np.where(outside, 0, 255).astype('uint8')
    inner = np.asarray(Image.fromarray(alpha).filter(ImageFilter.MinFilter(3)))
    edge = (alpha > 0) & (inner == 0)
    background = np.median(pixels[:20].reshape(-1, 3), axis=0)
    # Scout's exterior is a dark brown stroke. Undo backdrop mixing only at
    # its one-pixel boundary; interior artwork colours remain untouched.
    fraction = np.clip(np.max((background - pixels) / (background - [30, 18, 10]), axis=2), .05, 1)
    pixels[edge] = np.clip((pixels[edge] - (1 - fraction[edge, None]) * background) / fraction[edge, None], 0, 255)
    alpha[edge] = np.rint(fraction[edge] * 255).astype('uint8')
    pixels[alpha == 0] = 0
    return Image.fromarray(np.dstack([pixels.astype('uint8'), alpha]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('video', type=Path)
    parser.add_argument('--output', type=Path, default=Path('web/public/brand'))
    parser.add_argument('--start', type=float, default=0,
                        help='Opening seconds to trim (default: 0)')
    parser.add_argument('--end', type=float, default=10,
                        help='End timestamp in the source video (default: 10)')
    parser.add_argument('--speed', type=float, default=1.4,
                        help='Playback speed multiplier (default: 1.4)')
    args = parser.parse_args()
    if args.start < 0 or args.end <= args.start or args.speed <= 0:
        parser.error('--start must be nonnegative, --end must be after --start, and --speed must be positive')
    width, height, fps = 800, 450, 24
    decoder = subprocess.Popen(['ffmpeg', '-v', 'error', '-ss', str(args.start), '-i', str(args.video),
                                '-t', str(args.end - args.start),
                                '-an', '-vf', f'scale={width}:{height},fps={fps}',
                                '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    frames = []
    while True:
        data = decoder.stdout.read(width * height * 3)
        if not data:
            break
        if len(data) != width * height * 3:
            raise RuntimeError('Incomplete decoded frame')
        frames.append(cutout(Image.frombytes('RGB', (width, height), data)))
    if decoder.wait() != 0 or not frames:
        raise RuntimeError('Video decoding failed')
    args.output.mkdir(parents=True, exist_ok=True)
    thumbs_up = min(len(frames) - 1, max(0, round((5 - args.start) * fps)))
    still = frames[thumbs_up].copy()
    # Retain every gesture/step frame. Sample redundant neutral poses more
    # sparsely while keeping the actual first and last poses for the loop.
    selected = [i for i in range(len(frames))
                if 1.5 <= args.start + i / fps < 8.4
                or i % 4 == 0 or i in (0, len(frames) - 1)]
    frames = [frames[i] for i in selected]
    # The source's neutral endpoints differ slightly. Blend the last four
    # neutral poses toward the first, in premultiplied colour, to avoid a snap.
    first = np.asarray(frames[0]).astype(float) / 255
    blend_count = min(4, len(frames)) if args.start < 1.5 and args.end > 8.4 else 0
    for offset in range(blend_count):
        index = len(frames) - blend_count + offset
        last = np.asarray(frames[index]).astype(float) / 255
        weight = (offset + 1) / blend_count
        alpha = (1 - weight) * last[:, :, 3:] + weight * first[:, :, 3:]
        rgb = ((1 - weight) * last[:, :, :3] * last[:, :, 3:]
               + weight * first[:, :, :3] * first[:, :, 3:])
        rgba = np.concatenate([rgb / np.maximum(alpha, 1e-8), alpha], axis=2)
        frames[index] = Image.fromarray(np.rint(rgba * 255).astype('uint8'))
    # Keep frame durations above browser minimum-delay thresholds.
    playback_fps = fps * args.speed
    durations = [round((i + 1) * 1000 / playback_fps) - round(i * 1000 / playback_fps) for i in range(len(frames))]
    target = args.output / 'scout-ready.webp'
    temporary = target.with_suffix('.tmp.webp')
    frames[0].save(temporary, save_all=True, append_images=frames[1:],
                   duration=durations, loop=0, quality=90, method=4,
                   lossless=True, exact=True)
    temporary.replace(target)
    still.save(args.output / 'scout-ready-still.png')
    # Side-by-side QA on light and dark app backgrounds.
    sheet = Image.new('RGB', (width * 2, height * 2))
    for row, index in enumerate([0, len(frames) - 1]):
        for col, colour in enumerate(['#f6f0e5', '#242535']):
            backdrop = Image.new('RGBA', (width, height), colour)
            backdrop.alpha_composite(frames[index])
            sheet.paste(backdrop.convert('RGB'), (col * width, row * height))
    sheet.save('/private/tmp/scout-complete-cutout-qa.png')
    print(f'{len(frames)} frames, {sum(durations)}ms, {target.stat().st_size} bytes', flush=True)


if __name__ == '__main__':
    main()
