/** Actual Creator export; all seeded balances and scripted combat are isolated QA fixtures. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
let pw;try{pw=require('playwright')}catch{pw=require(process.env.PLAYWRIGHT_PATH||'/Users/xm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const out=path.resolve(process.env.QA_OUT||'evidence/runtime-ui-20260924');fs.mkdirSync(out,{recursive:true});
class GamePage{
 constructor(page){this.page=page;this.errors=[];page.on('pageerror',e=>this.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')this.errors.push(m.text())});}
 async open(){await this.page.goto(process.env.GAME_URL||'http://127.0.0.1:8765/__preview/18d824de25ebd7c8/?v=ui-20260924');await this.page.waitForFunction(()=>window.emberlineReady===true,null,{timeout:60000});await this.page.locator('#GameCanvas').focus();}
 async state(){return this.page.evaluate(()=>JSON.parse(render_game_to_text()));}
 async fixture(source){return this.page.evaluate(async source=>{const cc=System.get(System.resolve('cc'));const h=cc.director.getScene().getChildByName('Game').getComponent('Emberline');const rules=System.get('chunks:///_virtual/Simulation.ts'),progress=System.get('chunks:///_virtual/Progression.ts'),campaign=System.get('chunks:///_virtual/Campaign.ts');const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;return new AsyncFunction('h','rules','cc','progress','campaign',source)(h,rules,cc,progress,campaign);},source);}
 async frames(){await this.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
 async shot(name){await this.frames();await this.page.screenshot({path:path.join(out,name)});}
 async click(name,touch=false){await this.frames();const pos=await this.fixture(`const find=n=>n.name===${JSON.stringify(name)}?n:n.children.map(find).find(Boolean);const node=find(h.overlay)||find(h.hud);if(!node)throw new Error('Missing button '+${JSON.stringify(name)});const a=node.worldPosition,b=h.canvas.worldPosition;return {x:a.x-b.x,y:a.y-b.y,W:h.W,H:h.H};`);const rect=await this.page.locator('#GameCanvas').boundingBox(),scale=Math.min(rect.width/pos.W,rect.height/pos.H);const x=rect.x+rect.width/2+pos.x*scale,y=rect.y+rect.height/2-pos.y*scale;if(touch)await this.page.touchscreen.tap(x,y);else await this.page.mouse.click(x,y);await this.frames();}
 async wait(expression){await this.page.waitForFunction(expression,null,{timeout:45000});}
}
const report={result:'pending',checks:{},fixturePolicy:'Isolated browser contexts only; scripted enemy and low-ammo scenarios never touch player profiles.'};
async function layout(game,mobile){
 const boxes=await game.fixture(`
  const names=['HealthCard','TimerCard','KillCard','PauseButton','AmmoCard','ReloadButton','DashButton','Minimap','BossStrip','WaveBanner'];
  return names.map(name=>h.hud.getChildByName(name)).filter(n=>n&&n.activeInHierarchy).map(n=>{const b=n.getComponent(cc.UITransform).getBoundingBoxToWorld();const p=h.canvas.worldPosition;
   return {name:n.name,x:b.x-p.x,y:b.y-p.y,w:b.width,h:b.height,W:h.hudSize.w,H:h.hudSize.h,clear:h.combatView};});`);
 const rect=await game.page.locator('#GameCanvas').boundingBox(),scale=Math.min(rect.width/boxes[0].W,rect.height/boxes[0].H);
 for(const b of boxes){
  assert.ok(b.x>=-b.W/2&&b.y>=-b.H/2&&b.x+b.w<=b.W/2&&b.y+b.h<=b.H/2,`${b.name} inside viewport`);
  if(mobile&&/Button/.test(b.name))assert.ok(b.w*scale>=44&&b.h*scale>=44,`${b.name} touch size`);
  assert.ok(b.y>=b.clear.top||b.y+b.h<=b.clear.bottom,`${b.name} intrudes into clear battlefield`);
 }
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
  const a=boxes[i],b=boxes[j];assert.ok(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y),`${a.name} overlaps ${b.name}`);
 }
 return {scale,boxes};
}
async function overlayTargets(game,mobile){
 const result=await game.fixture(`
  const all=[];const visit=n=>{if(n.activeInHierarchy){if(n.hasEventListener(cc.Node.EventType.TOUCH_END))all.push(n);n.children.forEach(visit);}};visit(h.overlay);
  const p=h.canvas.worldPosition;return all.map(n=>{const b=n.getComponent(cc.UITransform).getBoundingBoxToWorld();return {name:n.name,x:b.x-p.x,y:b.y-p.y,w:b.width,h:b.height,W:h.W,H:h.H};});`);
 const rect=await game.page.locator('#GameCanvas').boundingBox(),scale=Math.min(rect.width/result[0].W,rect.height/result[0].H);
 for(const b of result){assert.ok(b.x>=-b.W/2&&b.y>=-b.H/2&&b.x+b.w<=b.W/2&&b.y+b.h<=b.H/2,b.name+' within screen');if(mobile)assert.ok(b.w*scale>=44&&b.h*scale>=44,b.name+' touch size');}
 for(let i=0;i<result.length;i++)for(let j=i+1;j<result.length;j++){const a=result[i],b=result[j];assert.ok(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y),`${a.name}/${b.name} overlap`);}
 return result;
}
(async()=>{
 const browser=await pw.chromium.launch({headless:true,channel:'chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
 try{
  for(const [tag,viewport,mobile] of [['desktop',{width:1440,height:900},false],['compact',{width:1068,height:842},false],['mobile',{width:390,height:844},true]]){
   const ctx=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
   const g=new GamePage(await ctx.newPage());await g.open();report.url=g.page.url();
   const imported=await g.fixture(`return ['panel','secondary','primary','card','health','reload','dash','pause'].map(name=>{const f=h.frames.get('ui/'+name);return {name,w:f.rect.width,h:f.rect.height,insets:[f.insetLeft,f.insetRight,f.insetTop,f.insetBottom],url:f.texture.image.nativeUrl};});`);
   assert.equal(imported.length,8);for(const f of imported.slice(0,4))assert.deepEqual(f.insets,[24,24,24,24]);report.checks[tag+'Assets']=imported;
   await overlayTargets(g,mobile);await g.shot(tag+'-camp.png');
   await g.click('OpenShop',mobile);await overlayTargets(g,mobile);await g.shot(tag+'-talents.png');
   await g.click('TabItems',mobile);await overlayTargets(g,mobile);await g.fixture(`h.profile=(await h.profileStore.transact(p=>{p.coins=200;})).profile;h.showPhase();`);
   await g.click('Buy:cryo',mobile);await g.click('Equip:cryo',mobile);assert.equal((await g.state()).profile.equipped,'cryo');await g.shot(tag+'-items.png');
   await g.click('BackCamp',mobile);await g.click('OpenMaps',mobile);await overlayTargets(g,mobile);await g.shot(tag+'-maps.png');await g.click('StartRun',mobile);
   await g.wait(()=>JSON.parse(render_game_to_text()).phase==='playing');
   await g.fixture(`h.sim.spawnTimer=999;h.sim.fireTimer=999;h.sim.invulnerable=999;h.sim.bannerTime=0;h.sim.xpNext=1e9;h.sim.hp=74;h.sim.ammo=7;h.sim.time=76;h.sim.wave=4;h.sim.kills=87;h.sim.earnedCoins=162;
    ['walker','runner','spitter','brute'].forEach((kind,i)=>h.sim.spawn(kind,{x:-240+i*140,y:140-i*90}));h.renderHUD();`);
   report.checks[tag+'HudLayout']=await layout(g,mobile);await g.shot(tag+'-combat.png');
   await g.click('ReloadButton',mobile);await g.wait(()=>JSON.parse(render_game_to_text()).weapon.reloading);await g.click('DashButton',mobile);
   assert.ok(await g.fixture('return h.sim.dashCooldown>0;'));await g.shot(tag+'-reload-dash.png');
   await g.click('PauseButton',mobile);await g.wait(()=>JSON.parse(render_game_to_text()).phase==='paused');await overlayTargets(g,mobile);await g.shot(tag+'-pause.png');
   const frozen=await g.state();await g.page.waitForTimeout(220);assert.deepEqual(await g.state(),frozen);await g.click('Button:继续战斗',mobile);
   await g.wait(()=>!JSON.parse(render_game_to_text()).weapon.reloading);assert.equal((await g.state()).weapon.ammo,(await g.state()).weapon.capacity);
   report.checks[tag+'ReloadDashPause']=true;
   await g.fixture(`h.sim.phase='upgrade';h.sim.level=5;h.sim.choices=['pulse','frost','finisher'].map(id=>rules.UPGRADES.find(u=>u.id===id));h.showPhase();`);
   await overlayTargets(g,mobile);await g.shot(tag+'-upgrades.png');
   await g.page.keyboard.press('1');await g.wait(()=>JSON.parse(render_game_to_text()).phase==='playing');
   await g.fixture(`h.sim.time=280;h.sim.wave=12;h.sim.kills=9999;h.sim.earnedCoins=99999;h.sim.level=99;h.sim.maxHp=500;h.sim.hp=3;h.sim.upgrades.pulse=0;h.sim.xpNext=1e9;h.sim.clearedWaves=11;h.sim.bossSpawned=true;h.sim.enemies=[];Object.defineProperty(h.sim,'magazineSize',{get:()=>999});h.sim.ammo=1;h.sim.spawn('boss',{x:340,y:80});h.sim.banner='第 12 / 12 波 · 感染源出现';h.sim.bannerTime=999;h.renderHUD();`);
   await g.shot(tag+'-boss-low-health.png');
   report.checks[tag+'BossLayout']=await layout(g,mobile);
   // Stress the user's reported case: boss + dense horde + blast, with no
   // simulation ticks between layout measurements and the captured frame.
   await g.fixture(`h.enabled=false;h.sim.bossWarning=null;h.sim.hp=h.sim.maxHp;h.sim.enemies=[];h.sim.x=0;h.sim.y=0;h.sim.spawn('boss',{x:170,y:95});
    for(let i=0;i<36;i++)h.sim.spawn(['walker','brute','spitter','bomber'][i%4],{x:-240+(i%9)*60,y:95+Math.floor(i/9)*40});
    h.renderWorld(0);h.combatFx.event({type:'blast',x:90,y:-70,angle:0,amount:90},false);h.combatFx.update(.18);h.renderHUD();`);
   await g.shot(tag+'-boss-horde.png');report.checks[tag+'HordeLayout']=await layout(g,mobile);
   await g.fixture(`h.sim.bossWarning={name:'铁狱暴君',tier:'final',total:3,remaining:2.5};h.renderWorld(0);h.renderHUD();`);
   report.checks[tag+'WarningLayout']=await g.fixture(`const rect=n=>{const b=n.getComponent(cc.UITransform).getBoundingBoxToWorld(),p=h.canvas.worldPosition;return {x:b.x-p.x,y:b.y-p.y,w:b.width,h:b.height};};return {title:rect(h.warningTitle.node),detail:rect(h.warningDetail.node),top:h.combatView.top,bossHidden:!h.bossPlate.active,bannerHidden:!h.bannerPlate.active};`);
   const warning=report.checks[tag+'WarningLayout'];assert(warning.bossHidden&&warning.bannerHidden);assert(warning.title.y>=warning.top&&warning.detail.y>=warning.top);await g.shot(tag+'-boss-warning.png');
   report.checks[tag+'EdgeVisibility']=[];
   for(const [edge,x,y] of [['top',0,704],['bottom',0,-704],['left',-1184,0],['right',1184,0]]){
    const box=await g.fixture(`h.sim.bossWarning=null;h.sim.x=${x};h.sim.y=${y};h.sim.enemies=[];h.renderWorld(0);h.renderHUD();const b=h.player.body.getComponent(cc.UITransform).getBoundingBoxToWorld(),p=h.canvas.worldPosition;return {edge:'${edge}',x:b.x-p.x,y:b.y-p.y,w:b.width,h:b.height,clear:h.combatView,W:h.hudSize.w};`);
    assert(box.y>=box.clear.bottom&&box.y+box.h<=box.clear.top,`${tag} hero hidden at ${edge}`);assert(box.x>=-box.W/2&&box.x+box.w<=box.W/2,`${tag} hero clipped at ${edge}`);
    report.checks[tag+'EdgeVisibility'].push(box);if(edge==='top')await g.shot(tag+'-map-edge.png');
   }
   await g.fixture(`h.sim.x=0;h.sim.y=0;h.sim.spawnTimer=999;h.sim.fireTimer=999;h.renderWorld(0);h.enabled=true;`);
   if(mobile){
    const movement=await g.fixture(`return {x:h.sim.x,y:h.sim.y};`);
    const rect=await g.page.locator('#GameCanvas').boundingBox(),scale=Math.min(rect.width/800,rect.height/1280);
    const x=rect.x+rect.width/2-210*scale,y=rect.y+rect.height/2+310*scale;
    const cdp=await ctx.newCDPSession(g.page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+50,y}]});await g.page.waitForTimeout(120);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const after=await g.fixture(`return {x:h.sim.x,y:h.sim.y,stick:h.touchId};`);assert.ok(Math.hypot(after.x-movement.x,after.y-movement.y)>0);assert.equal(after.stick,null);report.checks.mobileJoystick=true;
   }
   assert.deepEqual(g.errors,[]);report.checks[tag+'Errors']=g.errors;await ctx.close();
  }
  report.result='passed';
 }catch(e){report.result='failed';report.error=String(e);throw e;}
 finally{fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify({result:report.result,checks:Object.keys(report.checks)}));
})().catch(e=>{console.error(e);process.exitCode=1;});
