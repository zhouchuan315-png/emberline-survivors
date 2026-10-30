"""Check exported pixels, alpha margins and animation changes for the new atlas."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'evidence/runtime-barrage-20260928'
atlas_path = ROOT / 'assets/resources/expansion/projectile-vfx.png'
atlas = Image.open(atlas_path).convert('RGBA')
checks = []
for row in range(4):
    frames = []
    for col in range(4):
        frame = atlas.crop((col*256,row*256,(col+1)*256,(row+1)*256))
        a = np.asarray(frame)
        assert a[...,3].min()==0 and a[...,3].max()==255
        box = frame.getchannel('A').getbbox()
        assert min(box[0],box[1],256-box[2],256-box[3]) >= 12
        visible = a[a[...,3]>32].astype(int)
        assert not ((visible[:,0]>visible[:,1]+20)&(visible[:,2]>visible[:,1]+20)).any(), 'magenta fringe'
        frames.append(np.asarray(frame).astype(int))
    changes = [int(np.abs(frames[i]-frames[(i+1)%4]).sum()) for i in range(4)]
    assert min(changes)>0
    checks.append({'row':row,'loopFramePixelChanges':changes})

pixels = []
for viewport in ['desktop','mobile']:
    for boss in ['warden','furnace','hive']:
        on = np.asarray(Image.open(OUT/f'{viewport}-{boss}-phase3.png').convert('RGB')).astype(int)
        off = np.asarray(Image.open(OUT/f'{viewport}-{boss}-hidden.png').convert('RGB')).astype(int)
        mask = np.max(np.abs(on-off),axis=2)>20
        ys,xs = np.where(mask)
        assert len(xs)>(200 if viewport=='desktop' else 40), (viewport,boss,len(xs))
        # Projectile nodes belong to the world; the opaque HUD remains above them.
        assert int(ys.min())>100
        pixels.append({'viewport':viewport,'boss':boss,'changedPixels':len(xs),
            'bounds':[int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())]})
report={'result':'passed','textureSha256':hashlib.sha256(atlas_path.read_bytes()).hexdigest(),
        'alphaAndAnimation':checks,'actualRenderedPixels':pixels}
(OUT/'pixel-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
