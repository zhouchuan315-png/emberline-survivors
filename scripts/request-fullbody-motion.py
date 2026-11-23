"""Fresh-schema guarded submissions for the full-body animation correction."""
import os
from pathlib import Path
import json,datetime,hashlib,urllib.request,sys
import jsonschema
R=Path(__file__).resolve().parents[1];E=R/'evidence/materials-20260928-fullbody-motion'
BASE = os.environ.get('MATERIAL_API_BASE', 'https://example.invalid/ability-agent/api/v2/material-generation')
sources=json.loads((R/'evidence/materials-20260928-anime-heroes/heroes/batch-latest.json').read_text())['result']['materials']
REFS={m['material_id'].split('-')[-1]:m['results'][0] for m in sources}
WALK='Animate the exact adult anime heroine in the reference image as a polished hand-drawn 2D game animation. Preserve her face, hair, costume colors, anatomy and exact rifle design throughout. Full body ALWAYS visible with generous margin. Fixed orthographic camera, same 3/4 side view facing RIGHT for the ENTIRE clip. Flat solid magenta chroma-key background without floor, scenery, text, shadows, effects, lighting changes, or camera movement. The character stays centered IN PLACE as on an invisible treadmill, NO movement across the screen, NO turning. Start moving immediately and repeat a brisk natural tactical jog continuously for five seconds. Feet alternate naturally: heel contact, weight acceptance, toe push-off, bent-knee recovery, next heel contact. Legs drive motion, pelvis rotates subtly, torso counter-rotates, shoulders and elbows absorb each step. Head and neck respond softly to the stride with slight nod and counter-motion, eyes looking ahead; hair and jacket hems have restrained follow-through. Her two hands maintain a secure grip on the gun aimed forward, but the arms, gun and shoulders all move naturally together. Keep gentle vertical weight transfer, NOT hopping, NOT high knees, NOT a frozen upper body, NOT a static pasted head, NOT a robotic cutout puppet. Consistent body volume, smooth animation spacing, readable silhouette. Repeat the same two-step cycle several times, end near a matching cycle pose. No firing and no muzzle flash. Crisp clean anime linework, no motion blur.'

def submit(stage,materials):
 d=E/stage;d.mkdir(exist_ok=True)
 if (d/'submission-attempt.json').exists():raise SystemExit('Already attempted. Query existing receipt; do NOT resend.')
 static=json.loads((E/'static_image.json').read_text())['result'];ss=dict(static['json_schema']);ss['properties']={**ss['properties'],**static['common_fields']}
 for item in materials:
  raw=json.loads((E/(item['type']+'.json')).read_text())['result'];schema=dict(raw['json_schema']);schema['properties']={**schema['properties'],**raw['common_fields']}
  schema['$defs']={'StaticImageMaterial':ss}
  # Resolve the only image-union branch used by these requests, from live schema.
  for key in ('reference_images','input_images'):
   if key in item:schema['properties'][key]={'type':'array','items':{'$ref':'#/$defs/StaticImageMaterial'}}
  jsonschema.validate(item,schema)
 payload=json.dumps({'materials':materials,'submitter':'codex-fullbody-20260928-'+stage},ensure_ascii=False).encode()
 (d/'request.json').write_bytes(payload);(d/'submission-attempt.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'request_sha256':hashlib.sha256(payload).hexdigest(),'count':len(materials),'automatic_retries':0,'state':'submission_unknown_until_receipt'},indent=2))
 with urllib.request.urlopen(urllib.request.Request(BASE+'/batch',data=payload,headers={'Content-Type':'application/json'}),timeout=55) as r:response=json.load(r)
 (d/'submission-response.json').write_text(json.dumps(response,ensure_ascii=False,indent=2))
 assert response['code']==0 and response['result']['batch_id'] and response['result']['material_count']==len(materials)
 print(json.dumps(response,ensure_ascii=False))

def video(hero):
 return dict(id='fullbody-20260928-'+hero+'-walk',type='doubao_llm_generated_video',prompt=WALK,model='doubao-seedance-2-0-260128',reference_images=[{'type':'static_image','url':REFS[hero]}],frames=121,aspect_ratio='1:1',resolution='720p',camera_fixed=True,generate_audio=False,return_last_frame=False,max_retries=0,max_attempts=120,poll_interval=5)

ACTIONS='Create a polished hand-drawn 2D game animation of the exact adult anime heroine in the reference image. Preserve her face, hairstyle, body proportions, costume and exact weapon. Single full-body character, fixed orthographic 3/4 side view facing RIGHT the entire time. Completely static camera. Pure uniform magenta chroma-key background, no floor, shadows, scenery, text or effects. Keep both boots planted and entire body centered with generous clear margins. A SEVEN SECOND continuous acting animation: seconds 0-2 alert IDLE, a soft natural breath in and out, shoulders relax, head makes a tiny alert nod and a blink, fringe and ponytail follow; seconds 2-5 RELOAD, she lowers the gun slightly, looks down at the magazine, her left hand leaves the foregrip and reaches her belt, pulls a fresh magazine, inserts it into the rifle and returns to the foregrip while head and shoulders follow the action; seconds 5-7 she raises the rifle and FIRES three short controlled shots to the right with convincing shoulder absorption and recovery, subtle head and hair reaction. NO muzzle flash or bullet particles (these will be added by the game). Smooth natural weight transfer and whole-body coordination, not an unmoving pasted head, not a sliding paper puppet. Hands maintain believable contact with weapon; no extra limbs, no changing rifle, no new objects except the magazine. Both feet remain planted at the same ground level. Crisp anime linework, no motion blur, no camera zoom, no turn to front.'

def actions_video(hero):
 item=video(hero);item.update(id='fullbody-20260928-'+hero+'-actions',prompt=ACTIONS,frames=169)
 return item

if __name__=='__main__':
 if len(sys.argv)!=1:raise SystemExit('Only the reviewed pilot is submitted from CLI.')
 submit('walk-pilot',[video('vanguard')])
