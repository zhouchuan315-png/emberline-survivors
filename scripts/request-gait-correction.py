"""Single-pose correction for rejected nearly identical walk-sheet frames."""
from pathlib import Path
import datetime, hashlib, json, urllib.request
import jsonschema
ROOT=Path(__file__).resolve().parents[1]
E=ROOT/'evidence/materials-20260923-animation/gait-correction'
BASE='https://api-test-new-v2.fxbusiness.cn:30685/ability-agent/api/v2/material-generation'
s=json.loads((E/'material-schema.json').read_text())['result']
schema={**s['json_schema'],'properties':{**s['json_schema']['properties'],**s['common_fields']}}
ss=json.loads((E.parent/'static-image-schema.json').read_text())['result']
static={**ss['json_schema'],'properties':{**ss['json_schema']['properties'],**ss['common_fields']}}
schema['properties']['input_images']={'type':'array','items':static}
old=json.loads((ROOT/'evidence/materials-20260923/batch-latest.json').read_text())['result']
refs={m['material_id'].rsplit('-',1)[1]:m['results'][0] for m in old['materials']}
looks={'survivor':'Orange hooded gas-mask survivor, olive backpack, black rifle held steadily in both hands aimed right. Fast athletic run.',
       'zombie':'Moss green zombie in torn olive work jacket and dark trousers, claw arms reach right. Exaggerated shambling walk.',
       'brute':'Massive green muscular mutant with orange safety vest and dark boots, oversized fists. Lumbering stomp walk.'}
poses={
 'cross':'PASSING POSE. Both legs are close TOGETHER underneath the hips. One boot PLANTED directly below the torso. The other leg bends sharply BACKWARDS at the knee so its raised boot is behind the buttocks. NO wide split stride. The silhouette below the waist is narrow, shaped like the number 4.',
 'opposite':'OPPOSITE STRIDE. The leg nearest the viewer reaches far FORWARD to the RIGHT with boot on ground. The far leg reaches BACK to the LEFT. This reverses the reference leg positions. Wide clear inverted-V silhouette, front knee bent, back leg straight. Weight pitched forward.',
 'lift':'HIGH KNEE PASSING POSE. One thigh lifted high toward the RIGHT, knee at hip level, shin bent down, boot floating high above ground. Other leg nearly straight vertically supporting weight. Strong unmistakable runner silhouette, raised thigh HORIZONTAL. NO two boots on ground.'}
materials=[]
for name,look in looks.items():
 for pose,desc in poses.items():
  prompt=('Draw ONE full-body 2D game sprite in a NEW LEG POSE. This is an animation keyframe, NOT a copy of the reference. '
   'Use reference ONLY for costume, face and hand-inked graphic-novel style. You MUST REDRAW BOTH LEGS to follow this exact pose: '+desc+' '+look+
   ' Same three-quarter overhead camera facing RIGHT. Same head-to-body proportions as reference. Entire body and all feet visible, '
   'centered at consistent scale occupying 70 percent of canvas. Flat solid magenta #FF00FF background; no floor, no shadows, no text, '
   'no grid, no border. Crisp dark outlines, olive and amber limited colors, not pixel art. Visible articulated knees and boots.')
  m={'id':f'emberline-gait-{name}-{pose}','type':s['type'],'model':'doubao-seedream-5-0-260128',
     'prompt':prompt,'input_images':[{'type':'static_image','id':f'ref-{name}-{pose}','url':refs[name]}],
     'size':'2048x2048','watermark':False,'max_retries':0}
  jsonschema.validate(m,schema);materials.append(m)
payload=json.dumps({'materials':materials,'submitter':'codex-emberline-gait-correction-20260923'},ensure_ascii=False,indent=2).encode()
assert not (E/'submission-attempt.json').exists(),'Existing submission must be reconciled, not repeated.'
(E/'request.json').write_bytes(payload)
(E/'submission-attempt.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'sha256':hashlib.sha256(payload).hexdigest(),'parent_batch':'1541cf6d-930e-4b54-a195-5f79394e9131',
 'reason':'Walk rows repeated the reference leg stance; rejected for gait. Correct with distinct single-pose renders.',
 'image_limit':9,'max_retries':0,'expected_cost_cny':1.98,'status':'submission_unknown_until_receipt'},indent=2))
with urllib.request.urlopen(urllib.request.Request(BASE+'/batch',data=payload,headers={'Content-Type':'application/json'}),timeout=40) as r:result=json.load(r)
(E/'submission-response.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
assert result['code']==0 and result['result']['batch_id'] and result['result']['material_count']==9
print(json.dumps(result,ensure_ascii=False))
