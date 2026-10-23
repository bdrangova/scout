#!/usr/bin/env python3
"""Add two optical-flow frames between Scout's original 10fps animation poses.

Requires Pillow, NumPy and opencv-python-headless. Use a cleaned, uninterpolated
198-frame WebP as input. The GIF fallback is deliberately left unchanged.
"""
import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, _webp


def grayscale(rgba):
    alpha = rgba[:, :, 3:4].astype(np.float32) / 255
    opaque = rgba[:, :, :3] * alpha + 128 * (1 - alpha)
    return cv2.cvtColor(opaque.astype('uint8'), cv2.COLOR_RGB2GRAY)


def premultiply(rgba):
    values = rgba.astype(np.float32) / 255
    values[:, :, :3] *= values[:, :, 3:4]
    return values


def unpremultiply(values):
    alpha = np.clip(values[:, :, 3:4], 0, 1)
    rgb = np.clip(values[:, :, :3] / np.maximum(alpha, 1e-8), 0, 1)
    rgb[alpha[:, :, 0] < .5 / 255] = 0
    return Image.fromarray(np.rint(np.concatenate([rgb, alpha], axis=2) * 255).astype('uint8'))


def between(first, second, engine, grid, protect_paper=False, statistics=None):
    gray0, gray1 = grayscale(first), grayscale(second)
    forward = engine.calc(gray0, gray1, None)
    backward = engine.calc(gray1, gray0, None)
    if protect_paper:
        # At face/paper occlusions, an inconsistent flow can stretch white
        # paper pixels into the transparent gap. Keep the clean source poses
        # for those brief crossings instead of inventing a false surface.
        destination = grid + forward
        reverse_at_destination = cv2.remap(
            backward, destination[:, :, 0], destination[:, :, 1],
            cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        error = np.linalg.norm(forward + reverse_at_destination, axis=2)
        x, y = grid[:, :, 0], grid[:, :, 1]
        gap_region = (x >= 430) & (x < 535) & (y >= 115) & (y < 285)
        paper = ((first[:, :, :3].min(axis=2) > 115)
                 & (np.ptp(first[:, :, :3].astype(float), axis=2) < 80)
                 & (first[:, :, 3] > 100))
        if np.count_nonzero(gap_region & paper & (error > 5)) > 500:
            if statistics is not None:
                statistics['protected_pairs'] += 1
            yield Image.fromarray(first)
            yield Image.fromarray(second)
            return
    rgba0, rgba1 = premultiply(first), premultiply(second)
    for fraction in (1 / 3, 2 / 3):
        maps = []
        for flow, weight in ((forward, fraction), (backward, 1 - fraction)):
            coordinates = grid.copy()
            # Invert the forward displacement field at the intermediate time.
            for _ in range(3):
                displacement = cv2.remap(flow, coordinates[:, :, 0], coordinates[:, :, 1],
                                         cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
                coordinates = grid - weight * displacement
            maps.append(coordinates)
        warped0 = cv2.remap(rgba0, maps[0][:, :, 0], maps[0][:, :, 1],
                            cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        warped1 = cv2.remap(rgba1, maps[1][:, :, 0], maps[1][:, :, 1],
                            cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        yield unpremultiply((1 - fraction) * warped0 + fraction * warped1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--preview', type=Path)
    parser.add_argument('--protect-paper-crossings', action='store_true',
                        help='Use source poses when paper/face flow is unreliable (automatic for scout-working)')
    args = parser.parse_args()
    if not args.output and not args.preview:
        parser.error('Specify --output or --preview')
    source = Image.open(args.source)
    if source.n_frames != 198 or source.size != (800, 450):
        parser.error('Expected cleaned 800×450, 198-frame source; do not re-interpolate output')
    engine = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    engine.setFinestScale(0)
    cv2.setNumThreads(4)
    y, x = np.mgrid[:450, :800].astype(np.float32)
    grid = np.stack([x, y], axis=2)
    protect_paper = args.protect_paper_crossings or args.source.stem == 'scout-working'
    if args.preview:
        sheet = Image.new('RGB', (1600, 900), '#282632')
        for row, index in enumerate((3, 40, 58, 80)):
            source.seek(index); first = np.array(source.convert('RGBA'))
            source.seek(index + 1); second = np.array(source.convert('RGBA'))
            poses = [Image.fromarray(first), *between(first, second, engine, grid, protect_paper), Image.fromarray(second)]
            for col, pose in enumerate(poses):
                backdrop = Image.new('RGBA', pose.size, '#282632'); backdrop.alpha_composite(pose)
                sheet.paste(backdrop.convert('RGB').resize((400, 225)), (400 * col, 225 * row))
        sheet.save(args.preview)
    if not args.output:
        return
    encoder = _webp.WebPAnimEncoder(source.size, 0, 0, False, 9, 17, False, False)
    statistics = {'protected_pairs': 0}
    for index in range(source.n_frames):
        source.seek(index)
        if source.info.get('duration', 100) != 100:
            raise ValueError('Expected 100ms source frames')
        first = np.array(source.convert('RGBA'))
        source.seek((index + 1) % source.n_frames)
        second = np.array(source.convert('RGBA'))
        poses = [Image.fromarray(first), *between(first, second, engine, grid, protect_paper, statistics)]
        for offset, pose in zip((0, 33, 67), poses):
            # Preserve source poses losslessly; compress only synthetic frames.
            encoder.add(pose.getim(), index * 100 + offset, offset == 0, 90, 100, 3)
        if (index + 1) % 20 == 0:
            print(f'{args.source.name}: {index + 1}/198 original poses processed', flush=True)
    encoder.add(None, 19800, True, 90, 100, 0)
    data = encoder.assemble('', '', '')
    temporary = args.output.with_suffix('.tmp.webp')
    temporary.write_bytes(data)
    temporary.replace(args.output)
    print(f'{args.output}: 30fps timeline, 19.8s, {len(data)} bytes; {statistics}', flush=True)


if __name__ == '__main__':
    main()
