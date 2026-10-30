"""Bake continuous, grounded 16-frame walks from frozen service character art.

Local cutout rig: immutable upper body, original textured thigh/calf/boot layers,
two-bone IK, alternating support feet. No requests and no changes to metadata.
"""
from pathlib import Path
import hashlib
import json
import math
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
E = ROOT / 'evidence/materials-20260928-gait'
S = 3
SIZE = (256*S, 256*S)
CONFIG = {
    'vanguard': dict(lengths=(40,39), frame=8, hip=(96,137), other=(116,137), knee=(96,175), ankle=(88,210),
        hem=[(0,0),(256,0),(256,126),(129,126),(128,135),(111,139),(81,148),(72,136),(0,136)],
        thigh=[(77,135),(108,132),(107,164),(106,180),(95,185),(82,179),(81,161)],
        calf=[(86,173),(106,176),(104,184),(99,199),(94,205),(78,204),(78,193)],
        boot=[(78,199),(98,199),(96,216),(105,220),(105,233),(77,233),(76,216)]),
    'scout': dict(lengths=(45,44), frame=9, hip=(98,133), other=(116,133), knee=(141,148), ankle=(124,189),
        hem=[(0,0),(256,0),(256,120),(128,120),(118,130),(109,136),(91,136),(83,141),(77,137),(0,120)],
        thigh=[(108,130),(124,124),(144,137),(151,143),(150,153),(140,156),(126,148),(110,141)],
        calf=[(136,143),(149,144),(151,153),(144,165),(135,181),(119,179),(119,167),(127,151)],
        boot=[(118,174),(134,177),(134,190),(149,193),(149,205),(113,205),(110,192)]),
    'medic': dict(lengths=(41,39), frame=8, hip=(97,136), other=(119,136), knee=(96,166), ankle=(88,210),
        hem=[(0,0),(256,0),(256,126),(129,126),(130,134),(111,138),(83,145),(79,131),(0,125)],
        thigh=[(83,131),(109,130),(110,146),(106,158),(103,170),(85,170),(82,155)],
        calf=[(86,162),(107,165),(104,176),(101,186),(97,202),(79,201),(80,180)],
        boot=[(79,198),(97,198),(97,215),(106,220),(106,233),(77,233),(78,213)]),
}


def cut(source, polygon):
    mask=Image.new('L', SIZE)
    ImageDraw.Draw(mask).polygon([(x*S,y*S) for x,y in polygon],fill=255)
    result=source.copy()
    result.putalpha(Image.fromarray(np.minimum(np.array(mask),np.array(source)[:,:,3])))
    return result


def warp(layer, p, q, tp, tq):
    p,q,tp,tq=[np.array(v,dtype=float) for v in (p,q,tp,tq)]
    v,w=q-p,tq-tp
    a,b=v/np.linalg.norm(v),w/np.linalg.norm(w)
    matrix=np.column_stack((b,[-b[1],b[0]])) @ np.diag((np.linalg.norm(w)/np.linalg.norm(v),1)) @ np.column_stack((a,[-a[1],a[0]])).T
    inv=np.linalg.inv(matrix); offset=(p-inv@tp)*S
    return layer.transform(SIZE,Image.Transform.AFFINE,(inv[0,0],inv[0,1],offset[0],inv[1,0],inv[1,1],offset[1]),Image.Resampling.BICUBIC)


def knee(hip,ankle,lengths):
    hip,ankle=np.array(hip,float),np.array(ankle,float)
    delta=ankle-hip;distance=np.linalg.norm(delta)
    l1,l2=lengths
    assert distance<l1+l2, distance
    d=delta/distance;along=(l1*l1-l2*l2+distance*distance)/(2*distance)
    return hip+d*along+np.array([d[1],-d[0]])*math.sqrt(l1*l1-along*along)


def sole_pose(t):
    # 60% support / 40% recovery gives overlap: one foot ALWAYS stays grounded.
    if t<.6:
        return 30-60*t/.6,0,0
    u=(t-.6)/.4
    return -30+60*(3*u*u-2*u*u*u),16*math.sin(math.pi*u)**2,-10*math.sin(math.pi*u)


