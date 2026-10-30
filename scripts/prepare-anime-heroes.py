"""Reproducible anime character cutouts and continuous articulated animation.

Reads only this round's frozen service originals. Never calls a remote service.
"""
from pathlib import Path
import json, hashlib, math, uuid
import numpy as np
from PIL import Image, ImageDraw

R=Path(__file__).resolve().parents[1]
E=R/'evidence/materials-20260928-anime-heroes'
O=R/'assets/resources/roster'
S=3
SIZE=(256*S,256*S)
NAMES=('vanguard','scout','medic')
CONFIG={
 'vanguard':dict(hip=(119,122),knee=(120,160),ankle=(123,201),target=(109,121),lengths=(44,46),
  hem=[(0,0),(256,0),(256,111),(127,111),(128,119),(116,124),(108,122),(99,129),(87,127),(87,120),(0,120)],
  thigh=[(115,113),(128,113),(129,134),(128,155),(128,170),(115,171),(112,157),(112,136)],
  calf=[(113,158),(128,158),(128,179),(130,198),(116,204),(113,188)],
  boot=[(114,194),(129,194),(130,209),(137,215),(145,218),(145,228),(114,227),(113,212)]),
 'scout':dict(hip=(127,116),knee=(126,157),ankle=(126,202),target=(116,113),lengths=(48,52),
  hem=[(0,0),(256,0),(256,98),(132,98),(135,106),(131,113),(122,117),(115,116),(107,119),(101,120),(98,114),(98,111),(0,111)],
  thigh=[(116,109),(134,107),(137,125),(135,143),(133,155),(132,166),(120,166),(118,149),(116,129)],
  calf=[(119,155),(132,155),(131,176),(134,204),(119,205),(117,182)],
  boot=[(117,198),(133,198),(134,208),(143,215),(145,219),(145,226),(117,225),(116,210)]),
 'medic':dict(hip=(117,117),knee=(118,156),ankle=(119,202),target=(106,115),lengths=(46,49),
  hem=[(0,0),(256,0),(256,109),(124,109),(126,118),(113,123),(103,119),(98,125),(83,123),(83,115),(0,115)],
  thigh=[(114,112),(123,110),(126,128),(125,144),(126,162),(122,170),(111,169),(108,152),(108,133)],
  calf=[(110,157),(125,157),(124,181),(125,204),(112,205),(109,180)],
  boot=[(111,198),(125,198),(126,211),(134,219),(139,221),(139,230),(111,230),(110,213)]),
}

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def key_image(path):
 a=np.array(Image.open(path).convert('RGB')).astype(float)
 chroma=np.minimum(a[:,:,0],a[:,:,2])-a[:,:,1]
 alpha=np.clip((88-chroma)/48,0,1)
 alpha[alpha<.04]=0
 edge=alpha<.98
 a[edge,0]=np.minimum(a[edge,0],a[edge,1]+25)
 a[edge,2]=np.minimum(a[edge,2],a[edge,1]+25)
 a[alpha==0]=0
 return Image.fromarray(np.uint8(np.dstack((a,alpha*255))))

