"""Download approved batch outputs and derive transparent, padded engine sprites."""
from pathlib import Path
import json, urllib.request, urllib.parse, hashlib
import numpy as np
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
E=ROOT/'evidence/materials-20260923'
OUT=ROOT/'assets/resources/art'
b=json.loads((E/'batch-latest.json').read_text())['result']
assert b['total_count']==b['completed_count']==4 and b['failed_count']==0
checks=[]
for m in b['materials']:
    assert m['status']=='success' and m['generate_result']['success'] and not m['generate_result']['errors']
    assert not m['action_results'] and m['results']
    name=m['material_id'].rsplit('-',1)[1]
    u=m['results'][0]
    assert urllib.parse.urlparse(u).scheme=='https'
    raw=E/(name+'-original.jpeg')
    if not raw.exists():
        with urllib.request.urlopen(u,timeout=40) as response: data=response.read(20*1024*1024+1)
        assert len(data)<=20*1024*1024
        raw.write_bytes(data)
    im=Image.open(raw).convert('RGB')
    assert im.size == ((2560,1536) if name=='arena' else (2048,2048)), im.size
    if name=='arena':
        final=im.resize((1600,960),Image.Resampling.LANCZOS)
    else:
        a=np.array(im).astype(float)
        # Key by magenta chroma, not luminance; preserve pale eyes and highlights.
        key=np.minimum(a[:,:,0],a[:,:,2])-a[:,:,1]
        alpha=np.clip((100-key)/65,0,1)
        a[:,:,0]=np.minimum(a[:,:,0],a[:,:,1]+90)
        a[:,:,2]=np.minimum(a[:,:,2],a[:,:,1]+65)
        rgba=np.dstack([a,alpha*255]).astype('uint8')
        fg=Image.fromarray(rgba,'RGBA'); bbox=fg.getbbox()
        assert bbox and (alpha==0).mean()>.2 and (alpha>.9).mean()>.1
        fg=fg.crop(bbox);fg.thumbnail((448,456),Image.Resampling.LANCZOS)
        final=Image.new('RGBA',(512,512));final.alpha_composite(fg,((512-fg.width)//2,480-fg.height))
    path=OUT/(name+'.png');final.save(path)
    checks.append(dict(name=name,path=str(path.relative_to(ROOT)),size=final.size,mode=final.mode,
                       original_sha256=hashlib.sha256(raw.read_bytes()).hexdigest(),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                       consume=m['generate_result']['consume']))
sheet=Image.new('RGB',(1400,760),'#11191a')
arena=Image.open(OUT/'arena.png');arena.thumbnail((900,540));sheet.paste(arena,(0,0))
for i,name in enumerate(['survivor','zombie','brute']):
    img=Image.open(OUT/(name+'.png'));img.thumbnail((240,240));sheet.paste(img,(80+i*300,510),img)
    large=Image.open(OUT/(name+'.png'));large.thumbnail((240,240));sheet.paste(large,(1080,i*245),large)
sheet.save(E/'contact-sheet.jpg')
(E/'artifact-checks.json').write_text(json.dumps(dict(files=checks,total_cost_cny=.88,
    remote_evaluator='not_used',local_check='dimensions,decode,alpha,hash passed; visual review recorded separately'),ensure_ascii=False,indent=2))
print(json.dumps(checks,ensure_ascii=False,indent=2))
