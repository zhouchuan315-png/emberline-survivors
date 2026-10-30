"""Derive a stable ground prop + lamp animation from the frozen generated art.

The AI sheet is not accepted as a literal sequence: shell/support geometry changes.
Use one reviewed shell and only the central light of the bright generated frame.
"""
import hashlib
import json
import math
import uuid
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'evidence/materials-20260929-mines'
DEST = ROOT / 'assets/resources/expansion/mine-vfx.png'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

source = Image.open(OUT / 'source.jpeg').convert('RGB')
assert source.size == (2048, 2048)
assert sha(OUT / 'source.jpeg') == '1f0a9ad2a40089af3c6a03246d6a3f46cf67aeb56d616d9f9769f36a3d416159'
# Reviewed nonuniform source grid; exclude the generated magenta dividers.
body = np.array(source.crop((68, 552, 540, 1020))).astype(float)
lamp = source.crop((1034, 552, 1490, 1020))
# Align the generated light by its center; its casing is deliberately discarded.
lamp = lamp.transform((472, 468), Image.Transform.AFFINE, (1, 0, -4, 0, 1, 1), Image.Resampling.BICUBIC)
lamp = np.array(lamp).astype(float)
r, g, b = body[..., 0], body[..., 1], body[..., 2]
key = np.maximum(0, np.minimum(r, b)-g)
alpha = 1-np.clip((key-10)/85, 0, 1)
alpha[alpha < .10] = 0
# Suppress JPEG magenta fringes, preserving warm white highlights and dark metal.
body[..., 0] -= key
body[..., 2] -= key
yy, xx = np.indices(alpha.shape)
radius = np.hypot(xx-238, yy-249)
light_mask = (1-np.clip((radius-42)/58, 0, 1))
light_mask = (light_mask*light_mask*(3-2*light_mask))[..., None]
dim_mask = (1-np.clip((radius-22)/22, 0, 1))[..., None]
atlas = Image.new('RGBA', (1024, 1024))
frames = []
checks = []
for i in range(16):
    energy = [0, .10, .28, .50][i] if i < 4 else .50+.40*math.sin((i-4)*2*math.pi/12)
    # Body is fixed. Only the existing generated lamp region is cross-faded.
    rgb = body*(1-light_mask*energy)+lamp*light_mask*energy
    if i < 4:
        rgb *= 1-dim_mask*(.80*(1-i/3))
    rgba = np.dstack((rgb, alpha*255)).clip(0, 255).astype('uint8')
    rgba[alpha == 0, :3] = 0
    frame = Image.fromarray(rgba).transform((256, 256), Image.Transform.AFFINE,
        (1/.53, 0, 238-128/.53, 0, 1/.36, 249-128/.36), Image.Resampling.BICUBIC)
    final = np.array(frame).astype(int)
    spill = np.maximum(0, np.minimum(final[..., 0], final[..., 2])-final[..., 1])
    final[..., 0] -= spill; final[..., 2] -= spill
    final[final[..., 3] == 0, :3] = 0
    frame = Image.fromarray(final.clip(0, 255).astype('uint8'))
    bounds = frame.getchannel('A').getbbox()
    assert bounds and min(bounds[0], bounds[1], 256-bounds[2], 256-bounds[3]) >= 20, bounds
    atlas.alpha_composite(frame, (i%4*256, i//4*256))
    checks.append({'frame': i, 'stage': 'arming' if i < 4 else 'armed', 'energy': energy,
        'bounds': bounds, 'sha256': hashlib.sha256(frame.tobytes()).hexdigest()})
    frames.append(frame)
arrays = np.array([np.array(f) for f in frames])
assert all(np.array_equal(arrays[0, ..., 3], f[..., 3]) for f in arrays)
yy, xx = np.indices((256, 256))
shell = ((xx-128)/.53)**2+((yy-128)/.36)**2 > 104**2
assert all(np.array_equal(arrays[4, shell], f[shell]) for f in arrays[4:])
diff = [float(np.abs(arrays[i].astype(float)-arrays[4+(i-3)%12].astype(float)).mean()) for i in range(4,16)]
assert diff[-1] <= max(diff[:-1])*1.1
atlas.save(DEST)
meta_path = DEST.with_suffix('.png.meta')
if not meta_path.exists():
    meta = json.loads((ROOT/'assets/resources/expansion/projectile-vfx.png.meta').read_text())
    old = meta['uuid']; new = str(uuid.uuid5(uuid.NAMESPACE_URL, 'emberline:mine-vfx-20260929'))
    meta = json.loads(json.dumps(meta).replace(old, new).replace('projectile-vfx', 'mine-vfx'))
    meta_path.write_text(json.dumps(meta, indent=2)+'\n')
for name, bg in [('dark', '#172221'), ('light', '#eee9d6')]:
    contact = Image.new('RGBA', atlas.size, bg); contact.alpha_composite(atlas)
    contact.convert('RGB').save(OUT/f'contact-{name}.png')
preview = Image.new('RGBA', (720, 210), '#172221')
draw = ImageDraw.Draw(preview)
for col, idx in enumerate([0, 4, 7, 13]):
    preview.alpha_composite(frames[idx].resize((160, 160), Image.Resampling.LANCZOS), (col*180+10, 0))
    draw.text((col*180+52, 166), ['ARMING', 'ARMED', 'PULSE', 'IDLE'][col], fill='#eee9d6')
preview.convert('RGB').save(OUT/'preview.png')
gif = []
for f in frames[4:]:
    bg = Image.new('RGBA', f.size, '#172221'); bg.alpha_composite(f); gif.append(bg.convert('RGB'))
gif[0].save(OUT/'armed-preview.gif', save_all=True, append_images=gif[1:], duration=100, loop=0)
report = {'sourceSha256': sha(OUT/'source.jpeg'), 'outputSha256': sha(DEST),
    'size': atlas.size, 'mode': atlas.mode, 'frames': checks, 'idleAdjacentDifferences': diff,
    'alphaIdenticalAcrossAllFrames': True, 'idleShellPixelsIdentical': True,
    'sourceBodyRect': [68,552,540,1020], 'sourceLightRect': [1034,552,1490,1020],
    'normalization': 'Single fixed anchor (238,249), scale .53 x .36 for a ground-plane view; no per-frame bbox scaling.',
    'acceptance': 'Generated geometry varies between source frames: rejected as a literal sequence. One generated casing retained, bright generated center composited locally into 4 arming + 12 seamless light frames. Transparency keyed locally, not native service alpha.',
    'batchId': '9a1f5f12-5a1d-48c5-a899-5ca298d50e17', 'costCNY': .22}
(OUT/'asset-report.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps({'output': str(DEST), 'sha256': sha(DEST), 'frames': len(frames), 'bounds': checks[0]['bounds']}))
