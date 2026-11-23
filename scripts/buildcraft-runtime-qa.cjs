const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const pw=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const out=path.resolve(process.env.QA_OUT||'evidence/runtime-buildcraft-20260928');fs.mkdirSync(out,{recursive:true});
const url=process.env.GAME_URL||'http://127.0.0.1:8765/__preview/18df2026092901/?v=buildcraft-20260929';
const report={result:'pending',url,checks:{},scope:'Actual Cocos export, isolated storage, real pointer/touch and keyboard input, controlled simulation fixtures.'};
(async()=>{
 const browser=await pw.chromium.launch({headless:true,channel:'chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
 try{for(const [tag,viewport] of [['desktop',{width:1440,height:900}],['compact',{width:1068,height:842}],['mobile',{width:390,height:844}]]){
  const mobile=tag==='mobile',ctx=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(url);await page.waitForFunction(()=>window.emberlineReady===true);await page.locator('#GameCanvas').focus();
  const fixture=src=>page.evaluate(async src=>{const cc=System.get(System.resolve('cc')),h=cc.director.getScene().getChildByName('Game').getComponent('Emberline'),rules=System.get('chunks:///_virtual/Simulation.ts');return new(Object.getPrototypeOf(async function(){}).constructor)('h','cc','rules',src)(h,cc,rules)},src);
  const shot=async name=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:path.join(out,tag+'-'+name+'.png')});};
  const reset=async(map='yard',hero='vanguard')=>fixture(`h.enabled=false;h.muted=true;h.reducedMotion=false;h.keys.clear();h.stick.set(0,0);await h.returnMenu();await h.profileStore.transact(p=>{p.selectedHero='${hero}';p.selectedMap='${map}';});await h.startGame();h.sim.spawnTimer=999;h.sim.fireTimer=999;h.sim.invulnerable=999;h.sim.xpNext=1e9;`);
  const click=async name=>{
   const p=await fixture(`const find=n=>n.name===${JSON.stringify(name)}?n:n.children.map(find).find(Boolean);const n=find(h.overlay)||find(h.hud);if(!n)throw Error('Missing ${name}');const a=n.worldPosition,b=h.canvas.worldPosition,t=n.getComponent(cc.UITransform);return {x:a.x-b.x,y:a.y-b.y,w:t.width,h:t.height,W:h.W,H:h.H};`);
   const b=await page.locator('#GameCanvas').boundingBox(),scale=Math.min(b.width/p.W,b.height/p.H),x=b.x+b.width/2+p.x*scale,y=b.y+b.height/2-p.y*scale;
   assert(x>=0&&x<=viewport.width&&y>=0&&y<=viewport.height);if(mobile)assert(p.w*scale>=44&&p.h*scale>=44,`${name} touch size`);
   if(mobile)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);await fixture('h.update(0);');
  };
  await reset();
  await fixture(`h.sim.level=5;h.sim.upgrades={reloadBurst:1,reload:2,shield:1,pulse:2};h.sim.phase='upgrade';h.sim.choices=['reloadBurst','shield','hunter'].map(id=>rules.UPGRADES.find(u=>u.id===id));h.showPhase();`);
  const cards=await fixture(`return h.overlay.children.filter(n=>n.name.startsWith('Upgrade:')).map(n=>{const t=n.getComponent(cc.UITransform),p=n.position;return {x:p.x-t.width/2,y:p.y-t.height/2,w:t.width,h:t.height,labels:n.children.map(c=>c.getComponent(cc.Label)?.string).filter(Boolean)};});`);
  assert.equal(cards.length,3);assert(cards[0].labels.includes('本次激活 · 装填清场'));assert(cards[1].labels.includes('本次激活 · 雷盾反击'));
  const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  assert(!overlap(cards[0],cards[1])&&!overlap(cards[1],cards[2]));await shot('upgrade-choices');
  await click('BuildGuideButton');assert.equal(await fixture('return h.overlay.children.filter(n=>n.name.startsWith("Recipe:")).length;'),5);await shot('guide-locked');
  const frozen=await fixture(`const before=JSON.stringify(h.sim.snapshot());for(let i=0;i<90;i++)h.update(1/60);return before===JSON.stringify(h.sim.snapshot());`);assert(frozen);
  await click('CloseBuildGuide');await click('Upgrade:reloadBurst');assert.equal(await fixture('return h.sim.hasSynergy("breach");'),true);
  await fixture(`h.sim.xp=h.sim.xpNext;h.update(.001);`);
  for(let i=0;i<2;i++){
   const before=await fixture('return {choices:h.sim.choices.map(u=>u.id),level:h.sim.level,xp:h.sim.xp};');
   if(!mobile&&i===1){await page.locator('#GameCanvas').focus();await page.keyboard.press('KeyQ');await fixture('h.update(0);');}else await click('RerollButton');
   const after=await fixture('return {choices:h.sim.choices.map(u=>u.id),level:h.sim.level,xp:h.sim.xp,rerolls:h.sim.rerolls};');
   assert.equal(after.rerolls,1-i);assert.equal(after.level,before.level);assert.equal(after.xp,before.xp);assert(after.choices.every(id=>!before.choices.includes(id)));
  }
  const old=await fixture('return h.sim.choices.map(u=>u.id);');await click('RerollButton');assert.deepEqual(await fixture('return h.sim.choices.map(u=>u.id);'),old);
  await click('Upgrade:'+old[0]);
  await fixture(`h.sim.upgrades={reloadBurst:2,reload:2,mines:2,blast:2,shatter:2,frost:2,ricochet:2,chain:2,shield:2,pulse:2};`);
  await click('PauseButton');await click('BuildGuideButton');assert.equal(await fixture('return h.sim.buildRecipes.filter(r=>r.active).length;'),5);await shot('guide-active');
  await click('CloseBuildGuide');if(!mobile){await page.locator('#GameCanvas').focus();await page.keyboard.press('Tab');assert.equal(await fixture('return h.buildGuide;'),true);await page.keyboard.press('Escape');assert.equal(await fixture('return h.buildGuide;'),false);}
  report.checks[tag+'-ui']={cards,frozen,rerolls:2,synergies:5};
  if(tag!=='compact'){
   for(const [map,hero] of [['yard','vanguard'],['foundry','scout'],['laboratory','medic']]){
    await reset(map,hero);
    const result=await fixture(`
     const s=h.sim,step=t=>{for(let i=0;i<Math.ceil(t*60);i++)h.update(1/60);},target=(x,y,hp=1e5)=>{const e=s.spawn('brute',{x,y});e.speed=0;e.hp=e.maxHp=hp;return e;};
     s.upgrades={reloadBurst:2,reload:2};const e=target(80,0);s.ammo=9;s.reload();step(1.1);const reloadDamage=e.maxHp-e.hp;
     s.enemies=[];s.upgrades={mines:2,blast:2};s.dashCooldown=0;s.dash();step(.1);const laid=s.mines.length;
     s.pause();const before=JSON.stringify(s.snapshot());step(.7);const paused=before===JSON.stringify(s.snapshot());s.pause();
     const m=s.mines[0],enemy=target(m.x,m.y);step(.5);const mineDamage=enemy.maxHp-enemy.hp;
     s.enemies=[];s.mines=[];s.bullets=[];s.upgrades={shatter:2,frost:2,ricochet:2,chain:2};const a=target(s.x+90,s.y,1),b=target(s.x+150,s.y+25),c=target(s.x+220,s.y-25);
     s.bullets.push({id:800,x:a.x,y:a.y,vx:0,vy:0,life:1,damage:2,pierce:0,hit:new Set(),slow:.3,ricochets:2});step(.5);const winter=b.slowFactor<=.45,ricochet=h.combatFx.snapshot().events.ricochet||0;
     s.enemies=[];s.bullets=[];s.upgrades={shield:2,pulse:2};s.shield=s.shieldMax;s.invulnerable=0;s.pulseTimer=999;s.damagePlayer(50);const shield={hp:s.hp,value:s.shield,delay:s.shieldDelay};
     s.upgrades.hunter=2;const boss=s.spawn('boss',{x:s.x+120,y:s.y},{id:'warden',tier:'elite'});boss.boss.arrival=999;boss.hp=boss.maxHp=1e5;
     for(let i=0;i<3;i++){s.bullets.push({id:900+i,x:boss.x,y:boss.y,vx:0,vy:0,life:1,damage:1,pierce:0,hit:new Set(),primary:true});h.update(.001);}
     const hunterDamage=boss.maxHp-boss.hp,events=h.combatFx.snapshot().events;s.invulnerable=999;
     return {reloadDamage,laid,paused,mineDamage,winter,ricochet,shield,hunterDamage,events};`);
    assert(result.reloadDamage>0&&result.mineDamage>0);assert.equal(result.laid,2);assert(result.paused&&result.winter);assert.equal(result.ricochet,2);assert.equal(result.shield.value,0);assert.equal(result.shield.delay,4);assert(result.hunterDamage>3);assert(result.events.shatter&&result.events.markBurst&&result.events.shieldHit);report.checks[tag+'-'+map]=result;
   }
   await reset();await fixture(`h.sim.upgrades={mines:3,shield:2,hunter:2};h.sim.shield=40;h.sim.dash();for(let i=0;i<5;i++)h.update(1/60);const e=h.sim.spawn('brute',{x:170,y:0});e.speed=0;e.markHits=2;e.markTime=2;h.update(.001);h.renderHUD();`);await shot('mines-shield-mark');
   await fixture(`h.sim.upgrades={mines:2,blast:2};const m=h.sim.mines[0];const e=h.sim.spawn('brute',{x:m.x,y:m.y});e.hp=1e5;e.speed=0;for(let i=0;i<25;i++)h.update(1/60);`);await shot('mine-detonation');
  }
  await fixture('await h.returnMenu();h.update(0);');assert.equal(await fixture('return h.combatFx.snapshot().activeBursts;'),0);await fixture('await h.startGame();');
  const clean=await fixture('return h.sim.snapshot().build;');assert.equal(clean.rerolls,2);assert.equal(clean.shield,0);assert.equal(clean.mines.length,0);assert.equal(clean.synergies.length,0);
  assert.deepEqual(errors,[]);report.checks[tag+'-errors']=errors;await ctx.close();
 }
 report.result='passed';
 }catch(e){report.result='failed';report.error=e.stack;throw e;}
 finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify({result:report.result,checks:Object.keys(report.checks)}));
})().catch(e=>{console.error(e);process.exitCode=1});
