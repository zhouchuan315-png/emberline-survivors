"""Derive fixed-size VFX frames from immutable service originals, without clipping."""
from __future__ import annotations

import argparse
import hashlib
import json
import uuid
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'evidence/materials-20260928-power-vfx'
OUTPUT = ROOT / 'assets/resources/expansion'
NAMES = ('blast-vfx', 'chain-vfx', 'frenzy-vfx')
CELL = 256
SAFE_SIZE = 224
# Audited against the original: the blast grid starts at y=110, not at y=0.
BOUNDS = {'blast-vfx': ([32, 528, 1024, 1520, 2016], [110, 582, 1054, 1524, 1996])}


def frame_from_sheet(image: Image.Image, index: int, name: str) -> Image.Image:
    xs, ys = BOUNDS.get(name, (list(range(0, 2049, 512)), list(range(0, 2049, 512))))
    col, row = index % 4, index // 4
    margin = 8
    pixels = np.asarray(image.crop((xs[col]+margin, ys[row]+margin,
                                   xs[col+1]-margin, ys[row+1]-margin)).convert('RGB'), dtype=np.float32)
    magenta = np.minimum(pixels[:, :, 0], pixels[:, :, 2]) - pixels[:, :, 1]
    alpha = np.clip((112.0-magenta)/72.0, 0.0, 1.0)
    spill = alpha < .985
    pixels[spill, 0] = np.minimum(pixels[spill, 0], pixels[spill, 1]+28)
    pixels[spill, 2] = np.minimum(pixels[spill, 2], pixels[spill, 1]+28)
    pixels[alpha == 0] = 0
    tile = Image.fromarray(np.dstack((pixels, alpha*255)).clip(0, 255).astype(np.uint8))
    # One scale for the ENTIRE sequence. Preserve the authored cell anchor rather than
    # centering each smoke/debris bounding box (which makes later frames visibly jump).
    span = max(max(b-a-2*margin for a, b in zip(xs, xs[1:])),
               max(b-a-2*margin for a, b in zip(ys, ys[1:])))
    scale = SAFE_SIZE/span
    size = (round(tile.width*scale), round(tile.height*scale))
    assert max(size) <= SAFE_SIZE < CELL
    tile = tile.resize(size, Image.Resampling.LANCZOS)
    out = Image.new('RGBA', (CELL, CELL))
    out.alpha_composite(tile, ((CELL-tile.width)//2, (CELL-tile.height)//2))
    return out


def write_meta(path: Path, name: str) -> None:
    meta = path.with_suffix('.png.meta')
    if meta.exists():
        return  # Preserve the resource identity and the Creator import configuration.
    template = json.loads((ROOT/'assets/resources/art/arena.png.meta').read_text())
    old_uuid = template['uuid']
    new_uuid = str(uuid.uuid5(uuid.NAMESPACE_URL, f'emberline/power-vfx/{name}'))
    template = json.loads(json.dumps(template).replace(old_uuid, new_uuid).replace('arena', name))
    template['userData']['hasAlpha'] = True
    for sub in template.get('subMetas', {}).values():
        data = sub.get('userData', {})
        for key, value in (('width', 1024), ('height', 1024), ('rawWidth', 1024), ('rawHeight', 1024),
                           ('trimX', 0), ('trimY', 0), ('trimType', 'none')):
            if key in data:
                data[key] = value
        data.pop('vertices', None)
    meta.write_text(json.dumps(template, ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--names', nargs='+', choices=NAMES, default=['blast-vfx'])
    parser.add_argument('--evidence', default='evidence/materials-20260928-explosion-fix')
    args = parser.parse_args()
    evidence = ROOT/args.evidence
    evidence.mkdir(parents=True, exist_ok=True)
    checks = []
    contact = Image.new('RGB', (1040, len(args.names)*1080), '#18251f')
    draw = ImageDraw.Draw(contact)
    for ni, name in enumerate(args.names):
        raw = SOURCE/f'{name}-original.jpeg'
        image = Image.open(raw).convert('RGB')
        assert image.size == (2048, 2048)
        atlas = Image.new('RGBA', (1024, 1024))
        frames = []
        for i in range(16):
            frame = frame_from_sheet(image, i, name)
            alpha = np.asarray(frame)[:, :, 3]
            border = np.concatenate((alpha[:12, :].ravel(), alpha[-12:, :].ravel(),
                                     alpha[:, :12].ravel(), alpha[:, -12:].ravel()))
            assert not border.any(), (name, i, 'clipped/bleeding edge')
            atlas.alpha_composite(frame, (i%4*CELL, i//4*CELL))
            frames.append({'frame': i, 'bbox': frame.getbbox(), 'borderAlphaMax': int(border.max()),
                           'sha256': hashlib.sha256(frame.tobytes()).hexdigest()})
        output = OUTPUT/f'{name}.png'
        prior_hash = hashlib.sha256(output.read_bytes()).hexdigest() if output.exists() else None
        atlas.save(output);write_meta(output, name)
        draw.text((8, ni*1080+8), name+' / shared scale, 12px transparent guard', fill='white')
        contact.paste(atlas, (8, ni*1080+32), atlas)
        checks.append({'name': name, 'source': str(raw.relative_to(ROOT)),
                       'sourceSha256': hashlib.sha256(raw.read_bytes()).hexdigest(),
                       'output': str(output.relative_to(ROOT)), 'priorSha256': prior_hash,
                       'outputSha256': hashlib.sha256(output.read_bytes()).hexdigest(),
                       'size': atlas.size, 'frames': frames, 'remoteSubmissions': 0, 'cost': 0})
    contact.save(evidence/'prepared-contact.png')
    (evidence/'artifact-checks.json').write_text(json.dumps(checks, ensure_ascii=False, indent=2))
    print(json.dumps({'names': args.names, 'framesChecked': len(checks)*16, 'transparentGuard': 12}))


if __name__ == '__main__':
    main()
