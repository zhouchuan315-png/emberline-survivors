const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const pw=require(process.env.PLAYWRIGHT_PATH||'/Users/xm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=path.resolve(process.env.QA_OUT||'evidence/runtime-mines-20260929');fs.mkdirSync(out,{recursive:true});
const url=process.env.GAME_URL||'http://127.0.0.1:8765/__preview/18df2026092902/?v=mine-art-20260929';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={result:'pending',url,checks:{},scope:'Actual Cocos export; isolated saves, real dash keyboard/touch, controlled gameplay fixtures. Screenshot pixel validation is separate.'};
(async()=>{
 const browser=await pw.chromium.launch({headless:true,channel:'chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
 try{for(const mobile of [false,true]){
  const tag=mobile?'mobile':'desktop',viewport=mobile?{width:390,height:844}:{width:1440,height:900};
  const ctx=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url);await page.waitForFunction(()=>window.emberlineReady===true);
  const fixture=src=>page.evaluate(async src=>{const cc=System.get(System.resolve('cc')),h=cc.director.getScene().getChildByName('Game').getComponent('Emberline');return new(Object.getPrototypeOf(async function(){}).constructor)('h','cc',src)(h,cc);},src);
  const shot=async name=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:path.join(out,tag+'-'+name+'.png')});};
  const reset=map=>fixture(`h.enabled=false;h.muted=true;h.reducedMotion=false;await h.returnMenu();await h.profileStore.transact(p=>{p.selectedMap='${map}';});await h.startGame();h.sim.spawnTimer=999;h.sim.fireTimer=999;h.sim.xpNext=1e9;h.sim.invulnerable=999;h.sim.bannerTime=0;h.sim.upgrades={mines:3};h.update(0);`);
  const texture=await fixture(`return h.clips.get('mine-vfx')[0].texture.image.nativeUrl;`);
  const response=await page.request.get(new URL(texture,page.url()).href);assert(response.ok());
  const loaded=hash(await response.body());assert.equal(loaded,hash(fs.readFileSync('assets/resources/expansion/mine-vfx.png')));
  report.checks[tag+'Texture']={url:texture,sha256:loaded};
  await reset('yard');
  if(mobile){
   const pos=await fixture(`const n=h.hud.getChildByName('DashButton'),p=n.worldPosition,c=h.canvas.worldPosition;return {x:p.x-c.x,y:p.y-c.y,W:h.W,H:h.H};`);
   const b=await page.locator('#GameCanvas').boundingBox(),scale=Math.min(b.width/pos.W,b.height/pos.H);
   await page.touchscreen.tap(b.x+b.width/2+pos.x*scale,b.y+b.height/2-pos.y*scale);
  }else{await page.locator('#GameCanvas').focus();await page.keyboard.press('Space');}
  await fixture('h.update(.001);');
  assert.equal(await fixture('return h.mineView.snapshot().active;'),3);
  // Move the hero clear of the mines, then observe the authored sequence at fixed positions.
  await fixture('for(let i=0;i<10;i++)h.update(1/60);');await shot('arming');
  const sequence=await fixture(`const s=h.sim,m=s.mines[0],positions=s.mines.map(m=>[m.x,m.y]),seen=new Set();s.dashTime=0;for(let i=0;i<130;i++){h.update(1/60);seen.add(h.mineView.live.get(m.id).frame);}return {frames:Array.from(seen),fixed:JSON.stringify(positions)===JSON.stringify(s.mines.map(m=>[m.x,m.y])),ground:h.mineView.root.parent===h.sceneMap.ground};`);
  assert(sequence.fixed&&sequence.ground);assert(Array.from({length:12},(_,i)=>i+4).every(f=>sequence.frames.includes(f)));
  await shot('armed');await fixture('h.mineView.root.active=false;');await shot('hidden');await fixture('h.mineView.root.active=true;');
  const frozen=await fixture(`const take=()=>JSON.stringify({mines:h.sim.mines,view:h.mineView.snapshot()});h.sim.pause();h.update(0);const a=take();for(let i=0;i<40;i++)h.update(1/60);const pause=a===take();h.sim.phase='upgrade';h.update(0);for(let i=0;i<40;i++)h.update(1/60);const upgrade=a===take();h.sim.phase='playing';h.update(0);return {pause,upgrade};`);
  assert(frozen.pause&&frozen.upgrade);
  const reduced=await fixture(`h.reducedMotion=true;h.update(0);const a=h.mineView.snapshot().frames;for(let i=0;i<20;i++)h.update(1/60);const b=h.mineView.snapshot().frames;h.reducedMotion=false;return a.every(f=>f===4)&&JSON.stringify(a)===JSON.stringify(b);`);assert(reduced);
  const detonation=await fixture(`const s=h.sim,m=s.mines[0],e=s.spawn('brute',{x:m.x,y:m.y});e.speed=0;e.hp=e.maxHp=10000;const before=s.mines.length;h.update(.001);return {before,after:s.mines.length,active:h.mineView.snapshot().active,damage:e.maxHp-e.hp,blasts:h.combatFx.snapshot().events.blast||0};`);
  assert(detonation.after<detonation.before&&detonation.damage>0&&detonation.blasts>0);assert.equal(detonation.active,detonation.after);
  await fixture('for(let i=0;i<7;i++)h.update(1/60);');await shot('detonation');
  const life=await fixture(`h.sim.enemies=[];for(let i=0;i<380;i++)h.update(1/60);return {mines:h.sim.mines.length,view:h.mineView.snapshot()};`);assert.equal(life.mines,0);assert.equal(life.view.active,0);
  const cap=await fixture(`const s=h.sim;for(let i=0;i<5;i++){s.dashTime=0;s.dashCooldown=0;s.dash();h.update(.001);}return {mines:s.mines.length,...h.mineView.snapshot()};`);assert.equal(cap.mines,9);assert.equal(cap.active,9);assert(cap.active+cap.pooled<=9);
  await fixture(`const rules=System.get('chunks:///_virtual/Simulation.ts');h.sim.phase='upgrade';h.sim.choices=['mines','blast','frenzy'].map(id=>rules.UPGRADES.find(u=>u.id===id));h.sim.upgrades.mines=0;h.showPhase();`);
  const icon=await fixture(`const n=h.overlay.getChildByName('Upgrade:mines').children.find(n=>n.name.startsWith('SkillIcon:'));return n.getComponent(cc.Sprite).spriteFrame===h.clips.get('mine-vfx')[8];`);assert(icon);await shot('upgrade-icon');
  for(const map of ['foundry','laboratory']){
   await reset(map);assert.equal(await fixture('return h.mineView.snapshot().active+h.mineView.snapshot().pooled;'),0);
   await fixture('h.sim.dash();for(let i=0;i<40;i++)h.update(1/60);');
   assert.equal(await fixture('return h.mineView.root.parent===h.sceneMap.ground&&h.mineView.snapshot().active===3;'),true);await shot(map);
  }
  await fixture('await h.returnMenu();h.update(0);');assert.deepEqual(await fixture('return h.mineView.snapshot();'),{active:0,pooled:0,frames:[]});
  assert.deepEqual(errors,[]);report.checks[tag]={sequence,frozen,reduced,detonation,life,cap,icon,errors};await ctx.close();
 }report.result='passed';}catch(e){report.result='failed';report.error=e.stack;throw e;}
 finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify({result:report.result,checks:Object.keys(report.checks)}));
})().catch(e=>{console.error(e);process.exitCode=1});
