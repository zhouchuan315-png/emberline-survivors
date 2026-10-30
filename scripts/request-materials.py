"""Submit this frozen, schema-checked art batch ONCE; never auto-resubmit."""
import json, hashlib, datetime, urllib.request
from pathlib import Path
import jsonschema

ROOT = Path(__file__).resolve().parents[1]
E = ROOT / 'evidence/materials-20260923'
BASE = 'https://api-test-new-v2.fxbusiness.cn:30685/ability-agent/api/v2/material-generation'
STYLE = ('Premium hand-painted 2D game art, gritty graphic-novel illustration, chunky readable silhouettes, '
         'crisp dark outlines, muted charcoal and olive palette with warm amber highlights. Not pixel art, '
         'not a photograph, not a 3D render. No text, no logos, no interface, no watermark. ')
prompts = {
 'arena': STYLE + 'A directly overhead orthographic view of an abandoned industrial evacuation yard at night, rectangular landscape game arena. '
   'Flat cracked dark concrete with subtle worn parking lines, rain stains and small weeds. An open uncluttered combat space fills central 80 percent. '
   'ONLY along the extreme outer border: shipping containers, chain-link fence, concrete barriers, one wrecked truck, scattered crates, amber emergency lamps. '
   'No people, no monsters. Absolutely no horizon or sky. Even top-down view, low contrast detailed ground, quietly cinematic, playable level background.',
 'survivor': STYLE + 'Exactly ONE full-body survivor character game sprite, three-quarter overhead view like a classic top-down action RPG. '
   'Stocky scavenger wearing a mustard-orange hooded jacket, dark tactical trousers, boots, small olive backpack, charcoal gas mask. '
   'Holding a compact black rifle in both hands pointing toward the right of the image. Facing right and slightly down. '
   'Large readable head, heroic compact proportions, entire feet and weapon visible. Centered, occupies 70 percent of canvas. '
   'Solid perfectly uniform bright magenta #FF00FF background for chroma-key extraction. No ground, no cast shadow, no magenta on character.',
 'zombie': STYLE + 'Exactly ONE full-body zombie game sprite, three-quarter overhead view like a classic top-down action RPG. '
   'A shambling infected worker with pale moss-green skin, luminous pale yellow eyes, torn desaturated olive work jacket and dark trousers, arms reaching forward. '
   'Facing right and slightly down, entire feet visible, readable chunky silhouette, no gore. Centered, occupies 70 percent of canvas. '
   'Solid perfectly uniform bright magenta #FF00FF background for chroma-key extraction. No ground, no cast shadow, no magenta on character.',
 'brute': STYLE + 'Exactly ONE full-body hulking zombie mutant game sprite, three-quarter overhead view like a classic top-down action RPG. '
   'Huge muscular infected industrial worker with moss-green skin, glowing amber eyes, ragged rusty orange safety vest, heavy dark boots, one enormous fist. '
   'Facing right and slightly down, whole body visible, intimidating chunky silhouette, no gore. Centered, occupies 70 percent of canvas. '
   'Solid perfectly uniform bright magenta #FF00FF background for chroma-key extraction. No ground, no cast shadow, no magenta on character.'
}
if (E/'submission-attempt.json').exists():
    raise SystemExit('Submission intent exists. Reconcile the recorded batch; do not blindly resubmit.')
s = json.loads((E/'material-schema.json').read_text())['result']
schema = dict(s['json_schema'])
schema['properties'] = {**schema['properties'], **s['common_fields']}
schema['required'] = [*schema.get('required', []), 'id']
materials = [dict(id=f'emberline-20260923-{name}', type=s['type'], prompt=prompt,
                  model='doubao-seedream-5-0-260128', size='2560x1536' if name=='arena' else '2048x2048',
                  watermark=False, max_retries=0) for name,prompt in prompts.items()]
for m in materials: jsonschema.validate(m, schema)
request = dict(materials=materials, submitter='codex-emberline-20260923')
payload = json.dumps(request, ensure_ascii=False).encode()
(E/'request.json').write_bytes(payload)
(E/'submission-attempt.json').write_text(json.dumps(dict(
    at=datetime.datetime.now(datetime.timezone.utc).isoformat(), sha256=hashlib.sha256(payload).hexdigest(),
    status='submission_unknown_until_receipt', image_limit=4, retries=0,
    budget='One batch of four images, no automatic paid regeneration; service actual consume recorded on completion.'), indent=2))
req=urllib.request.Request(BASE+'/batch', data=payload, headers={'Content-Type':'application/json'})
with urllib.request.urlopen(req,timeout=40) as r: result=json.load(r)
(E/'submission-response.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
assert result['code']==0 and result['result']['batch_id'] and result['result']['material_count']==4, result
print(json.dumps(result,ensure_ascii=False))
