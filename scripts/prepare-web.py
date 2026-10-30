"""Make the generated Cocos HTML fill the browser without editor sample chrome."""
from pathlib import Path
import re,json
root=Path(__file__).resolve().parents[1]/'build/web-desktop'
p=root/'index.html';html=p.read_text()
html=re.sub(r'<title>.*?</title>','<title>余烬防线 · Emberline Survivors</title>',html)
html=re.sub(r'\s*<h1 class="header">.*?</h1>','',html)
html=re.sub(r'\s*<p class="footer">.*?</p>','',html,flags=re.S)
html=re.sub(r'<div id="GameDiv"[^>]*>','<div id="GameDiv" cc_exact_fit_screen="true">',html)
html=html.replace('content="portrait"','content="auto"').replace('<link rel="icon" href="favicon.ico"/>','<link rel="icon" href="data:,"/>')
p.write_text(html)
(root/'style.css').write_text('''
html,body { width:100%;height:100%;margin:0;overflow:hidden;background:#101818; }
body,canvas,div { outline:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;touch-action:none; }
#GameDiv { position:absolute;inset:0;width:100%;height:100%;overflow:hidden; }
#Cocos3dGameContainer,#GameCanvas { width:100%;height:100%; }
canvas { display:block; }
''')
p=root/'src/settings.json';settings=json.loads(p.read_text());settings['screen']['exactFitScreen']=True;p.write_text(json.dumps(settings,ensure_ascii=False))
print('Fullscreen game page prepared')

p=root/'application.js';p.write_text(p.read_text().replace('this.showFPS = true','this.showFPS = false'))
