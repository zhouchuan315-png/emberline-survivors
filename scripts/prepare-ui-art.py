"""Derive eight UI sprites from frozen service originals; keep stable Creator UUIDs."""
from pathlib import Path
import json, hashlib, uuid
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
E = ROOT / 'evidence/materials-20260924-ui'
OUT = ROOT / 'assets/resources/ui'
OUT.mkdir(parents=True, exist_ok=True)
batch = json.loads((E / 'batch-latest.json').read_text())['result']
assert batch['completed_count'] == batch['total_count'] == 2 and batch['failed_count'] == 0
checks = []
contact = Image.new('RGB', (1100, 640), '#26332f')

def cut_key(image):
    a = np.array(image.convert('RGB')).astype(float)
    # The service rendered hot pink rather than pure magenta: select chroma, never brightness.
    key = np.minimum(a[:, :, 0] - a[:, :, 1], a[:, :, 2] - a[:, :, 1])
    alpha = 1 - np.clip((key - 20) / 40, 0, 1)
    alpha[alpha < .08] = 0
    edge = alpha < .98
    a[edge, 0] = np.minimum(a[edge, 0], a[edge, 1] + 20)
    a[edge, 2] = np.minimum(a[edge, 2], a[edge, 1] + 20)
    a[alpha == 0] = 0
    return Image.fromarray(np.uint8(np.dstack((a, alpha * 255))), 'RGBA')

for material in batch['materials']:
    assert material['generate_result']['success'] and not material['generate_result']['errors']
    assert material['results'] and not material['action_results']
    sheet = material['material_id'].removeprefix('emberline-ui-20260924-')
    source = E / (sheet + '-original.jpeg')
    image = Image.open(source)
    assert image.size == (2048, 2048)
    keyed = cut_key(image)
    names = ['panel', 'secondary', 'primary', 'card'] if sheet == 'plates' else ['health', 'reload', 'dash', 'pause']
    for i, name in enumerate(names):
        # These exact four rows / two-by-two cells were visually checked against this batch.
        bounds = (0, i * 512, 2048, (i + 1) * 512) if sheet == 'plates' else (i % 2 * 1024, i // 2 * 1024, (i % 2 + 1) * 1024, (i // 2 + 1) * 1024)
        cell = keyed.crop(bounds)
        bbox = cell.getbbox()
        assert bbox
        cell = cell.crop(bbox)
        size = (512, 112) if sheet == 'plates' else (128, 128)
        cell.thumbnail((size[0] - 4, size[1] - 4), Image.Resampling.LANCZOS)
        final = Image.new('RGBA', size)
        final.alpha_composite(cell, ((size[0] - cell.width) // 2, (size[1] - cell.height) // 2))
        path = OUT / (name + '.png')
        final.save(path)
        meta = path.with_suffix('.png.meta')
        if not meta.exists():
            template = json.loads((ROOT / 'assets/resources/art/arena.png.meta').read_text())
            old = template['uuid']
            new = str(uuid.uuid5(uuid.NAMESPACE_URL, 'emberline/ui/' + name))
            metadata = json.loads(json.dumps(template).replace(old, new).replace('arena', name))
        else:
            metadata = json.loads(meta.read_text())
        data = metadata['subMetas']['f9941']['userData']
        data.update(width=size[0], height=size[1], rawWidth=size[0], rawHeight=size[1], trimX=0, trimY=0,
                    offsetX=0, offsetY=0, trimType='none', packable=False,
                    borderTop=24 if sheet == 'plates' else 0, borderBottom=24 if sheet == 'plates' else 0,
                    borderLeft=24 if sheet == 'plates' else 0, borderRight=24 if sheet == 'plates' else 0)
        data.pop('vertices', None)
        metadata['userData']['hasAlpha'] = True
        meta.write_text(json.dumps(metadata, indent=2))
        pixels = np.array(final)
        assert pixels[:, :, 3].min() == 0 and pixels[:, :, 3].max() == 255
        assert not np.any((pixels[:, :, 0] > pixels[:, :, 1].astype(int) + 100) &
                          (pixels[:, :, 2] > pixels[:, :, 1].astype(int) + 40) & (pixels[:, :, 3] > 90))
        checks.append(dict(name=name, source=source.name, crop=bounds, bbox=bbox, size=size,
                           sourceHash=hashlib.sha256(source.read_bytes()).hexdigest(),
                           sha256=hashlib.sha256(path.read_bytes()).hexdigest(), uuid=metadata['uuid'],
                           alphaRange=[0, 255], nineSlice=sheet == 'plates'))
        x, y = (25, 20 + i * 148) if sheet == 'plates' else (610 + i % 2 * 225, 65 + i // 2 * 285)
        contact.paste(final, (x, y), final)
        ImageDraw.Draw(contact).text((x, y + final.height + 8), name, fill='#eee9d6')
contact.save(E / 'contact.png')
(E / 'artifact-checks.json').write_text(json.dumps(dict(assets=checks, costYuan=sum(m['generate_result']['consume']['consumption_indicator']['usage'] for m in batch['materials']),
    validation='Local decoded dimensions, alpha, chroma spill, stable UUID and slice metadata; remote evaluators were not used.'), indent=2))
print('Prepared', len(checks), 'UI sprites')
