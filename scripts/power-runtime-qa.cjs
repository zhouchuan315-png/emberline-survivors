const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
let pw;try{pw=require('playwright')}catch{pw=require(process.env.PLAYWRIGHT_PATH||'/Users/xm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const out=path.resolve(process.env.QA_OUT||'evidence/runtime-power-20260928');fs.mkdirSync(out,{recursive:true});
const url=process.env.GAME_URL||'http://127.0.0.1:8765/__preview/18de0928d0030037/?v=hero-power-20260928';
const report={result:'pending',url,checks:{},policy:'Actual Cocos export in isolated browser contexts; scripted combat fixtures, ordinary upgrade/dash/pause input. Production saves are untouched.'};
(async()=>{
 const browser=await pw.chromium.launch({headless:true,channel:'chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
 try{
  for(const mobile of [false,true]){
   const tag=mobile?'mobile':'desktop',context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
   await page.goto(url);await page.waitForFunction(()=>window.emberlineReady===true);await page.locator('#GameCanvas').focus();
   const fixture=source=>page.evaluate(async source=>{
    const cc=System.get(System.resolve('cc')),h=cc.director.getScene().getChildByName('Game').getComponent('Emberline'),rules=System.get('chunks:///_virtual/Simulation.ts');
    return new (Object.getPrototypeOf(async function(){}).constructor)('h','cc','rules',source)(h,cc,rules);
   },source);
   const shot=async name=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:path.join(out,tag+'-'+name+'.png')})};
   const click=async name=>{
    const p=await fixture(`const find=n=>n.name===${JSON.stringify(name)}?n:n.children.map(find).find(Boolean);const n=find(h.overlay)||find(h.hud),a=n.worldPosition,b=h.canvas.worldPosition;return {x:a.x-b.x,y:a.y-b.y,W:h.W,H:h.H};`);
    const r=await page.locator('#GameCanvas').boundingBox(),scale=Math.min(r.width/p.W,r.height/p.H),x=r.x+r.width/2+p.x*scale,y=r.y+r.height/2-p.y*scale;
    if(mobile)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
    await fixture('h.update(1/60);');
   };
   const reset=hero=>fixture(`h.enabled=false;h.muted=true;h.reducedMotion=false;await h.returnMenu();await h.profileStore.transact(p=>{p.selectedHero='${hero}';p.selectedMap='yard';});await h.startGame();h.sim.spawnTimer=999;h.sim.invulnerable=999;h.sim.xpNext=1e9;h.sim.fireTimer=999;`);
   for(const [hero,level] of [['vanguard',3],['scout',6],['medic',9]]){
    await reset(hero);
    await fixture(`h.sim.level=${level};h.sim.phase='upgrade';h.sim.choices=[rules.UPGRADES.find(u=>u.id==='damage')];h.showPhase();`);
    await click('Upgrade:damage');
    assert.equal(await fixture('return h.sim.awakeningTier;'),level/3);
    await fixture('for(let i=0;i<12;i++)h.update(1/60);');await shot(hero+'-awakening');
    if(hero==='vanguard'){
     const generated=await fixture(`h.sim.upgrades={damage:3,rate:2,multi:3,pierce:1,blast:3,chain:3,frenzy:1};h.sim.shotEvents=1;h.sim.fireTimer=0;
      for(const [x,y] of [[150,0],[190,70],[230,-55],[300,30]]){const e=h.sim.spawn('brute',{x,y});e.speed=0;e.hp=e.maxHp=10000;}
      let generated=h.combatFx.snapshot();for(let i=0;i<100;i++){h.update(1/60);generated=h.combatFx.snapshot();if(generated.activeGeneratedChains>0)break;}return generated;`);
     assert(generated.activeGeneratedChains>0);await fixture('for(let i=0;i<100;i++)h.update(1/60);');
     const state=await fixture('return JSON.parse(render_game_to_text());');assert(state.vfx.events.blast>=1);assert(state.vfx.events.chain>=1);assert(state.vfx.generatedPowers.blast&&state.vfx.generatedPowers.chain);assert.equal(state.heroAura.renderer,'shader');assert(state.heroAura.active);assert.equal(state.power.volleyCount,6);
     assert(state.power.empoweredShots<3);await shot('explosion-and-lightning');report.checks[tag+'-groupFire']=state;
     await fixture(`for(let i=0;i<8;i++){const e=h.sim.spawn('walker',{x:200,y:0});h.sim.hurtEnemy(e,1e6,0,0);}h.update(1/60);`);
     assert(await fixture('return h.sim.frenzyTime>0;'));await shot('frenzy');
     await click('PauseButton');
     const freeze=await fixture(`const before=JSON.stringify({s:h.sim.snapshot(),v:h.combatFx.snapshot()});for(let i=0;i<80;i++)h.update(1/60);return {frozen:before===JSON.stringify({s:h.sim.snapshot(),v:h.combatFx.snapshot()}),phase:h.sim.phase};`);
     assert.equal(freeze.phase,'paused');assert(freeze.frozen);report.checks[tag+'-pause']=freeze;
    }else if(hero==='scout'){
     await fixture('h.sim.ammo=4;h.sim.reload();');await click('DashButton');
     const state=await fixture('for(let i=0;i<5;i++)h.update(1/60);return JSON.parse(render_game_to_text());');
     assert.equal(state.weapon.ammo,4);assert(state.weapon.reloading);assert(state.bullets>=12);assert(state.vfx.events.heroPower>=1);
     await shot('scout-barrage');report.checks[tag+'-scout']=state;
    }else{
     await fixture(`h.sim.hp=45;h.sim.heroTimer=0;for(const [x,y] of [[100,0],[-100,0],[50,120]]){const e=h.sim.spawn('brute',{x,y});e.speed=0;e.hp=e.maxHp=1000;}
      h.sim.enemyProjectiles=[{id:500,x:90,y:0,vx:0,vy:0,life:10,damage:10}];h.update(1/60);for(let i=0;i<8;i++)h.update(1/60);`);
     const state=await fixture('return JSON.parse(render_game_to_text());');assert(state.hp>50);assert.equal(state.enemyProjectiles,0);assert(state.vfx.events.heroPower>=1);await shot('medic-nova');report.checks[tag+'-medic']=state;
    }
   }
   await reset('vanguard');
   await fixture(`h.sim.level=5;h.sim.upgrades={multi:2,pulse:2,blast:2};h.sim.phase='upgrade';h.sim.choices=['multi','pulse','blast'].map(id=>rules.UPGRADES.find(u=>u.id===id));h.showPhase();`);
   const cards=await fixture(`return h.overlay.children.filter(n=>n.name.startsWith('Upgrade:')).map(n=>{const b=n.getComponent(cc.UITransform).getBoundingBoxToWorld();return {x:b.x,y:b.y,w:b.width,h:b.height,labels:n.children.map(c=>c.getComponent(cc.Label)?.string).filter(Boolean)};});`);
   assert.equal(cards.length,3);assert(cards[0].labels.includes('毁灭弹幕'));assert(cards[1].labels.includes('雷霆领域'));assert(cards[2].labels.includes('集束爆破'));
   const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
   assert(!overlap(cards[0],cards[1])&&!overlap(cards[1],cards[2]));
   await shot('evolution-choices');await click('Upgrade:multi');assert.equal(await fixture('return h.sim.volleyCount;'),6);
   report.checks[tag+'-cards']=cards;
   if(!mobile){
    report.checks.groupDamageComparison=await fixture(`const run=extra=>{
     const s=new rules.Simulation(818);s.start();s.spawnTimer=999;s.invulnerable=999;s.xpNext=1e9;s.upgrades={damage:2,rate:2,multi:2,reload:2,...extra};
     for(const [x,y] of [[130,0],[170,60],[170,-60],[240,30],[240,-30],[300,80]]){const e=s.spawn('brute',{x,y});e.speed=0;e.hp=e.maxHp=100000;}
     for(let i=0;i<600;i++)s.update(1/60);
     return {damage:s.enemies.reduce((v,e)=>v+e.maxHp-e.hp,0),shots:s.shotEvents,events:s.drainCombatEvents().reduce((a,e)=>{a[e.type]=(a[e.type]||0)+1;return a;},{})};};return {base:run({}),powered:run({blast:3,chain:3,pulse:3})};`);
    const comparison=report.checks.groupDamageComparison;assert(comparison.powered.damage>comparison.base.damage*1.5);
   }
   await fixture('await h.returnMenu();h.update(1/60);');
   const cleared=await fixture('return h.combatFx.snapshot();');assert.equal(cleared.activeArcs,0);assert.equal(cleared.activeRings,0);assert.equal(cleared.activeBursts,0);
   assert.deepEqual(errors,[]);report.checks[tag+'Errors']=errors;await context.close();
  }
  report.result='passed';
 }catch(e){report.result='failed';report.error=e.stack;throw e;}
 finally{fs.writeFileSync(path.join(out,'power-runtime-report.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify({result:report.result,checks:Object.keys(report.checks),comparison:report.checks.groupDamageComparison}));
})().catch(e=>{console.error(e);process.exitCode=1});
