"""Normalize frozen service art into fixed-cell Creator atlases. Never submits requests."""
from pathlib import Path
import json,hashlib,uuid
import numpy as np
from PIL import Image,ImageDraw
R=Path(__file__).resolve().parents[1]; E=R/'evidence/materials-20260924-roster'; O=R/'assets/resources/roster'; O.mkdir(exist_ok=True)
b=json.loads((E/'batch-latest.json').read_text())['result']; assert b['completed_count']==b['total_count']==7 and b['failed_count']==0
checks=[];contact=Image.new('RGB',(1536,2048),'#26332f')
# Visually audited row boundaries. Medic's first row is taller than the other sheets.
bounds={'medic':([0,518,1028,1538,2048],[86,566,1058,1536,2048]),'furnace':([0,530,1025,1520,2048],[0,530,1032,1534,2048]),'hive':([0,512,1026,1538,2048],[0,528,1032,1546,2048])}
def metadata(name,size):
 p=O/(name+'.png.meta')
 if p.exists():meta=json.loads(p.read_text())
 else:
  meta=json.loads((R/'assets/resources/art/arena.png.meta').read_text());old=meta['uuid'];new=str(uuid.uuid5(uuid.NAMESPACE_URL,'emberline/roster/'+name));meta=json.loads(json.dumps(meta).replace(old,new).replace('arena',name))
 meta['userData']['hasAlpha']=True
 ud=meta['subMetas']['f9941']['userData'];ud.update(width=size[0],height=size[1],rawWidth=size[0],rawHeight=size[1],trimX=0,trimY=0,offsetX=0,offsetY=0,trimType='none',packable=False);ud.pop('vertices',None)
 p.write_text(json.dumps(meta,indent=2));return meta['uuid']
for index,m in enumerate(b['materials']):
 assert m['generate_result']['success'] and not m['generate_result']['errors'] and m['results'] and not m['action_results']
 name=m['material_id'].removeprefix('emberline-roster-20260924-'); raw=E/(name+'-original.jpeg');im=Image.open(raw).convert('RGB');assert im.size==(2048,2048)
 a=np.asarray(im).astype(float);key=np.minimum(a[:,:,0],a[:,:,2])-a[:,:,1]
 alpha=np.clip((100-key)/65,0,1);alpha[alpha<.1]=0
 # Remove chroma spill only at translucent edges, retaining opaque warm whites.
 edge=alpha<.98;a[edge,0]=np.minimum(a[edge,0],a[edge,1]+22);a[edge,2]=np.minimum(a[edge,2],a[edge,1]+22);a[alpha==0]=0
 fg=Image.fromarray(np.uint8(np.dstack((a,alpha*255))),'RGBA')
 xs,ys=bounds.get(name,([0,512,1024,1536,2048],[0,512,1024,1536,2048]));cells=[]
 for i in range(16):
  col,row=i%4,i//4;cell=fg.crop((xs[col]+8,ys[row]+8,xs[col+1]-8,ys[row+1]-8));bbox=cell.getbbox();assert bbox,(name,i);cells.append(cell.crop(bbox))
 final=Image.new('RGBA',(1024,1024));frames=[]
 scale=min(216/max(c.width for c in cells[:12]),216/max(c.height for c in cells[:12]))
 for i,cell in enumerate(cells):
  if name=='boss-fx':
   rowcells=cells[i//4*4:(i//4+1)*4];ratio=min(224/max(c.width for c in rowcells),224/max(c.height for c in rowcells));ycenter=True
  else:ratio=min(scale,238/cell.width,224/cell.height);ycenter=False
  cell=cell.resize((max(1,round(cell.width*ratio)),max(1,round(cell.height*ratio))),Image.Resampling.LANCZOS)
  tile=Image.new('RGBA',(256,256));tile.alpha_composite(cell,((256-cell.width)//2,(256-cell.height)//2 if ycenter else 232-cell.height))
  final.alpha_composite(tile,(i%4*256,i//4*256));frames.append({'frame':i,'bbox':tile.getbbox(),'sha256':hashlib.sha256(tile.tobytes()).hexdigest()})
  ar=np.asarray(tile)[:,:,3];assert not ar[0].any() and not ar[-1].any() and not ar[:,0].any() and not ar[:,-1].any()
  if name in ['vanguard','scout','medic'] and i==8:tile.resize((768,768)).save(E/(name+'-stand-inspect.png'))
 path=O/(name+'.png');final.save(path);uid=metadata(name,final.size)
 thumb=final.resize((490,490));contact.paste(thumb,((index%3)*512,(index//3)*670),thumb);ImageDraw.Draw(contact).text(((index%3)*512+8,(index//3)*670+504),name,fill='white')
 checks.append({'name':name,'size':final.size,'uuid':uid,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'sourceHash':hashlib.sha256(raw.read_bytes()).hexdigest(),'frames':frames})
contact.save(E/'contact.png');(E/'artifact-checks.json').write_text(json.dumps({'assets':checks,'costYuan':round(sum(m['generate_result']['consume']['consumption_indicator']['usage'] for m in b['materials']),2),'notes':['Player runs are separately named aliases of each approved roster atlas; the authored first 8 frames remain the locomotion sequence.']},indent=2))
print('Prepared 7 RGBA atlases')
