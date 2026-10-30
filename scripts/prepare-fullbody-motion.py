"""Bake reviewed whole-body motion, preserving original anatomy and animation.

No rigged/frozen head. Every frame comes from the generated fixed-camera video.
Each clip family has ONE scale and horizontal anchor; only the grounded sole
translation varies. Explicit source ranges exclude startup holds and acting.
"""
from pathlib import Path
import json, hashlib, uuid
import numpy as np
from PIL import Image, ImageDraw
R=Path(__file__).resolve().parents[1]; E=R/'evidence/materials-20260928-fullbody-motion'; O=R/'assets/resources/roster'
CONFIG={
 'vanguard':dict(stage='walk-pilot',run=(16,32),run_scale=210/920,action_scale=210/906,run_hip=414,action_hip=417,reload=(30,85),fire=(64,80)),
 'scout':dict(stage='walk-roster',run=(28,61),run_scale=210/895,action_scale=210/926,run_hip=430,action_hip=450,reload=(30,93),fire=(64,80)),
 'medic':dict(stage='walk-roster',run=(55,71),run_scale=210/900,action_scale=210/905,run_hip=493,action_hip=466,reload=(30,89),fire=(64,80)),
}

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def key(image):
 a=np.array(image.convert('RGB')).astype(np.float32);ch=np.minimum(a[:,:,0],a[:,:,2])-a[:,:,1];al=np.clip((88-ch)/48,0,1);al[al<.04]=0
 edge=al<.98;a[edge,0]=np.minimum(a[edge,0],a[edge,1]+25);a[edge,2]=np.minimum(a[edge,2],a[edge,1]+25);a[al==0]=0
 return Image.fromarray(np.uint8(np.dstack((a,al*255))))
def source(hero,stage,index):
 suffix='walk' if stage!='actions-roster' else 'actions'
 return E/stage/f'{hero}-{suffix}-frames'/f'{index+1:04d}.png'
def sample(start,end,loop=False):return [round(start+(end-start)*i/(16 if loop else 15)) for i in range(16)]
def meta(name):
 path=O/f'{name}.png.meta'
 if path.exists():return
 d=json.loads((O/'vanguard-run.png.meta').read_text());uid=str(uuid.uuid5(uuid.NAMESPACE_URL,'emberline/roster/'+name))
 d=json.loads(json.dumps(d).replace(d['uuid'],uid).replace('vanguard-run',name));d['subMetas']['f9941']['userData'].update(trimType='none',packable=False)
 path.write_text(json.dumps(d,indent=2))
def render(hero,stage,index,scale,hip,fire=False):
 im=key(Image.open(source(hero,stage,index)));a=np.array(im)
 # Barrels are dark and occupy the right-hand end of the weapon band. The AI
 # added flashes despite the prompt; remove only pixels beyond the barrel.
 opaque=(a[:,:,3]>160)&(a[:,:,1]<115)&(np.minimum(a[:,:,0],a[:,:,2]).astype(int)-a[:,:,1].astype(int)<35)
 mask=np.zeros(opaque.shape,bool);mask[110:330,630:890]=True
 yy,xx=np.where(opaque&mask)
 if len(xx):
  tip_x=int(xx.max());tip_y=float(np.median(yy[xx>=tip_x-4]))
 else:
  tip_x,tip_y=760,220
 if fire and len(xx):a[:,tip_x+3:]=0;im=Image.fromarray(a)
 # Foot baseline computed from boots only, not from flash/debris or bounding width.
 y,x=np.where(a[700:,:,3]>128);bottom=700+int(y.max())+1
 w=round(im.width*scale);im=im.resize((w,w),Image.Resampling.LANCZOS)
 dx=round(112-hip*scale);dy=round(232-bottom*scale)
 out=Image.new('RGBA',(256,256));out.alpha_composite(im,(dx,dy))
 b=out.getbbox();assert b
 # Correct only the constant source-composition offset to the shared project
 # sole plane; no frame-specific scaling or horizontal recentering occurs.
 shift=232-b[3]
 if shift:
  aligned=Image.new('RGBA',(256,256));aligned.alpha_composite(out,(0,shift));out=aligned
 b=out.getbbox();assert b and b[0]>=8 and b[1]>=8 and b[2]<=248 and b[3]<=236,(hero,stage,index,b)
 return out,[round(dx+tip_x*scale,2),round(dy+tip_y*scale+shift,2)]