def prepare_sources():
 for name in NAMES:
  image=key_image(E/'heroes'/f'{name}-original.jpeg')
  bounds=image.getbbox();image=image.crop(bounds)
  ratio=210*S/image.height
  image=image.resize((round(image.width*ratio),210*S),Image.Resampling.LANCZOS)
  source=Image.new('RGBA',SIZE);source.alpha_composite(image,((SIZE[0]-image.width)//2,22*S))
  source.save(E/f'{name}-source.png')
  grid=Image.new('RGBA',SIZE,'#263c3e');grid.alpha_composite(source);d=ImageDraw.Draw(grid)
  for p in range(0,256,16):
   d.line((p*S,0,p*S,SIZE[1]),fill='#577474');d.text((p*S,0),str(p),fill='white')
   d.line((0,p*S,SIZE[0],p*S),fill='#577474');d.text((0,p*S),str(p),fill='white')
  grid.convert('RGB').save(E/f'{name}-rig-grid.jpg')

def cut(source,poly):
 mask=Image.new('L',SIZE);ImageDraw.Draw(mask).polygon([(x*S,y*S) for x,y in poly],fill=255)
 result=source.copy();result.putalpha(Image.fromarray(np.minimum(np.array(mask),np.array(source)[:,:,3])))
 return result

def warp(layer,p,q,tp,tq):
 p,q,tp,tq=[np.array(v,float) for v in (p,q,tp,tq)];v,w=q-p,tq-tp
 a,b=v/np.linalg.norm(v),w/np.linalg.norm(w)
 matrix=np.column_stack((b,[-b[1],b[0]]))@np.diag((np.linalg.norm(w)/np.linalg.norm(v),1))@np.column_stack((a,[-a[1],a[0]])).T
 inv=np.linalg.inv(matrix);offset=(p-inv@tp)*S
 return layer.transform(SIZE,Image.Transform.AFFINE,(*inv[0],offset[0],*inv[1],offset[1]),Image.Resampling.BICUBIC)

def ik(hip,ankle,lengths):
 hip,ankle=np.array(hip,float),np.array(ankle,float);delta=ankle-hip;dist=np.linalg.norm(delta)
 l1,l2=lengths;assert dist<l1+l2,(dist,lengths)
 d=delta/dist;along=(l1*l1-l2*l2+dist*dist)/(2*dist)
 return hip+d*along+np.array([d[1],-d[0]])*math.sqrt(max(0,l1*l1-along*along))

def sole_pose(t):
 if t<.6:return 29-58*t/.6,0,0
 u=(t-.6)/.4
 return -29+58*(3*u*u-2*u*u*u),13*math.sin(math.pi*u)**2,-9*math.sin(math.pi*u)

def render(source,parts,cfg,t=0,rest=False):
 canvas=Image.new('RGBA',SIZE);joints=[]
 for far in (True,False):
  phase=(t+(.5 if far else 0))%1
  hip=np.array([cfg['target'][0]+(5 if far else -5),cfg['target'][1]],float)
  dx,lift,angle=((7 if far else -7),0,0) if rest else sole_pose(phase)
  ankle=np.array([hip[0]+dx,209.]);rad=math.radians(angle)
  boot=warp(parts['boot'],cfg['ankle'],(cfg['ankle'][0]+20,cfg['ankle'][1]),ankle,ankle+np.array([math.cos(rad),math.sin(rad)])*20)
  dy=232-lift-boot.getbbox()[3]/S;ankle[1]+=dy
  boot=boot.transform(SIZE,Image.Transform.AFFINE,(1,0,0,0,1,-dy*S),Image.Resampling.BICUBIC)
  k=ik(hip,ankle,cfg['lengths']);limb=Image.new('RGBA',SIZE)
  limb.alpha_composite(boot)
  ink=source.getpixel((int(cfg['knee'][0]*S),int((cfg['knee'][1]+9)*S)))
  ImageDraw.Draw(limb).ellipse(((k[0]-5)*S,(k[1]-5)*S,(k[0]+5)*S,(k[1]+5)*S),fill=ink)
  limb.alpha_composite(warp(parts['calf'],cfg['knee'],cfg['ankle'],k,ankle))
  limb.alpha_composite(warp(parts['thigh'],cfg['hip'],cfg['knee'],hip,k))
  if far:
   a=np.array(limb);a[:,:,:3]=(a[:,:,:3]*.78).astype('uint8');limb=Image.fromarray(a)
  canvas.alpha_composite(limb)
  joints.append(dict(far=far,hip=hip.tolist(),knee=k.tolist(),ankle=ankle.tolist(),sole=232-lift,support=lift==0))
 canvas.alpha_composite(parts['hem'])
 return canvas.resize((256,256),Image.Resampling.LANCZOS),joints

def metadata(name,size):
 p=O/(name+'.png.meta')
 if p.exists():return
 meta=json.loads((R/'assets/resources/art/arena.png.meta').read_text());old=meta['uuid'];uid=str(uuid.uuid5(uuid.NAMESPACE_URL,'emberline/roster/'+name))
 meta=json.loads(json.dumps(meta).replace(old,uid).replace('arena',name));meta['userData']['hasAlpha']=True
 d=meta['subMetas']['f9941']['userData'];d.update(width=size[0],height=size[1],rawWidth=size[0],rawHeight=size[1],trimX=0,trimY=0,offsetX=0,offsetY=0,trimType='none',packable=False);d.pop('vertices',None)
 p.write_text(json.dumps(meta,indent=2))

def collapse(parts,cfg,index):
 # Authored joint poses bend the knees and lower the pelvis, retaining body volume.
 poses=[(-12,(108,130),[(136,173),(135,173)],[(130,211),(98,211)],-4),
        (-32,(117,157),[(157,179),(149,186)],[(156,211),(122,210)],-12),
        (-60,(133,187),[(167,173),(173,207)],[(195,202),(207,211)],-48),
        (-85,(139,211),[(177,186),(180,215)],[(206,202),(215,215)],-78)]
 angle,hip,knees,ankles,bootangle=poses[index];canvas=Image.new('RGBA',SIZE)
 for i in range(2):
  h=np.array(hip,float)+[4 if i==0 else -4,0];k=np.array(knees[i],float);a=np.array(ankles[i],float)
  rad=math.radians(bootangle);limb=warp(parts['boot'],cfg['ankle'],(cfg['ankle'][0]+20,cfg['ankle'][1]),a,a+np.array([math.cos(rad),math.sin(rad)])*20)
  limb.alpha_composite(warp(parts['calf'],cfg['knee'],cfg['ankle'],k,a))
  limb.alpha_composite(warp(parts['thigh'],cfg['hip'],cfg['knee'],h,k))
  if i==0:
   arr=np.array(limb);arr[:,:,:3]=(arr[:,:,:3]*.78).astype('uint8');limb=Image.fromarray(arr)
  canvas.alpha_composite(limb)
 rad=math.radians(angle);p=np.array(cfg['target'],float);q=p+[20,0]
 canvas.alpha_composite(warp(parts['hem'],p,q,hip,np.array(hip)+np.array([math.cos(rad),math.sin(rad)])*20))
 return canvas.resize((256,256),Image.Resampling.LANCZOS)

def atlas(frames):
 result=Image.new('RGBA',(1024,1024))
 for i,f in enumerate(frames):result.alpha_composite(f,(i%4*256,i//4*256))
 return result

def bake():
 checks=[]
 for name,cfg in CONFIG.items():
  source=Image.open(E/f'{name}-source.png').convert('RGBA');parts={k:cut(source,cfg[k]) for k in ('hem','thigh','calf','boot')}
  for k,v in parts.items():v.save(E/f'{name}-{k}.png')
  frames=[];records=[]
  for i in range(16):
   f,j=render(source,parts,cfg,i/16);frames.append(f)
   a=np.array(f)[:,:,3];assert not a[0].any() and not a[-1].any() and not a[:,0].any() and not a[:,-1].any()
   assert any(v['support'] for v in j)
   records.append(dict(frame=i,bbox=f.getbbox(),sha256=hashlib.sha256(f.tobytes()).hexdigest(),joints=j))
  assert len(set(r['sha256'] for r in records))==16
  assert all(f.crop((0,0,256,95)).tobytes()==frames[0].crop((0,0,256,95)).tobytes() for f in frames)
  run=atlas(frames);run.save(O/f'{name}-run.png')
  idle,_=render(source,parts,cfg,rest=True)
  # The firing sequence reuses this exact model. Runtime supplies recoil and muzzle flash.
  base=frames[:8]+[idle.copy() for _ in range(4)]
  for i in range(4):base.append(collapse(parts,cfg,i))
  atlas(base).save(O/f'{name}.png')
  contact=Image.new('RGBA',(1024,1024),'#263c3e');contact.alpha_composite(run);contact.convert('RGB').save(E/f'{name}-contact.jpg')
  pose=Image.new('RGBA',(1024,256),'#263c3e')
  for i,f in enumerate(base[12:]):pose.alpha_composite(f,(i*256,0))
  pose.convert('RGB').save(E/f'{name}-defeat.jpg')
  previews=[]
  for f in frames:
   bg=Image.new('RGBA',(256,256),'#263c3e');ImageDraw.Draw(bg).ellipse((65,225,160,241),fill='#142528');bg.alpha_composite(f);previews.append(bg.convert('RGB'))
  previews[0].save(E/f'{name}-walk.gif',save_all=True,append_images=previews[1:],duration=45,loop=0)
  # High-resolution portraits are taken from the SAME service model, never the 256px atlas.
  head=source.crop((50*S,15*S,190*S,155*S)).resize((512,512),Image.Resampling.LANCZOS)
  head.save(O/f'{name}-portrait.png');metadata(name+'-portrait',head.size)
  idle.save(E/f'{name}-idle.png')
  checks.append(dict(hero=name,source_sha256=digest(E/'heroes'/f'{name}-original.jpeg'),run_sha256=digest(O/f'{name}-run.png'),base_sha256=digest(O/f'{name}.png'),frames=records))
 (E/'animation-checks.json').write_text(json.dumps({'assets':checks,'method':'16-frame two-bone IK from new generated model, fixed torso and weapon, alternate support feet; local chroma key and matched idle'},indent=2))

def covers():
 for name,size in [('cover-wide',(1920,1080)),('cover-tall',(900,1600))]:
  im=Image.open(E/'covers'/f'{name}-original.jpeg').convert('RGB').resize(size,Image.Resampling.LANCZOS)
  im.save(O/f'{name}.png');metadata(name,size)

if __name__=='__main__':
 prepare_sources()
 bake()
 covers()
