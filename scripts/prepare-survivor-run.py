"""Bake an authored 16-frame run from one frozen service-generated character.

No network requests. Separate thigh/calf/boot layers follow paired two-bone IK
legs. A single upper-body image preserves costume, face, scale and rifle aim.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance
import math, json, hashlib, uuid
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
E=ROOT/'evidence/materials-20260924-run'
SOURCE=E/'source-before/survivor.png'
OUT=ROOT/'assets/resources/animation/survivor-run.png'
S=3
source=Image.open(SOURCE).convert('RGBA').crop((0,512,256,768)).resize((256*S,256*S),Image.Resampling.LANCZOS)

def layer(poly):
    mask=Image.new('L',source.size);ImageDraw.Draw(mask).polygon([(x*S,y*S) for x,y in poly],fill=255)
    result=source.copy();result.putalpha(Image.fromarray(np.minimum(np.asarray(mask),np.asarray(source)[:,:,3])))
    return result

torso=layer([(0,0),(256,0),(256,136),(148,136),(138,144),(119,151),(96,154),(80,151),(66,146),(63,136),(0,136)])
thigh=layer([(78,155),(107,148),(130,148),(120,161),(104,177),(92,191),(81,198),(63,190),(57,179),(64,166)])
calf=layer([(64,178),(86,186),(77,200),(68,214),(64,218),(46,215),(45,207),(52,193)])
boot=layer([(139,195),(160,195),(169,200),(180,201),(185,207),(183,215),(169,219),(149,215),(138,208)])

def transform(im,p,q,target_p,target_q,scale_across=1):
    p,q=np.array(p,float),np.array(q,float);tp,tq=np.array(target_p,float),np.array(target_q,float)
    v=q-p;w=tq-tp
    source_axis=v/np.linalg.norm(v);target_axis=w/np.linalg.norm(w)
    a=np.column_stack([target_axis,np.array([-target_axis[1],target_axis[0]])])
    b=np.column_stack([source_axis,np.array([-source_axis[1],source_axis[0]])])
    matrix=a@np.diag([np.linalg.norm(w)/np.linalg.norm(v),scale_across])@b.T
    inverse=np.linalg.inv(matrix);offset=p-inverse@tp
    values=(inverse[0,0],inverse[0,1],offset[0]*S,inverse[1,0],inverse[1,1],offset[1]*S)
    return im.transform(im.size,Image.Transform.AFFINE,values,Image.Resampling.BICUBIC)

def knee(hip,ankle):
    hip=np.array(hip,float);ankle=np.array(ankle,float);delta=ankle-hip
    distance=np.linalg.norm(delta);length1,length2=36,36
    distance=min(distance,length1+length2-.2);direction=delta/np.linalg.norm(delta)
    along=(length1*length1-length2*length2+distance*distance)/(2*distance)
    bend=math.sqrt(max(0,length1*length1-along*along))
    return hip+direction*along+np.array([direction[1],-direction[0]])*bend

def bone(im,start,end,w0,w1,far):
    """Continuous cloth silhouette closes joints; ink folds retain the comic style."""
    a=np.array(start,float);b=np.array(end,float);v=b-a;v/=np.linalg.norm(v);n=np.array([-v[1],v[0]])
    dark='#10151b';base='#29333b' if far else '#38434b';light='#37434a' if far else '#535f67'
    d=ImageDraw.Draw(im)
    def polygon(points,fill):d.polygon([(round(p[0]*S),round(p[1]*S)) for p in points],fill=fill)
    polygon([a+n*(w0+1),b+n*(w1+1),b-n*(w1+1),a-n*(w0+1)],dark)
    for p,r in [(a,w0+1),(b,w1+1)]:d.ellipse(((p[0]-r)*S,(p[1]-r)*S,(p[0]+r)*S,(p[1]+r)*S),fill=dark)
    polygon([a+n*w0,b+n*w1,b-n*w1,a-n*w0],base)
    for p,r in [(a,w0),(b,w1)]:d.ellipse(((p[0]-r)*S,(p[1]-r)*S,(p[0]+r)*S,(p[1]+r)*S),fill=base)
    polygon([a-n*w0*.6+v*3,a+n*w0*.35+v*3,b+n*w1*.2-v*5,b-n*w1*.75-v*3],light)
    for f in [.52,.78]:
        p=a+(b-a)*f
        pts=[p-n*w1*.7-v*1,p+n*w1*.45+v*3,p+n*w1*.8]
        d.line([(q[0]*S,q[1]*S) for q in pts],fill=dark,width=S*1)

def shoe(im,ankle,phase,far):
    angle=math.radians(24*math.sin(2*math.pi*phase)-5)
    c,s=math.cos(angle),math.sin(angle)
    def pts(poly):return [((ankle[0]+x*c-y*s)*S,(ankle[1]+x*s+y*c)*S) for x,y in poly]
    d=ImageDraw.Draw(im)
    shape=[(-8,-9),(6,-9),(8,-1),(20,2),(23,7),(21,12),(13,14),(-8,10),(-10,5)]
    d.polygon(pts(shape),fill='#10161c')
    d.polygon(pts([(-6,-7),(4,-7),(6,1),(18,4),(20,7),(17,10),(10,11),(-6,7)]),fill='#263139' if far else '#414b54')
    d.line(pts([(-8,8),(12,12),(21,9)]),fill='#727879' if not far else '#485451',width=S)
    d.line(pts([(-4,-2),(4,-1),(-3,1),(6,2)]),fill='#7c8282' if not far else '#4d5959',width=S)

def texture(im,part,p,q,tp,tq,far):
    mapped=transform(part,p,q,tp,tq,.92)
    a=np.asarray(mapped).copy();mask=np.asarray(im)[:,:,3]
    a[:,:,3]=(np.minimum(a[:,:,3],mask).astype(float)*.84).astype('uint8')
    if far:a[:,:,:3]=(a[:,:,:3].astype(float)*.72).astype('uint8')
    im.alpha_composite(Image.fromarray(a))

# In-place cycle. Ground contact is short; the swing passes under the pelvis and
# the heel folds toward the seat. The second leg is exactly half a cycle apart.
keys=[(0,27,215),(.14,0,216),(.29,-29,210),(.43,-36,192),(.58,-25,176),(.73,3,188),(.87,26,200),(1,27,215)]
def foot(t):
    t=t%1
    for i in range(len(keys)-1):
        a,b=keys[i],keys[i+1]
        if a[0]<=t<=b[0]:
            u=(t-a[0])/(b[0]-a[0]);prev=keys[max(0,i-1)];nxt=keys[min(len(keys)-1,i+2)]
            def curve(k):
                m0=(b[k]-prev[k])/(b[0]-prev[0])*(b[0]-a[0])
                m1=(nxt[k]-a[k])/(nxt[0]-a[0])*(b[0]-a[0])
                return (2*u**3-3*u*u+1)*a[k]+(u**3-2*u*u+u)*m0+(-2*u**3+3*u*u)*b[k]+(u**3-u*u)*m1
            return curve(1),curve(2)

frames=[];joints=[]
for i in range(16):
    t=i/16;canvas=Image.new('RGBA',source.size)
    bob=2.2*math.cos(4*math.pi*(t-.1))
    bodies=[]
    for far in [True,False]:
        phase=(t+(.5 if far else 0))%1
        hip=(125 if far else 98,153+bob)
        fx,fy=foot(phase);ankle=(hip[0]+fx,fy-(5 if far else 0))
        k=knee(hip,ankle)
        limb=Image.new('RGBA',source.size)
        bone(limb,k,ankle,8,6,far);texture(limb,calf,(75,188),(56,213),k,ankle,far)
        shoe(limb,ankle,phase,far)
        pitch=math.radians(24*math.sin(2*math.pi*phase)-5)
        tip=(ankle[0]+21*math.cos(pitch),ankle[1]+21*math.sin(pitch))
        texture(limb,boot,(149,205),(170,205),ankle,tip,far)
        bone(limb,hip,k,12,9,far);texture(limb,thigh,(109,155),(77,188),hip,k,far)
        canvas.alpha_composite(limb)
        bodies.append({'far':far,'hip':list(hip),'knee':list(k),'ankle':list(ankle)})
    # A shared pelvis overlaps both hips and the jacket hem.
    d=ImageDraw.Draw(canvas);d.polygon([(x*S,(y+bob)*S) for x,y in [(78,142),(135,139),(140,151),(128,165),(98,166),(76,156)]],fill='#263139')
    d.line([(80*S,(152+bob)*S),(103*S,(158+bob)*S),(129*S,(151+bob)*S)],fill='#56616a',width=S*2)
    # Both arms and the weapon remain on the same, mildly forward-leaning torso.
    angle=-.065
    canvas.alpha_composite(transform(torso,(115,153),(115,53),(115,153+bob),(115-math.sin(angle)*100,153+bob-math.cos(angle)*100)))
    frame=canvas.resize((256,256),Image.Resampling.LANCZOS);frames.append(frame)
    joints.append({'frame':i,'phase':t,'bob':bob,'legs':bodies})

atlas=Image.new('RGBA',(1024,1024))
for i,frame in enumerate(frames):atlas.alpha_composite(frame,((i%4)*256,(i//4)*256))
atlas.save(OUT)
meta=json.loads((ROOT/'assets/resources/animation/survivor.png.meta').read_text())
old=meta['uuid'];new=str(uuid.uuid5(uuid.NAMESPACE_URL,'emberline/animation/survivor-run'))
meta=json.loads(json.dumps(meta).replace(old,new).replace('"survivor"','"survivor-run"'))
if not OUT.with_suffix('.png.meta').exists():OUT.with_suffix('.png.meta').write_text(json.dumps(meta,indent=2))
contact=Image.new('RGBA',(1024,1024),'#25342e');contact.alpha_composite(atlas);contact.convert('RGB').save(E/'run-contact.jpg')
preview=[]
for frame in frames:
    bg=Image.new('RGBA',(256,256),'#25342e');d=ImageDraw.Draw(bg);d.ellipse((75,218,163,239),fill='#18221e');bg.alpha_composite(frame);preview.append(bg.convert('RGB'))
preview[0].save(E/'run-preview.gif',save_all=True,append_images=preview[1:],duration=30,loop=0)
for name,part in [('torso',torso),('thigh',thigh),('calf',calf),('boot',boot)]:part.save(E/(name+'-part.png'))
checks=[]
for i,frame in enumerate(frames):
    a=np.asarray(frame)[:,:,3];box=frame.getbbox()
    assert box and not a[0].any() and not a[-1].any() and not a[:,0].any() and not a[:,-1].any(),(i,box)
    checks.append({'frame':i,'bbox':box,'sha256':hashlib.sha256(frame.tobytes()).hexdigest()})
assert len({c['sha256'] for c in checks})==16
(E/'run-artifact-checks.json').write_text(json.dumps({'method':'local two-bone rig; fixed cutout torso; connected cloth/boot silhouettes with source fabric texture, baked to 16 frames',
  'source':str(SOURCE.relative_to(ROOT)),'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
  'output':str(OUT.relative_to(ROOT)),'sha256':hashlib.sha256(OUT.read_bytes()).hexdigest(),
  'size':[1024,1024],'cell':[256,256],'frames':checks,'joints':joints,'new_remote_cost_cny':0},indent=2))
print('16 unique RGBA run frames baked; joints, alpha/border checks and hashes saved.')
