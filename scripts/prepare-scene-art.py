"""Deterministically derive map tiles and keyed prop sprites from this frozen batch."""
from pathlib import Path
import json, urllib.request, hashlib, uuid
import numpy as np
from PIL import Image, ImageDraw
R=Path(__file__).resolve().parents[1];E=R/'evidence/materials-20260924-scene';OUT=R/'assets/resources/scene';OUT.mkdir(parents=True,exist_ok=True)
b=json.loads((E/'batch-latest.json').read_text())['result'];assert b['completed_count']==b['total_count']==5 and not b['failed_count']
checks=[];preview=Image.new('RGB',(1500,900),'#25332e')
for i,m in enumerate(b['materials']):
 assert m['status']=='success' and m['generate_result']['success'] and not m['generate_result']['errors'] and m['results'] and not m['action_results']
 name=m['material_id'].rsplit('-',1)[1];raw=E/(name+'-original.jpeg')
 if not raw.exists():
  with urllib.request.urlopen(m['results'][0],timeout=50) as r: raw.write_bytes(r.read(25*1024*1024))
 im=Image.open(raw).convert('RGB');assert im.size==(2048,2048)
 if name=='ground':
  # Low contrast texture gets a periodic crossfade using its own opposite edges.
  # The join is placed in the interior of the source rather than cloning a hard edge.
  a=np.array(im.resize((512,512),Image.Resampling.LANCZOS)).astype(float)
  x=np.arange(512);w=(1-np.cos(2*np.pi*x/512))/2
  a=a*w[None,:,None]+np.roll(a,256,axis=1)*(1-w[None,:,None])
  a=a*w[:,None,None]+np.roll(a,256,axis=0)*(1-w[:,None,None])
  # Equal outer texels avoid seams after bilinear filtering.
  a[:,0]=a[:,-1]=(a[:,0]+a[:,-1])/2;a[0,:]=a[-1,:]=(a[0,:]+a[-1,:])/2
  final=Image.fromarray(np.uint8(np.clip(a,0,255))).convert('RGBA')
 else:
  a=np.array(im).astype(float);key=np.minimum(a[:,:,0],a[:,:,2])-a[:,:,1];alpha=np.clip((95-key)/60,0,1)
  # Suppress only magenta spill, never key by brightness.
  spill=alpha<.98;a[spill,0]=np.minimum(a[spill,0],a[spill,1]+30);a[spill,2]=np.minimum(a[spill,2],a[spill,1]+25)
  fg=Image.fromarray(np.uint8(np.dstack((a,alpha*255))),'RGBA');bbox=fg.getbbox();assert bbox
  fg=fg.crop(bbox);fg.thumbnail((752,500),Image.Resampling.LANCZOS)
  final=Image.new('RGBA',(fg.width+16,fg.height+16));final.alpha_composite(fg,(8,8))
  assert np.mean(np.array(final)[:,:,3]==0)>.12
 path=OUT/(name+'.png');final.save(path)
 thumb=final.copy();thumb.thumbnail((480,410));preview.paste(thumb,((i%3)*500+(500-thumb.width)//2,(i//3)*450+24),thumb)
 ImageDraw.Draw(preview).text(((i%3)*500+24,(i//3)*450+420),name,fill='white')
 checks.append({'name':name,'size':final.size,'mode':final.mode,'sourceHash':hashlib.sha256(raw.read_bytes()).hexdigest(),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'consume':m['generate_result']['consume']})
 # Clone proven Creator 3.8 PNG metadata with new stable UUID; never change existing IDs.
 meta=path.with_suffix('.png.meta')
 if not meta.exists():
  source=json.loads((R/'assets/resources/art/arena.png.meta').read_text());old=source['uuid'];new=str(uuid.uuid5(uuid.NAMESPACE_URL,'emberline/scene/'+name));s=json.dumps(source).replace(old,new).replace('arena',name);source=json.loads(s)
  for sub in source['subMetas'].values():
   ud=sub.get('userData',{})
   for key,value in [('width',final.width),('height',final.height),('rawWidth',final.width),('rawHeight',final.height),('trimX',0),('trimY',0),('trimType','none')]:
    if key in ud: ud[key]=value
  source['subMetas']['f9941']['userData'].pop('vertices',None)
  meta.write_text(json.dumps(source,indent=2))
preview.save(E/'scene-contact.jpg')
(E/'artifact-checks.json').write_text(json.dumps({'files':checks,'derivation':'Keyed magenta by chroma; cropped and padded props; periodic ground crossfade. Original inputs immutable.'},ensure_ascii=False,indent=2))
print(json.dumps(checks,ensure_ascii=False,indent=2))
