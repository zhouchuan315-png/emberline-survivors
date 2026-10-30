"""Host-side QA for the generated full-body motion atlases."""
from pathlib import Path
from PIL import Image
import hashlib,json,numpy as np
R=Path(__file__).resolve().parents[1];O=R/'assets/resources/roster';E=R/'evidence/materials-20260928-fullbody-motion'
rows=[]
for hero in ('vanguard','scout','medic'):
 for clip in ('run','idle','reload','fire'):
  p=O/f'{hero}-{clip}.png';assert p.exists() and Image.open(p).size==(1024,1024)
  im=Image.open(p).convert('RGBA');frames=[im.crop((i%4*256,i//4*256,(i%4+1)*256,(i//4+1)*256)) for i in range(16)]
  boxes=[f.getbbox() for f in frames];assert all(b and b[0]>3 and b[1]>3 and b[2]<253 and b[3]<253 for b in boxes),(hero,clip,boxes)
  hashes=[hashlib.sha256(f.tobytes()).hexdigest() for f in frames];assert len(set(hashes))>=8
  rows.append({'hero':hero,'clip':clip,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'frameBounds':boxes,'uniqueFrames':len(set(hashes)),'metaSha256':hashlib.sha256((p.with_suffix('.png.meta')).read_bytes()).hexdigest()})
checks=json.loads((E/'fullbody-animation-checks.json').read_text());assert all(x['head_variants']>=8 for x in checks['assets'])
(E/'fullbody-motion-qa.json').write_text(json.dumps({'assets':rows,'runHeadVariants':{x['hero']:x['head_variants'] for x in checks['assets']},'verified':True},ensure_ascii=False,indent=2));print('fullbody motion QA passed:',len(rows),'atlases')
