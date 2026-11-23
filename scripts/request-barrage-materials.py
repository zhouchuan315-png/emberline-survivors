"""One recorded submission using the refreshed Apifox and live material schema."""
import os
import datetime
import hashlib
import json
import urllib.request
from pathlib import Path

import jsonschema

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'evidence/materials-20260928-barrage'
BASE = os.environ.get('MATERIAL_API_BASE', 'https://example.invalid/ability-agent/api/v2/material-generation')

def get(route):
    with urllib.request.urlopen(BASE + route, timeout=40) as response:
        return json.load(response)

def save(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2, ensure_ascii=False))

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    if (OUT / 'intent.json').exists():
        raise SystemExit('Existing submission intent: reconcile the recorded batch; never repost.')
    menu = get('/schema/menu')
    save('menu.json', menu)
    spec = get('/schema/materials/doubao_llm_generated_image')
    save('schema.json', spec)
    assert spec['code'] == 0
    s = spec['result']
    prompt = (
        'Production sprite sheet for a hand-painted anime zombie survival bullet-hell game. '
        'Exactly 4 columns by 4 rows, sixteen isolated sprites on perfectly flat pure magenta #ff00ff. '
        'NO text, no numbers, no labels, no grid lines, no characters, no weapons, no muzzle flashes. '
        'Each row is FOUR subtly changing looping flight animation frames of the SAME projectile. '
        'All projectiles point RIGHT, compact circular bright core at the EXACT CENTER of each cell, '
        'short tapered tail extends left; same scale and center in all four frames. '
        'Keep every projectile inside the middle 60 percent of its cell with large empty margins. '
        'Row 1: friendly cyan-white plasma bullet, sharp white core and short cyan feather tail. '
        'Row 2: enemy red-orange jagged molten steel shard with bright ivory center, dark red outline. '
        'Row 3: enemy orange yellow fire orb with flickering red ember tail, clear round bright core. '
        'Row 4: enemy lime green acid spore, luminous yellow nucleus, irregular green droplet tail. '
        'Crisp game-readable silhouettes, painted ink outlines, restrained glow, no large halos. '
        'Four different projectile species with four consistent animation frames each. Square atlas.'
    )
    material = {'id':'emberline-barrage-20260928-flight', 'type':s['type'], 'prompt':prompt,
                'model':'doubao-seedream-5-0-260128','size':'2048x2048','watermark':False,'max_retries':0}
    schema = {**s['json_schema'], 'properties':{**s['json_schema']['properties'], **s['common_fields']}}
    jsonschema.validate(material, schema)
    payload = {'materials':[material], 'submitter':'codex-emberline-barrage-20260928'}
    raw = json.dumps(payload, ensure_ascii=False).encode()
    save('request.json', payload)
    save('intent.json', {'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'requestSha256':hashlib.sha256(raw).hexdigest(),'automaticRetries':0,'count':1,
        'status':'submission_unknown_until_receipt','scope':'One projectile flight atlas; local alpha cleanup only'})
    req = urllib.request.Request(BASE + '/batch', data=raw, headers={'Content-Type':'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=55) as response:
        receipt = json.load(response)
    save('receipt.json', receipt)
    assert receipt['code'] == 0 and receipt['result']['batch_id'] and receipt['result']['material_count'] == 1
    print(json.dumps(receipt, ensure_ascii=False))

if __name__ == '__main__':
    main()
