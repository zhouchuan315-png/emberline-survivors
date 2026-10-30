"""File, loop seam, metadata and generation receipt checks for the anime round."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,hashlib,numpy as np,shutil
R=Path(__file__).resolve().parents[1];E=R/'evidence/materials-20260928-anime-heroes';O=R/'assets/resources/roster';entries=[]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
for name in ('vanguard','scout','medic'):
 for suffix in ('','-run'):
  p=O/f'{name}{suffix}.png';meta=p.with_suffix('.png.meta');old=E/'source-before/assets/resources/roster'/meta.name
  assert meta.read_bytes()==old.read_bytes(),meta
  im=Image.open(p);assert im.mode=='RGBA' and im.size==(1024,1024)
  frames=[im.crop((i%4*256,i//4*256,(i%4+1)*256,(i//4+1)*256)) for i in range(16)]
  for i,f in enumerate(frames):
   b=f.getbbox();assert b and b[0]>3 and b[1]>3 and b[2]<253 and b[3]<253,(name,suffix,i,b)
  deltas=[float(np.abs(np.array(frames[(i+1)%16]).astype(float)-np.array(frames[i]).astype(float)).mean()) for i in range(16)]
  if suffix:
   assert all(f.crop((0,0,256,95)).tobytes()==frames[0].crop((0,0,256,95)).tobytes() for f in frames)
   assert deltas[-1]<=max(deltas[:-1])*1.2
  entries.append({'path':str(p.relative_to(R)),'sha256':sha(p),'metadataSha256':sha(meta),'unchangedMetadata':True,'frameBounds':[f.getbbox() for f in frames],'adjacentDelta':deltas})
for name in ('vanguard-portrait','scout-portrait','medic-portrait','cover-wide','cover-tall'):
 p=O/(name+'.png');im=Image.open(p);entries.append({'path':str(p.relative_to(R)),'size':im.size,'sha256':sha(p)})
font=ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc',20);gifs=[]
for i in range(16):
 row=Image.new('RGB',(768,286),'#213438');d=ImageDraw.Draw(row)
 for k,(name,label) in enumerate([('vanguard','烬火 · 突击手'),('scout','夜隼 · 侦察兵'),('medic','白芷 · 医师')]):
  im=Image.open(O/(name+'-run.png'));f=im.crop((i%4*256,i//4*256,(i%4+1)*256,(i//4+1)*256));row.paste(f,(k*256,0),f)
  d.line((k*256+45,233,k*256+215,233),fill='#426068');d.text((k*256+60,253),label,font=font,fill='#f6eddb')
 gifs.append(row)
gifs[0].save(E/'three-heroines-walk.gif',save_all=True,append_images=gifs[1:],duration=55,loop=0)
cost=0;batches=[]
for stage in ('heroes','covers'):
 b=json.loads((E/stage/'batch-latest.json').read_text())['result'];assert b['status']=='completed' and b['failed_count']==0
 assert b['completed_count']==b['total_count']
 for m in b['materials']:assert m['generate_result']['success'] and not m['generate_result']['errors'] and not m['action_results'] and len(m['results'])==1
 c=sum(m['generate_result']['consume']['consumption_indicator']['usage'] for m in b['materials']);cost+=c
 batches.append({'batch_id':b['batch_id'],'stage':stage,'materials':b['total_count'],'cost_cny':round(c,2),'request_sha256':sha(E/stage/'request.json')})
manifest={'model':'doubao-seedream-5-0-260128','batches':batches,'total_cost_cny':round(cost,2),'assets':entries,'validation':{'all96FramesTransparentMargins':True,'upperBodyInvariantAcross16MovementFrames':True,'wrapDeltaComparableToAdjacentFrames':True,'existingAtlasUUIDsAndMetadataUnchanged':True},'scope':{'replaced':['three base atlases: idle, fire carrier, four articulated defeat poses','three full 16-frame movement atlases'],'new':['three portraits','desktop and mobile menu covers'],'historical':['legacy art/survivor and animation/survivor textures preserved on disk but not loaded','existing desktop ZIPs not repackaged'],'preserved':['hero IDs, stats and saves','monster/Boss art','map and collision','shader aura']}}
(E/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2));print('11 current assets checked; 96 frames; cost',round(cost,2))
Q=R/'evidence/runtime-anime-heroes-20260928';shutil.copy2(R/'evidence/runtime/build.log',Q/'build-final.log')
