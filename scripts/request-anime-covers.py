"""Submit two menu covers with this round's three approved model references."""
import json
from pathlib import Path
from importlib.util import spec_from_file_location,module_from_spec
p=Path(__file__).with_name('request-anime-heroes.py');s=spec_from_file_location('request_heroes',p);m=module_from_spec(s);s.loader.exec_module(m)
b=json.loads((m.E/'heroes/batch-latest.json').read_text())['result']
assert b['status']=='completed' and b['completed_count']==3
refs=[{'type':'static_image','url':a['results'][0]} for a in b['materials']]
style='Premium original Japanese anime action game key visual, beautifully illustrated adult female tactical squad, cel-shaded faces and painterly cinematic environment, polished sharp linework, sophisticated lighting. The three supplied images are exact character identity references: auburn ponytail orange-jacket assault heroine JINHUO; silver bob teal-jacket scout YE SUN; ash-blonde bob ivory-jacket medic BAI ZHI. Preserve their faces, hair, signature outfit and weapons, all three are adult women. Draw a NEW group composition, not pasted cutouts. Ruined industrial quarantine city at blue dusk, distant rusted towers, quiet charcoal concrete foreground, soft warm amber sunset and sparse embers. Subtle distant zombie silhouettes only, heroines are the clear focal point. No text, no letters, no logo, no UI, no border, no watermark. No pink or magenta background. '
layouts={
 'cover-wide':('2560x1440','Landscape 16:9 menu cover. Keep the LEFT 42 percent mostly dark low-detail blue-charcoal city and atmospheric mist as empty negative space for menu text. All three heroines grouped entirely in the RIGHT 56 percent, central orange heroine in front, teal scout behind to her left, white medic behind to her right. Heroic three-quarter figures from head to upper thighs, faces around upper third, heads entirely inside safe margin. Weapons angled safely downward across waist. Faces warm-lit, clothing clearly readable. No character or weapon extending into left menu space.'),
 'cover-tall':('1440x2560','Vertical mobile menu cover. Three heroines grouped across middle width in upper half: orange heroine centered in foreground, teal scout left behind, ivory medic right behind, all faces visible. Leave top 15 percent dark quiet skyline for title. Faces between 22 and 34 percent of image height, torsos extend to 52 percent, weapons held downward. The entire BOTTOM 46 percent is empty dark low-detail blue-charcoal city mist fading smoothly to near black for menu controls. No faces or important character details in lower half. Elegant cinematic poster composition.')
}
materials=[dict(id='anime-20260928-'+k,type='doubao_llm_generated_image',prompt=style+prompt,model='doubao-seedream-5-0-260128',size=size,watermark=False,max_retries=0,input_images=refs) for k,(size,prompt) in layouts.items()]
m.submit('covers',materials)
