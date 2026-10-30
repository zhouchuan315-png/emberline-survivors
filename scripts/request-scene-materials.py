"""Frozen scene-art batch. One submission; never retry an ambiguous POST."""
import json, hashlib, datetime, urllib.request
from pathlib import Path
import jsonschema
R=Path(__file__).resolve().parents[1]; E=R/'evidence/materials-20260924-scene'
BASE='https://api-test-new-v2.fxbusiness.cn:30685/ability-agent/api/v2/material-generation'
STYLE=('Premium hand-painted 2D zombie survival game art, gritty inked graphic novel, crisp dark outlines, desaturated charcoal and olive palette, restrained rust and amber accents. Not pixel art, not photograph, not glossy 3D render. No text, no letters, no logos, no UI, no watermark. ')
PROP=('Exactly ONE isolated game environment prop, orthographic three-quarter overhead camera looking down at about 65 degrees; see top and a SHORT front face. Long edges HORIZONTAL, short edges VERTICAL, NOT diamond isometric, no diagonally rotated object. Entire object centered, wide generous empty margins, solid perfectly uniform pure magenta #ff00ff background. No floor, no background scenery, no cast shadow outside object, no magenta on prop. ')
prompts={
 'ground':STYLE+'A perfectly seamless tileable square texture of abandoned industrial yard concrete, orthographic directly overhead. Flat uninterrupted dark grey green concrete, subtle fine grain, shallow sparse hairline cracks, tiny faint worn aggregate. Very low contrast, uniform brightness to all four edges. NO large features, NO pavement grid, NO walls, NO curbs, NO objects, NO roads, NO stripes, NO people, NO horizon, NO vignette, NO directional lighting. Repeatable level floor texture, calm backdrop for readable characters.',
 'container':STYLE+PROP+'One long olive-green corrugated steel cargo shipping container. Closed doors on short right end, broad horizontal rectangular roof, ribbed metal texture, worn edges and small rust patches. Width 2.5 times visible height. Chunky readable silhouette. Only roof and short lower front vertical face are visible, minimal perspective.',
 'barricade':STYLE+PROP+'One low heavy grey concrete Jersey road barrier, wide rectangular shape, weathered concrete, small worn mustard hazard paint panels, chipped corners. Front face visible under narrow roof, width 3.2 times height. Solid portable barricade, no attached objects.',
 'crates':STYLE+PROP+'One compact clustered stack of three military supply crates forming a single squared obstacle footprint. Olive painted wood, dark steel braces, one smaller crate on top at back. Clearly readable heavy boxes, subtle warm highlights, width 1.4 times visible height.',
 'car':STYLE+PROP+'One abandoned compact dark desaturated teal utility car, wrecked hood and cracked windows but intact readable vehicle silhouette. The car points RIGHT, horizontal side view from high overhead; rectangular roof and hood clearly visible, wheels close to body. Width 2.2 times height. No dramatic smashed debris, no smoke, no flames.'}
if (E/'submission-attempt.json').exists(): raise SystemExit('Submission already attempted; reconcile existing receipt, never auto-resubmit.')
s=json.loads((E/'doubao-schema.json').read_text())['result'];schema=dict(s['json_schema']);schema['properties']={**schema['properties'],**s['common_fields']};schema['required']=[*schema.get('required',[]),'id']
materials=[{'id':'emberline-scene-20260924-'+name,'type':s['type'],'prompt':prompt,'model':'doubao-seedream-5-0-260128','size':'2048x2048','watermark':False,'max_retries':0} for name,prompt in prompts.items()]
for material in materials: jsonschema.validate(material,schema)
request={'materials':materials,'submitter':'codex-emberline-scene-20260924'};payload=json.dumps(request,ensure_ascii=False).encode()
(E/'request.json').write_bytes(payload)
(E/'submission-attempt.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sha256':hashlib.sha256(payload).hexdigest(),'status':'submission_unknown_until_receipt','image_limit':5,'automatic_retries':0,'schema_validation':'Only provided scalar fields; unused union refs omitted.'},indent=2))
req=urllib.request.Request(BASE+'/batch',data=payload,headers={'Content-Type':'application/json'})
with urllib.request.urlopen(req,timeout=55) as response:result=json.load(response)
(E/'submission-response.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
assert result['code']==0 and result['result']['batch_id'] and result['result']['material_count']==5,result
print(json.dumps(result,ensure_ascii=False))
