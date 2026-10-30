"""Derive immutable expansion originals into Creator RGBA atlases and seamless floors."""
from pathlib import Path
import json,urllib.request,urllib.parse,hashlib,uuid,time
import numpy as np
from PIL import Image,ImageDraw
R=Path(__file__).resolve().parents[1];E=R/'evidence/materials-20260924-expansion';O=R/'assets/resources/expansion';O.mkdir(parents=True,exist_ok=True)
b=json.loads((E/'batch-latest.json').read_text())['result'];assert b['completed_count']==b['total_count']==9 and b['failed_count']==0
checks=[];contact=Image.new('RGB',(1500,1500),'#26332f')
for index,m in enumerate(b['materials']):
 assert m['generate_result']['success'] and not m['generate_result']['errors'] and m['results'] and not m['action_results']
 name=m['material_id'].removeprefix('emberline-expansion-20260924-');raw=E/(name+'-original.jpeg')
 if not raw.exists():
  url=m['results'][0];assert urllib.parse.urlparse(url).scheme=='https' and urllib.parse.urlparse(url).hostname=='statics.fxbusiness.cn'
  for attempt in range(3):
   try:
    with urllib.request.urlopen(url,timeout=50) as response:data=response.read(25*1024*1024)
    break
   except Exception:
    if attempt==2:raise
    time.sleep(2+attempt*3)
  raw.write_bytes(data)
 im=Image.open(raw).convert('RGB');assert im.size==(2048,2048)
 if name in ['foundry','laboratory']:
  a=np.array(im.resize((512,512),Image.Resampling.LANCZOS)).astype(float);w=(1-np.cos(2*np.pi*np.arange(512)/512))/2
  a=a*w[None,:,None]+np.roll(a,256,axis=1)*(1-w[None,:,None]);a=a*w[:,None,None]+np.roll(a,256,axis=0)*(1-w[:,None,None]);a[:,0]=a[:,-1]=(a[:,0]+a[:,-1])/2;a[0,:]=a[-1,:]=(a[0,:]+a[-1,:])/2
  final=Image.fromarray(np.uint8(a)).convert('RGBA');frames=[]
 else:
  a=np.array(im).astype(float);key=np.minimum(a[:,:,0],a[:,:,2])-a[:,:,1];alpha=np.clip((105-key)/65,0,1);spill=alpha<.98
  a[spill,0]=np.minimum(a[spill,0],a[spill,1]+25);a[spill,2]=np.minimum(a[spill,2],a[spill,1]+25)
  fg=Image.fromarray(np.uint8(np.dstack((a,alpha*255))),'RGBA');final=Image.new('RGBA',(1024,1024));frames=[]
  actor=name in ['spitter','bomber','charger','summoner'];cells=[]
  for i in range(16):
   # Authored boundaries audited against each original; generated sheets are not guaranteed uniform.
   xs=[0,515,1023,1530,2048] if name=='spitter' else [0,540,1042,1550,2048] if name=='charger' else [0,512,1024,1536,2048]
   ys=[64,555,1044,1532,1995] if name=='spitter' else [0,575,1064,1528,2048] if name=='charger' else [0,512,1024,1536,2048]
   col=i%4;row=i//4;margin=9 if name=='spitter' else 6
   cell=fg.crop((xs[col]+margin,ys[row]+margin,xs[col+1]-margin,ys[row+1]-margin));pixels=np.array(cell)
   # Remove residual low-opacity chroma/JPEG ringing, preserving opaque purple clothing.
   pixels[:,:,3][pixels[:,:,3]<90]=0
   cell=Image.fromarray(pixels,'RGBA');bbox=cell.getbbox();assert bbox,(name,i);cells.append(cell.crop(bbox))
  # One fixed actor scale across locomotion/attack frames, stable feet baseline.
  scale=min(210/max(c.width for c in cells[:12]),222/max(c.height for c in cells[:12])) if actor else 1
  for i,cell in enumerate(cells):
   if actor:
    ratio=min(scale,238/cell.width,224/cell.height);cell=cell.resize((max(1,round(cell.width*ratio)),max(1,round(cell.height*ratio))),Image.Resampling.LANCZOS);pos=((256-cell.width)//2,232-cell.height)
   elif name=='skills-fx':
    rowcells=cells[(i//4)*4:(i//4+1)*4];ratio=min(216/max(c.width for c in rowcells),216/max(c.height for c in rowcells))
    cell=cell.resize((max(1,round(cell.width*ratio)),max(1,round(cell.height*ratio))),Image.Resampling.LANCZOS);pos=((256-cell.width)//2,(256-cell.height)//2)
   else:cell.thumbnail((216,216),Image.Resampling.LANCZOS);pos=((256-cell.width)//2,(256-cell.height)//2)
   tile=Image.new('RGBA',(256,256));tile.alpha_composite(cell,pos);final.alpha_composite(tile,((i%4)*256,(i//4)*256));frames.append({'frame':i,'bbox':tile.getbbox(),'sha256':hashlib.sha256(tile.tobytes()).hexdigest()})
 path=O/(name+'.png');final.save(path);meta=path.with_suffix('.png.meta')
 if not meta.exists():
  source=json.loads((R/'assets/resources/art/arena.png.meta').read_text());old=source['uuid'];new=str(uuid.uuid5(uuid.NAMESPACE_URL,'emberline/expansion/'+name));source=json.loads(json.dumps(source).replace(old,new).replace('arena',name))
  for sub in source['subMetas'].values():
   ud=sub.get('userData',{})
   for k,v in [('width',final.width),('height',final.height),('rawWidth',final.width),('rawHeight',final.height),('trimX',0),('trimY',0),('trimType','none')]:
    if k in ud:ud[k]=v
  source['subMetas']['f9941']['userData'].pop('vertices',None);meta.write_text(json.dumps(source,indent=2))
 source=json.loads(meta.read_text());source['userData']['hasAlpha']=name not in ['foundry','laboratory'];meta.write_text(json.dumps(source,indent=2))
 thumb=final.copy();thumb.thumbnail((470,450));contact.paste(thumb,((index%3)*500+15,(index//3)*500+15),thumb);ImageDraw.Draw(contact).text(((index%3)*500+16,(index//3)*500+475),name,fill='white')
 checks.append(dict(name=name,size=final.size,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),sourceHash=hashlib.sha256(raw.read_bytes()).hexdigest(),frames=frames,consume=m['generate_result']['consume']))
contact.save(E/'contact.jpg');(E/'artifact-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2));print('Prepared',len(checks),'assets')
