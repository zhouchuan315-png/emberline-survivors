"""One recorded batch; current Apifox/runtime schemas are frozen beside the receipt."""
from pathlib import Path
import datetime, hashlib, json, sys, urllib.request
import jsonschema

ROOT = Path(__file__).resolve().parents[1]
E = ROOT / 'evidence/materials-20260923-animation'
BASE = 'https://api-test-new-v2.fxbusiness.cn:30685/ability-agent/api/v2/material-generation'

def schema(name):
    s = json.loads((E / name).read_text())['result']
    return {**s['json_schema'], 'properties': {**s['json_schema']['properties'], **s['common_fields']}}

image_schema = schema('material-schema.json')
static_schema = schema('static-image-schema.json')
# This request only supplies the static_image branch. Validate that branch separately;
# do not pretend the server returned the definitions for unused recursive unions.
image_schema['properties']['input_images'] = {'type': 'array', 'items': static_schema}
old = json.loads((ROOT / 'evidence/materials-20260923/batch-latest.json').read_text())['result']
references = {m['material_id'].rsplit('-', 1)[1]: m['results'][0] for m in old['materials']}
layout = ('Create a precise production 2D animation sprite sheet. EXACTLY 4 columns and 4 rows, '
          '16 equally sized square cells on a 2048x2048 canvas. Each cell is 512x512. '
          'NO drawn grid lines, no borders, no labels, no text. Background everywhere pure flat magenta #FF00FF. '
          'One full body pose per cell, every body entirely inside its own cell with generous padding. '
          'Same character, same proportions, same zoom, same costume, same lighting, identical three-quarter '
          'overhead camera FACING RIGHT in ALL cells. Do NOT turn around. No ground plane, no cast shadows. '
          'Character feet on the same baseline at 88 percent of each cell height; torso stays horizontally centered. '
          'Match the supplied reference character and gritty hand-inked comic-book game art exactly. '
          'Draw genuinely different limb poses, NOT repeated copies. ')
characters = {
    'survivor': ('The orange hood, gas mask, olive backpack and black rifle must stay consistent. '
                 'Cells 1-8 (first two rows left-to-right): eight sequential frames of a smooth athletic RUN cycle, '
                 'alternating extended and bent legs, clear passing poses, rifle held steady aiming right. '
                 'Cells 9-12 (row three): four sequential standing SHOOT recoil poses, brace, rifle kicks back, '
                 'shoulder absorbs recoil, settle. Do not draw muzzle fire; effects will be separate. '
                 'Cells 13-16 (row four): four DEATH poses, knees buckle, fall sideways, land, lie still. No gore.'),
    'zombie': ('The moss-green skin, torn olive work shirt and dark trousers must stay consistent. '
               'Cells 1-8 (first two rows): eight sequential SHAMBLING WALK frames, alternate left and right legs, '
               'bent knees, swaying reaching arms, distinctive changes to silhouette. '
               'Cells 9-12 (row three): four ATTACK frames, pull arms back, lunge, swipe both claws forward, recover. '
               'Cells 13-16 (row four): four DEATH frames, recoil, knees buckle, fall sideways, lie still. No gore.'),
    'brute': ('The huge moss-green muscular industrial mutant with ragged orange safety vest and heavy boots '
              'must stay consistent. Cells 1-8 (first two rows): eight sequential heavy STOMP WALK frames, '
              'alternating legs with massive weight shift and swinging oversized fists. '
              'Cells 9-12 (row three): four ATTACK frames, raise enormous fist, wind up, smash downward, recover. '
              'Cells 13-16 (row four): four DEATH frames, stagger, drop to one knee, topple, lie still. No gore.')
}
materials = []
for name, action in characters.items():
    ref = {'id': f'emberline-animation-ref-{name}', 'type': 'static_image', 'url': references[name]}
    jsonschema.validate(ref, static_schema)
    materials.append({'id': f'emberline-20260923-animation-{name}', 'type': 'doubao_llm_generated_image',
                      'prompt': layout + action, 'model': 'doubao-seedream-5-0-260128',
                      'input_images': [ref], 'size': '2048x2048', 'watermark': False, 'max_retries': 0})
materials.append({'id': 'emberline-20260923-animation-effects', 'type': 'doubao_llm_generated_image',
    'model': 'doubao-seedream-5-0-260128', 'size': '2048x2048', 'watermark': False, 'max_retries': 0,
    'prompt': 'Hand-painted comic-book combat VFX sprite sheet, EXACTLY 4 columns by 4 rows of equal 512 pixel cells '
    'on a 2048x2048 canvas, no grid lines, no letters or numbers. Pure uniform magenta #FF00FF background. '
    'Each effect completely inside its cell with generous 20 percent margins. No objects or people. '
    'Row 1: four sequential animation frames of a rifle MUZZLE FLASH aimed right: small ignition, sharp long '
    'orange flame with white-yellow hot core, contracting flame, tiny fading ember. Origin at the center of each cell. '
    'Row 2: four sequential radial BULLET IMPACT bursts: bright yellow-white star, expanding orange sharp sparks, '
    'fragmented sparks, tiny fading embers. Centered radial burst. '
    'Row 3: four sequential non-gory INFECTED DEATH puffs: compact olive yellow dust cloud, expanding moss-green '
    'comic smoke burst, broken wisps, tiny dust fragments. '
    'Row 4: four sequential FOOTSTEP DUST puffs: small warm-gray dust, expanding round smoke, broken wisps, fading specks. '
    'Bold clean dark outlines, limited warm amber/olive palette, crisp readable hand-painted shapes, '
    'premium 2D action game art, no glow bleeding into background, no text, not pixel art, no photorealism.'})
for material in materials:
    jsonschema.validate(material, image_schema)
request = {'materials': materials, 'submitter': 'codex-emberline-animation-20260923'}
payload = json.dumps(request, ensure_ascii=False, indent=2).encode()
if (E / 'submission-attempt.json').exists():
    raise SystemExit('Submission intent already exists; inspect its receipt, never blindly resubmit.')
(E / 'request.json').write_bytes(payload)
if '--submit' not in sys.argv:
    print('Validated 4 materials; request saved. Explicit --submit executes this batch once.')
    raise SystemExit(0)
(E / 'submission-attempt.json').write_text(json.dumps({
    'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'sha256': hashlib.sha256(payload).hexdigest(),
    'status': 'submission_unknown_until_receipt', 'image_limit': 4, 'max_retries': 0,
    'budget': 'One batch, four sheets; expected 0.88 CNY using prior unit cost, actual receipt authoritative.'}, indent=2))
req = urllib.request.Request(BASE + '/batch', data=payload, headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(req, timeout=40) as response:
    result = json.load(response)
(E / 'submission-response.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
assert result['code'] == 0 and result['result']['batch_id'] and result['result']['material_count'] == 4
print(json.dumps(result, ensure_ascii=False))
