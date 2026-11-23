"""One-shot UI batch using the frozen current Apifox/runtime schema. Never resend."""
import os
import json, hashlib, datetime, urllib.request
from pathlib import Path
import jsonschema

ROOT = Path(__file__).resolve().parents[1]
E = ROOT / 'evidence/materials-20260924-ui'
BASE = os.environ.get('MATERIAL_API_BASE', 'https://example.invalid/ability-agent/api/v2/material-generation')
STYLE = ('Production game UI asset for a hand-painted graphic-novel zombie survival game. '
         'Charcoal-black, muted army olive, weathered warm steel and restrained mustard amber. '
         'Crisp ink outlines, subtle scratches only near edges, flat orthographic front view. '
         'NOT pixel art, NOT sci-fi neon, NOT ornate, no glow. NO words, letters, numbers, logos or watermark. '
         'Pure flat magenta #ff00ff background outside each asset, no magenta on the assets. ')
prompts = {
    'plates': STYLE + ('Four separate wide horizontal rectangular UI plates, exactly one plate per row, four rows in a square image. '
        'Each plate centered in its own 2048x512 row, about 1800 wide and 340 high, generous clear magenta margins separating all rows. '
        'ALL have straight edges with very small chamfered corners and thin double steel rim, no protrusions, no shadows outside. '
        'Row 1: dark charcoal blank HUD panel with a desaturated olive thin frame. '
        'Row 2: slightly lighter muted olive-grey blank secondary button. '
        'Row 3: mustard amber blank primary button with dark ink edge. '
        'Row 4: deep dark charcoal blank inventory/dialogue card with a subtle worn steel frame. '
        'Keep entire center 80 percent empty, uniform and flat for readable text, no symbols, rivets only at corners. '
        'Designed for nine-slice stretching, identical narrow border thickness, wide uncluttered center.'),
    'symbols': STYLE + ('Exactly 2 by 2 grid of four isolated game action HUD pictograms, no tile backgrounds or frames. '
        'Every icon centered entirely inside its own 1024x1024 cell, generous magenta margin. '
        'Bold warm ivory painted silhouette with dark ink outline, VERY SIMPLE at 24 pixels, no small details. '
        'Top left: one medical plus cross. Top right: one rifle magazine wrapped by a single circular reload arrow. '
        'Bottom left: two bold forward chevrons with three short speed streaks, sprint action symbol. '
        'Bottom right: two upright parallel thick pause bars. '
        'All four symbols equal visual weight, nearly flat ivory face, minimal warm metal edge shading.')
}
if (E / 'submission-attempt.json').exists():
    raise SystemExit('Submission intent exists: query its recorded batch, never resubmit.')
s = json.loads((E / 'doubao-schema.json').read_text())['result']
schema = dict(s['json_schema'])
schema['properties'] = {**schema['properties'], **s['common_fields']}
schema['required'] = [*schema.get('required', []), 'id']
materials = [dict(id='emberline-ui-20260924-' + name, type=s['type'], prompt=prompt,
                  model='doubao-seedream-5-0-260128', size='2048x2048', watermark=False, max_retries=0)
             for name, prompt in prompts.items()]
for material in materials:
    jsonschema.validate(material, schema)
payload = json.dumps(dict(materials=materials, submitter='codex-emberline-ui-20260924'), ensure_ascii=False).encode()
(E / 'request.json').write_bytes(payload)
(E / 'submission-attempt.json').write_text(json.dumps(dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    sha256=hashlib.sha256(payload).hexdigest(), image_limit=2, automatic_retries=0, status='submission_unknown_until_receipt'), indent=2))
with urllib.request.urlopen(urllib.request.Request(BASE + '/batch', data=payload, headers={'Content-Type': 'application/json'}), timeout=55) as r:
    result = json.load(r)
(E / 'submission-response.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
assert result['code'] == 0 and result['result']['batch_id'] and result['result']['material_count'] == 2
print(json.dumps(result, ensure_ascii=False))
