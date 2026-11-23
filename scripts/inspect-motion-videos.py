"""Poll only recorded batches, download accepted video URLs, make contact sheets."""
import os
from pathlib import Path
import sys,json,urllib.request,urllib.parse,subprocess,hashlib
from concurrent.futures import ThreadPoolExecutor
from PIL import Image,ImageDraw
import numpy as np
R=Path(__file__).resolve().parents[1];E=R/'evidence/materials-20260928-fullbody-motion'
BASE = os.environ.get('MATERIAL_API_BASE', 'https://example.invalid/ability-agent/api/v2/material-generation') + '/batch/'

def key_image(image):
 a=np.array(image.convert('RGB')).astype(float);chroma=np.minimum(a[:,:,0],a[:,:,2])-a[:,:,1]
 alpha=np.clip((88-chroma)/48,0,1);alpha[alpha<.04]=0
 edge=alpha<.98;a[edge,0]=np.minimum(a[edge,0],a[edge,1]+25);a[edge,2]=np.minimum(a[edge,2],a[edge,1]+25);a[alpha==0]=0
 return Image.fromarray(np.uint8(np.dstack((a,alpha*255))))

def poll(stage):
 d=E/stage;r=json.loads((d/'submission-response.json').read_text())
 with urllib.request.urlopen(BASE+r['result']['batch_id'],timeout=40) as response:b=json.load(response)
 (d/'batch-latest.json').write_text(json.dumps(b,ensure_ascii=False,indent=2));assert b['code']==0
 state=b['result'];print(stage,state['status'],state['completed_count'],state['failed_count'],flush=True)
 if state['status'] not in ('completed','failed'):return
 for m in state['materials']:
  if m['status']!='success':print(m['material_id'],m['error_message'],m.get('generate_result'));continue
  assert m['generate_result']['success'] and not m['generate_result']['errors'] and not m['action_results'] and m['results']
  name=m['material_id'].removeprefix('fullbody-20260928-');p=d/(name+'.mp4')
  url=m['results'][0];assert urllib.parse.urlparse(url).scheme=='https'
  if not p.exists():
   with urllib.request.urlopen(url,timeout=60) as response:
    data=response.read(120*1024*1024+1);assert len(data)<120*1024*1024
   p.write_bytes(data)
  probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)]))
  (d/(name+'-probe.json')).write_text(json.dumps(probe,indent=2))
  frames=d/(name+'-frames');frames.mkdir(exist_ok=True)
  if not list(frames.glob('*.png')):
   subprocess.run(['ffmpeg','-v','error','-i',str(p),'-vf','fps=24','-compression_level','3',str(frames/'%04d.png')],check=True)
  paths=sorted(frames.glob('*.png'));indices=list(range(0,len(paths),4));sheet=Image.new('RGB',(8*180,((len(indices)+7)//8)*200),'#203639');draw=ImageDraw.Draw(sheet)
  for j,i in enumerate(indices):
   im=Image.open(paths[i]).convert('RGB');im.thumbnail((180,180));sheet.paste(im,(j%8*180,j//8*200));draw.text((j%8*180+8,j//8*200+180),f'{i:03d} / {i/24:.2f}s',fill='white')
  sheet.save(d/(name+'-contact.jpg'))
  print(name,probe['format'].get('duration'),len(paths),'frames',hashlib.sha256(p.read_bytes()).hexdigest(),flush=True)

if __name__=='__main__':
 with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(poll,sys.argv[1:] or ['walk-pilot','actions-pilot']))