def atlas(frames):
 out=Image.new('RGBA',(1024,1024))
 for i,f in enumerate(frames):out.alpha_composite(f,(i%4*256,i//4*256))
 return out
def preview(name,frames,ms):
 sheet=Image.new('RGBA',(1024,1024),'#243b3e');sheet.alpha_composite(atlas(frames));sheet.convert('RGB').save(E/'review'/f'{name}-contact.jpg',quality=92)
 gifs=[]
 for f in frames:
  b=Image.new('RGBA',(256,256),'#243b3e');ImageDraw.Draw(b).ellipse((67,226,157,239),fill='#15282b');b.alpha_composite(f);gifs.append(b.convert('RGB'))
 gifs[0].save(E/'review'/f'{name}.gif',save_all=True,append_images=gifs[1:],duration=ms,loop=0)

def main():
 (E/'review').mkdir(exist_ok=True);rows=[];anchors={};all_runs={}
 for hero,c in CONFIG.items():
  specifications={
   'run':(c['stage'],sample(*c['run'],loop=True),c['run_scale'],c['run_hip']),
   'idle':('actions-roster',[0,3,6,9,12,15,18,21,24,21,18,15,12,9,6,3],c['action_scale'],c['action_hip']),
   'reload':('actions-roster',sample(*c['reload']),c['action_scale'],c['action_hip']),
   'fire':('actions-roster',sample(*c['fire']),c['action_scale'],c['action_hip']),
  }
  for clip,(stage,indices,scale,hip) in specifications.items():
   frames=[];tips=[]
   for index in indices:
    f,t=render(hero,stage,index,scale,hip,clip=='fire');frames.append(f);tips.append(t)
   name=hero+'-'+clip;out=O/(name+'.png');atlas(frames).save(out);meta(name);anchors[name]=tips
   preview(name,frames,42 if clip=='run' else 120 if clip=='idle' else 95 if clip=='reload' else 18)
   if clip=='run':all_runs[hero]=frames
   if clip=='idle':
    # The menu actor/base fallback remains identical in size to the new idle.
    base=Image.open(E/'source-before/assets/resources/roster'/f'{hero}.png').convert('RGBA')
    for i in range(8,12):base.paste(frames[0],(i%4*256,i//4*256))
    base.save(O/f'{hero}.png')
   arr=[np.array(f).astype(float) for f in frames]
   deltas=[float(np.abs(arr[(i+1)%16]-arr[i]).mean()) for i in range(16)]
   # A cyclic source range must not conceal an abrupt startup/end pose.
   if clip in ('run','idle'):assert deltas[-1]<max(deltas[:-1])*1.4,(hero,clip,deltas)
   rows.append(dict(hero=hero,clip=clip,sourceStage=stage,sourceIndicesZeroBased=indices,scale=scale,hipSourceX=hip,sole=232,bounds=[f.getbbox() for f in frames],adjacentRGBAError=deltas,sha256=sha(out),metaSha256=sha(out.with_suffix('.png.meta'))))
 # The same anchors feed actual Cocos muzzle effects; rendering offsets cannot change collision.
 ts='// Generated by scripts/prepare-fullbody-motion.py from audited 256px motion frames.\n'
 ts+='export const HERO_MOTION_MUZZLES:Record<string,number[][]>='+json.dumps(anchors,separators=(',',':'))+';\n'
 (R/'assets/scripts/core/HeroMotionAnchors.ts').write_text(ts)
 gifs=[]
 for i in range(16):
  b=Image.new('RGBA',(768,256),'#243b3e')
  for k,h in enumerate(CONFIG):b.alpha_composite(all_runs[h][i],(k*256,0))
  gifs.append(b.convert('RGB'))
 gifs[0].save(E/'review/three-heroines-run.gif',save_all=True,append_images=gifs[1:],duration=48,loop=0)
 (E/'fullbody-motion-manifest.json').write_text(json.dumps(dict(method='Whole-body generated video frames; hand-reviewed cycle ranges; one constant scale/x anchor per source family; boot baseline 232; no fixed head or limb duplication; flashes removed beyond real barrel',assets=rows),indent=2))
 print('Baked',len(rows),'reviewed motion atlases.')
if __name__=='__main__':main()
