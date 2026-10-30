"""Key the frozen service atlas and align projectile cores, retaining authored tails."""
import hashlib
import json
import uuid
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'evidence/materials-20260928-barrage'
DEST = ROOT / 'assets/resources/expansion/projectile-vfx.png'

def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

source = Image.open(OUT / 'source.jpeg').convert('RGB')
assert source.size == (2048, 2048)
atlas = Image.new('RGBA', (1024, 1024))
checks = []
for row in range(4):
    for col in range(4):
        rgb = np.asarray(source.crop((col*512, row*512, (col+1)*512, (row+1)*512))).astype(float)
        r, g, b = rgb[...,0], rgb[...,1], rgb[...,2]
        alpha = 1-np.clip((np.minimum(r,b)-g-12)/70, 0, 1)
        alpha[alpha < .12] = 0
        # Only the central bright core determines the anchor, never the moving tail.
        yy, xx = np.indices(alpha.shape)
        core = (alpha>.98)&(xx>220)&(xx<420)&(yy>150)&(yy<360)&(r>195)&(g>195)
        if row < 2:
            core &= b>150
        assert core.sum()>100
        cx, cy = float(np.median(xx[core])), float(np.median(yy[core]))
        spill = np.maximum(0, np.minimum(r,b)-g)
        rgb[...,0] -= spill
        rgb[...,2] -= spill
        rgba = np.dstack((rgb, alpha*255)).clip(0,255).astype('uint8')
        rgba[alpha==0,:3]=0
        sprite = Image.fromarray(rgba)
        scale = .39
        frame = sprite.transform((256,256), Image.Transform.AFFINE,
            (1/scale,0,cx-128/scale,0,1/scale,cy-128/scale), Image.Resampling.BICUBIC)
        # Bicubic ringing can reintroduce chroma at translucent edges after keying.
        final = np.asarray(frame).astype(int)
        fringe = np.maximum(0,np.minimum(final[...,0],final[...,2])-final[...,1])
        final[...,0] -= fringe
        final[...,2] -= fringe
        frame = Image.fromarray(final.clip(0,255).astype('uint8'))
        box = frame.getchannel('A').getbbox()
        assert box and min(box[0],box[1],256-box[2],256-box[3])>=12, (row,col,box)
        atlas.alpha_composite(frame,(col*256,row*256))
        checks.append({'row':row,'frame':col,'sourceCore':[cx,cy],'scale':scale,'bounds':box,
            'sha256':hashlib.sha256(frame.tobytes()).hexdigest()})
atlas.save(DEST)
meta_path = DEST.with_suffix('.png.meta')
if not meta_path.exists():
    meta=json.loads((ROOT/'assets/resources/expansion/chain-vfx.png.meta').read_text())
    old=meta['uuid'];new=str(uuid.uuid5(uuid.NAMESPACE_URL,'emberline:projectile-vfx-20260928'))
    meta=json.loads(json.dumps(meta).replace(old,new).replace('chain-vfx','projectile-vfx'))
    meta_path.write_text(json.dumps(meta,indent=2))
contact=Image.new('RGB',(1024,1024),'#172221')
contact.paste(atlas,mask=atlas.getchannel('A'))
contact.save(OUT/'contact-dark.png')
light=Image.new('RGB',(1024,1024),'#eee9d6');light.paste(atlas,mask=atlas.getchannel('A'));light.save(OUT/'contact-light.png')
atlas.resize((512,512),Image.Resampling.LANCZOS).save(OUT/'preview.png')
strip=Image.new('RGBA',(704,112),(23,34,33,255))
for row in range(4):
    strip.alpha_composite(atlas.crop((16,row*256+72,192,row*256+184)),(row*176,0))
strip.convert('RGB').save(OUT/'preview-strip.png')
(OUT/'asset-report.json').write_text(json.dumps({'sourceSha256':digest(OUT/'source.jpeg'),
    'outputSha256':digest(DEST),'size':atlas.size,'mode':atlas.mode,
    'rows':['friendly plasma','warden shard','furnace fire','hive spore'],'frames':checks,
    'acceptance':'Four flight states per row. Plasma/shard/spore differences are subtle; fire has pronounced silhouette motion. Core-aligned, not bounding-box aligned. Magenta source is keyed locally; remote alpha not claimed.',
    'batchId':'024fe601-3031-4ddf-a851-fcc76d684790','costCNY':.22},indent=2))
print(json.dumps({'output':str(DEST),'sha256':digest(DEST),'frames':len(checks)}))