def render(source,parts,cfg,t,rest=False):
    canvas=Image.new('RGBA',SIZE);joints=[]
    for far in (True,False):
        phase=(t+(.5 if far else 0))%1
        hip=np.array([(cfg['other'][0]+cfg['hip'][0])/2+(4 if far else -4),cfg['hip'][1]],float)
        dx,lift,angle=(0,0,0) if rest else sole_pose(phase)
        ankle=np.array([hip[0]+dx,210.])
        radians=math.radians(angle)
        boot=warp(parts['boot'],cfg['ankle'],(cfg['ankle'][0]+20,cfg['ankle'][1]),ankle,ankle+np.array([math.cos(radians),math.sin(radians)])*20)
        # Keep the sole on a fixed plane; never normalize a whole animated frame.
        dy=(232-lift)-boot.getbbox()[3]/S
        boot=boot.transform(SIZE,Image.Transform.AFFINE,(1,0,0,0,1,-dy*S),Image.Resampling.BICUBIC)
        ankle[1]+=dy;k=knee(hip,ankle,cfg['lengths'])
        limb=Image.new('RGBA',SIZE)
        limb.alpha_composite(boot)
        # Hidden overlap at the knee closes a cutout seam; original cloth stays visible.
        d=ImageDraw.Draw(limb)
        joint_color=source.getpixel((int(cfg['knee'][0]*S),int((cfg['knee'][1]-4)*S)))
        d.ellipse(((k[0]-7)*S,(k[1]-7)*S,(k[0]+7)*S,(k[1]+7)*S),fill=joint_color)
        limb.alpha_composite(warp(parts['calf'],cfg['knee'],cfg['ankle'],k,ankle))
        # Scout's thigh source starts on its raised leg, not the target pelvis.
        src_hip=(118,134) if cfg is CONFIG['scout'] else cfg['hip']
        limb.alpha_composite(warp(parts['thigh'],src_hip,cfg['knee'],hip,k))
        if far:
            a=np.array(limb);a[:,:,:3]=(a[:,:,:3]*.78).astype('uint8');limb=Image.fromarray(a)
        canvas.alpha_composite(limb)
        joints.append(dict(far=far,phase=phase,hip=hip.tolist(),knee=k.tolist(),ankle=ankle.tolist(),sole=232-lift,support=lift==0))
    canvas.alpha_composite(parts['hem'])
    return canvas.resize((256,256),Image.Resampling.LANCZOS),joints


def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    checks=[]
    for name,cfg in CONFIG.items():
        path=E/'source-before'/f'{name}.png'
        original=Image.open(path).convert('RGBA');i=cfg['frame']
        source=original.crop((i%4*256,i//4*256,(i%4+1)*256,(i//4+1)*256)).resize(SIZE,Image.Resampling.LANCZOS)
        parts={key:cut(source,cfg[key]) for key in ('hem','thigh','calf','boot')}
        for key,part in parts.items():part.resize((256,256),Image.Resampling.LANCZOS).save(E/f'{name}-{key}.png')
        frames=[];records=[]
        for i in range(16):
            frame,joints=render(source,parts,cfg,i/16)
            alpha=np.array(frame)[:,:,3]
            assert not alpha[0].any() and not alpha[-1].any() and not alpha[:,0].any() and not alpha[:,-1].any()
            assert any(j['support'] for j in joints)
            frames.append(frame)
            records.append(dict(frame=i,bbox=frame.getbbox(),sha256=hashlib.sha256(frame.tobytes()).hexdigest(),joints=joints))
        assert len({r['sha256'] for r in records})==16
        # The entire upper-body image is identical throughout the moving cycle.
        assert all(f.crop((0,0,256,120)).tobytes()==frames[0].crop((0,0,256,120)).tobytes() for f in frames)
        atlas=Image.new('RGBA',(1024,1024))
        for i,frame in enumerate(frames):atlas.alpha_composite(frame,(i%4*256,i//4*256))
        out=ROOT/'assets/resources/roster'/f'{name}-run.png';atlas.save(out)
        meta=out.with_suffix('.png.meta');assert digest(meta)==digest(E/'source-before'/meta.name)
        # An upright idle uses the exact same torso (also removes scout's baked muzzle flash).
        idle,_=render(source,parts,cfg,0,rest=True)
        base=original.copy();base.paste(idle,(0,512));base.save(out.with_name(f'{name}.png'))
        contact=Image.new('RGBA',atlas.size,'#283731');contact.alpha_composite(atlas);contact.convert('RGB').save(E/f'{name}-contact.jpg')
        previews=[]
        for frame in frames:
            bg=Image.new('RGBA',(256,256),'#283731');d=ImageDraw.Draw(bg);d.ellipse((69,223,157,241),fill='#18231e');bg.alpha_composite(frame);previews.append(bg.convert('RGB'))
        previews[0].save(E/f'{name}-preview.gif',save_all=True,append_images=previews[1:],duration=40,loop=0)
        old=E/'source-before'/f'{name}-run.png'
        oldim=Image.open(old);tops=[oldim.crop((i%4*256,i//4*256,(i%4+1)*256,(i//4+1)*256)).getbbox()[1] for i in range(8)]
        checks.append(dict(hero=name,source=str(path.relative_to(ROOT)),source_sha256=digest(path),source_frame=cfg['frame'],output=str(out.relative_to(ROOT)),sha256=digest(out),idle_atlas_sha256=digest(out.with_name(f'{name}.png')),meta_sha256=digest(meta),old_head_top_range=[min(tops),max(tops)],new_head_top_range=[min(r['bbox'][1] for r in records),max(r['bbox'][1] for r in records)],frames=records))
    (E/'gait-artifact-checks.json').write_text(json.dumps(dict(method='Frozen original cutout torso and textured leg parts, two-bone IK, 60% support phase, 16 continuous frames; base atlas frame 8 becomes matched idle',new_remote_cost_cny=0,assets=checks),indent=2))
    print('Baked 3 grounded 16-frame walks; upper body invariant, support feet checked, metadata unchanged.')


if __name__=='__main__':main()
