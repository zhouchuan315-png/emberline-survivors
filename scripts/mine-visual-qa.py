"""Check transparent source frames and actual WebGL screenshot pixel differences."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'evidence/runtime-mines-20260929'
asset = ROOT/'assets/resources/expansion/mine-vfx.png'
atlas = Image.open(asset).convert('RGBA')
assert atlas.size == (1024, 1024)
frames = []
for i in range(16):
    f = atlas.crop((i%4*256, i//4*256, (i%4+1)*256, (i//4+1)*256))
    a = np.array(f).astype(int); bounds = f.getchannel('A').getbbox()
    assert a[...,3].min() == 0 and a[...,3].max() == 255
    assert min(bounds[0],bounds[1],256-bounds[2],256-bounds[3]) >= 20
    visible = a[a[...,3] > 32]
    assert not ((visible[:,0] > visible[:,1]+20)&(visible[:,2] > visible[:,1]+20)).any()
    frames.append(a)
assert all(np.array_equal(frames[0][...,3], f[...,3]) for f in frames)
assert all(np.abs(frames[i]-frames[4+(i-3)%12]).sum() > 0 for i in range(4,16))
checks = []
for tag in ['desktop','mobile']:
    on = np.array(Image.open(OUT/f'{tag}-armed.png').convert('RGB')).astype(int)
    off = np.array(Image.open(OUT/f'{tag}-hidden.png').convert('RGB')).astype(int)
    mask = np.max(np.abs(on-off),axis=2)>15
    ys,xs = np.where(mask)
    assert len(xs) > (220 if tag == 'desktop' else 65), (tag,len(xs))
    assert ys.min() > 100 and ys.max() < len(on)-100
    checks.append({'viewport':tag,'changedPixels':len(xs),'bounds':[int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())]})
meta = json.loads(asset.with_suffix('.png.meta').read_text())
assert meta['subMetas']['f9941']['userData']['trimType'] == 'none'
assert meta['subMetas']['f9941']['userData']['packable'] is False
report = {'result':'passed','textureSha256':hashlib.sha256(asset.read_bytes()).hexdigest(),
    'frames':16,'transparentMarginMin':20,'stableAlpha':True,'magentaFringe':False,'actualRenderedPixels':checks}
(OUT/'pixel-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
