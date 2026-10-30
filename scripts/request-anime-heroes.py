"""This round only. Guarded submissions validated against freshly fetched schemas."""
import json, hashlib, datetime, urllib.request, sys
from pathlib import Path
import jsonschema

R=Path(__file__).resolve().parents[1]
E=R/'evidence/materials-20260928-anime-heroes'
BASE='https://api-test-new-v2.fxbusiness.cn:30685/ability-agent/api/v2/material-generation'
STYLE='Production-quality original Japanese anime game character illustration, beautiful adult woman age 24, expressive large anime eyes, refined face, crisp dark line art, clean cel shading with subtle painted gradients. Stylized 5-head-tall adult game proportions, slim athletic build, NOT a child, NOT baby chibi, NOT pixel art, NOT 3D. '
POSE='ONE single full-body character centered on pure flat saturated magenta #ff00ff background, no ground, no cast shadow, no text, no UI, no frame. Full head and both boots visible with generous margin. Three-quarter side view facing RIGHT, face visible from front-right, both hands firmly holding a compact short firearm aimed horizontally RIGHT at chest height. Calm alert standing pose, steady upright torso, hips level. Two legs visibly separated, nearly straight, parallel shins, both boots planted on the same horizontal baseline, boots pointing right. Short jacket ends at waist and does NOT cover thighs or knees. Clearly readable hips, knees and ankles, no dangling straps, no long coat or cape, no skirt. Hair stays above the waist and does not hide legs. Every hand has natural grip. Bright readable silhouette for an overhead action game. '
DESIGNS={
 'vanguard':'JINHUO, assault heroine: rich auburn-red shoulder-length hair tied in a high short ponytail with golden clip, amber eyes, confident determined smile. Mustard-orange cropped tactical bomber jacket with charcoal shoulder armor, black fitted undersuit, dark charcoal fitted tactical trousers with orange knee guards, black ankle-high combat boots with amber details, compact black and orange assault carbine. Tiny orange utility pouch, no large backpack.',
 'scout':'YE SUN, agile recon heroine: silver-white chin-length bob with a small teal side braid, teal eyes, composed alert expression, no mask, face unobstructed. Short teal and charcoal tactical jacket, high-neck dark fitted undersuit, graphite fitted trousers, sleek black ankle boots with teal details and light knee guards, compact black and teal submachine gun. Small earpiece, no cap, no large backpack.',
 'medic':'BAI ZHI, combat medic heroine: ash-blonde hair in a neat short bob with small side bun, warm violet eyes, kind confident expression. Ivory-white cropped medical tactical jacket with small muted-red medical patch, black fitted undersuit, light grey fitted trousers with charcoal articulated knee guards, ivory and charcoal ankle boots, compact ivory and graphite carbine, small cream medical belt pouch. No nurse dress, no skirt, no large backpack.'
}

def submit(stage,materials):
 folder=E/stage;folder.mkdir(exist_ok=True)
 if (folder/'submission-attempt.json').exists():raise SystemExit('Submission already attempted. Query its receipt; NEVER resend.')
 s=json.loads((E/'doubao-schema.json').read_text())['result'];schema=dict(s['json_schema']);schema['properties']={**schema['properties'],**s['common_fields']}
 # Only primitive fields in this stage; reference schemas must be supplied explicitly.
 static=E/'static-schema.json'
 if static.exists():
  t=json.loads(static.read_text())['result'];ts=dict(t['json_schema']);ts['properties']={**ts['properties'],**t['common_fields']};schema['$defs']={'StaticImageMaterial':ts}
  schema['properties']['input_images']={'type':'array','items':{'$ref':'#/$defs/StaticImageMaterial'}}
 for m in materials:jsonschema.validate(m,schema)
 payload=json.dumps({'materials':materials,'submitter':'codex-anime-heroes-20260928-'+stage},ensure_ascii=False).encode()
 (folder/'request.json').write_bytes(payload)
 (folder/'submission-attempt.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sha256':hashlib.sha256(payload).hexdigest(),'image_limit':len(materials),'automatic_retries':0,'status':'submission_unknown_until_receipt'},indent=2))
 with urllib.request.urlopen(urllib.request.Request(BASE+'/batch',data=payload,headers={'Content-Type':'application/json'}),timeout=55) as r:result=json.load(r)
 (folder/'submission-response.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
 assert result['code']==0 and result['result']['batch_id'] and result['result']['material_count']==len(materials)
 print(json.dumps(result,ensure_ascii=False))

if __name__=='__main__':
 if len(sys.argv)>1:raise SystemExit('No automatic re-submission. Additional stages use explicit reviewed requests.')
 materials=[dict(id='anime-20260928-'+k,type='doubao_llm_generated_image',prompt=STYLE+POSE+v,model='doubao-seedream-5-0-260128',size='2048x2048',watermark=False,max_retries=0) for k,v in DESIGNS.items()]
 submit('heroes',materials)
