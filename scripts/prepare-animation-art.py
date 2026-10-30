"""Freeze originals, reject weak walk rows, key/align every approved cell for Cocos."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import hashlib, json, uuid

ROOT=Path(__file__).resolve().parents[1]
E=ROOT/'evidence/materials-20260923-animation'
OUT=ROOT/'assets/resources/animation';OUT.mkdir(exist_ok=True)
CELL=256;BASELINE=232
checks=[]

def key(im):
    a=np.asarray(im.convert('RGB')).astype(float)
    chroma=np.minimum(a[:,:,0]-a[:,:,1],a[:,:,2]-a[:,:,1])
    alpha=np.clip((38-chroma)/24,0,1)
    # Despill only the translucent contour; retain opaque amber clothes and pale highlights.
    edge=(alpha>0)&(alpha<.99)
    a[:,:,0][edge]=np.minimum(a[:,:,0][edge],a[:,:,1][edge]+70)
    a[:,:,2][edge]=np.minimum(a[:,:,2][edge],a[:,:,1][edge]+35)
    a[alpha==0]=0
    return Image.fromarray(np.dstack([a,alpha*255]).astype('uint8'),'RGBA')

def normalize(im,height=210,scale=None):
    box=im.getbbox();assert box
    fg=im.crop(box)
    scale=scale or min(height/fg.height,232/fg.width)
    w,h=round(fg.width*scale),round(fg.height*scale)
    assert w<=248 and h<=232,(w,h)
    fg=fg.resize((w,h),Image.Resampling.LANCZOS)
    cell=Image.new('RGBA',(CELL,CELL));cell.alpha_composite(fg,((CELL-w)//2,BASELINE-h))
    return cell,scale,box

# Observed painted cell boundaries, not assumed exact 512 coordinates.
boundaries={
 'survivor':([60,529,1024,1520,2000],[64,556,1048,1546,2038]),
 'zombie':([63,545,1026,1507,1990],[141,610,1069,1525,1995]),
 'brute':([36,527,1024,1520,2010],[53,548,1037,1516,2010]),
 'effects':([50,528,1024,1520,2010],[60,550,1040,1516,1998])}

def meta(name):
    source=json.loads((ROOT/'assets/resources/art/survivor.png.meta').read_text())
    uid=str(uuid.uuid5(uuid.NAMESPACE_URL,'emberline/animation/'+name))
    old=source['uuid'];source=json.loads(json.dumps(source).replace(old,uid).replace('survivor',name))
    frame=source['subMetas']['f9941']['userData']
    for k in ['width','height','rawWidth','rawHeight']:frame[k]=1024
    frame.pop('vertices',None)
    frame['trimType']='none';frame['packable']=False
    path=OUT/(name+'.png.meta')
    if not path.exists():path.write_text(json.dumps(source,indent=2))

for name in ['survivor','zombie','brute','effects']:
    raw=E/(name+'-original.jpeg');im=Image.open(raw);assert im.size==(2048,2048)
    xb,yb=boundaries[name];cells=[];source_boxes=[]
    for i in range(16):
        c,r=i%4,i//4
        box=(xb[c]+4,yb[r]+4,xb[c+1]-4,yb[r+1]-4)
        crop=key(im.crop(box));cells.append(crop);source_boxes.append(box)
    frames=[]
    if name!='effects':
        # Four visibly distinct generated poses, each held for two ticks in an eight-tick cycle.
        gait_sources=[cells[0]]+[key(Image.open(E/'gait-correction'/(name+'-'+pose+'-original.jpeg'))) for pose in ['cross','opposite','lift']]
        gait=[]
        for source in gait_sources:gait.append(normalize(source)[0])
        frames=[gait[i//2] for i in range(8)]
        # Shooting/swiping/punching retain four authored frames. Equal standing height keeps feet grounded.
        attack_scales=[]
        for c in cells[8:12]:
            frame,scale,_=normalize(c);frames.append(frame);attack_scales.append(scale)
        death_scale=float(np.median(attack_scales))
        for c in cells[12:16]:
            box=c.getbbox();assert box
            # A common scale for death poses preserves torso size as the silhouette becomes horizontal.
            scale=min(death_scale,232/(box[2]-box[0]),220/(box[3]-box[1]))
            frames.append(normalize(c,scale=scale)[0])
    else:
        for i,c in enumerate(cells):
            if i<4:
                a=np.asarray(c).copy();rgb=a[:,:,:3].astype(float)
                fire=(rgb[:,:,0]>155)&(rgb[:,:,1]>85)&((rgb[:,:,0]>rgb[:,:,2]*1.1)|(rgb.min(axis=2)>190))
                fire[:,:230]=False
                mask=Image.fromarray((fire*255).astype('uint8')).filter(ImageFilter.MaxFilter(5))
                a[:,:,3]=np.minimum(a[:,:,3],np.asarray(mask));c=Image.fromarray(a,'RGBA')
            box=c.getbbox();assert box
            fg=c.crop(box);ratio=.48
            fg=fg.resize((max(1,round(fg.width*ratio)),max(1,round(fg.height*ratio))),Image.Resampling.LANCZOS)
            frame=Image.new('RGBA',(256,256))
            # A muzzle flash grows rightward from a stable emitter, radial effects stay centered.
            x=112 if i<4 else (256-fg.width)//2
            frame.alpha_composite(fg,(x,(256-fg.height)//2));frames.append(frame)
    atlas=Image.new('RGBA',(1024,1024))
    stats=[]
    for i,frame in enumerate(frames):
        a=np.asarray(frame)[:,:,3];box=frame.getbbox();assert box and a[0,:].max()==0 and a[-1,:].max()==0 and a[:,0].max()==0 and a[:,-1].max()==0,(name,i,box)
        atlas.alpha_composite(frame,((i%4)*256,(i//4)*256))
        stats.append({'frame':i,'bbox':box,'opaque_pixels':int((a>240).sum()),'transparent_fraction':float((a==0).mean()),'sha256':hashlib.sha256(frame.tobytes()).hexdigest()})
    file=OUT/(name+'.png');atlas.save(file);meta(name)
    contact=Image.new('RGB',(1024,1024),'#26312d');contact.paste(atlas,(0,0),atlas);contact.save(E/(name+'-contact.jpg'))
    checks.append({'name':name,'file':str(file.relative_to(ROOT)),'size':atlas.size,'mode':atlas.mode,
                   'original_sha256':hashlib.sha256(raw.read_bytes()).hexdigest(),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),
                   'source_cell_boxes':source_boxes,'frames':stats})
    if name!='effects':
        gif=[]
        for i in range(8):
            bg=Image.new('RGBA',(256,256),'#26312d');bg.alpha_composite(frames[i]);gif.append(bg.convert('RGB'))
        gif[0].save(E/(name+'-walk.gif'),save_all=True,append_images=gif[1:],duration=85,loop=0)
cost=0
for path in [E/'batch-latest.json',E/'gait-correction/batch-latest.json']:
    b=json.loads(path.read_text())['result'];assert b['completed_count']==b['total_count'] and b['failed_count']==0
    for m in b['materials']:
        assert m['status']=='success' and m['generate_result']['success'] and not m['generate_result']['errors'] and m['results']
        print(m['material_id'],m['generate_result']['consume'])
(E/'artifact-checks.json').write_text(json.dumps({'files':checks,'gait':'four distinct generated key poses, each held two ticks; original repeated walk rows rejected',
 'normalization':'256-square frames; foot baseline 232; painted cell boundaries inspected; muzzle gun pixels excluded; no automatic trim',
 'remote_evaluator':'not used; local decode, alpha, border, per-frame geometry and runtime inspection required'},indent=2))
print('Prepared 4 RGBA atlases, 64 frame slots, 12 distinct walk key poses.')
