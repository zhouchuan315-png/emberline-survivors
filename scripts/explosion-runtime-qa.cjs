const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
let pw;try{pw=require('playwright')}catch{pw=require('/Users/xm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const before=process.env.CAPTURE_BEFORE==='1';
const out=path.resolve(process.env.QA_OUT||'evidence/runtime-explosion-fix-20260928/'+(before?'before':'after'));
const url=process.env.GAME_URL||'http://127.0.0.1:8765/__preview/18de0928e0040048/?v=explosion-fix';fs.mkdirSync(out,{recursive:true});
const report={result:'pending',url,before,checks:{}};
(async()=>{
 const browser=await pw.chromium.launch({channel:'chrome',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
 try{for(const mobile of [false,true]){
  const tag=mobile?'mobile':'desktop',ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(url);await page.waitForFunction(()=>window.emberlineReady===true);
  const fixture=src=>page.evaluate(async src=>{const cc=System.get(System.resolve('cc')),h=cc.director.getScene().getChildByName('Game').getComponent('Emberline');return new(Object.getPrototypeOf(async function(){}).constructor)('h','cc',src)(h,cc);},src);
  if(!before){
   const texture=await fixture(`return h.clips.get('blast-vfx')[0].texture.image.nativeUrl;`);
   const response=await page.request.get(new URL(texture,page.url()).href);assert(response.ok());
   const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
   const loaded=hash(await response.body());assert.equal(loaded,hash(fs.readFileSync('assets/resources/expansion/blast-vfx.png')));
   report.checks[tag+'Texture']={url:texture,sha256:loaded};
  }
  const reset=()=>fixture(`h.enabled=false;h.muted=true;h.reducedMotion=true;await h.returnMenu();await h.startGame();h.sim.spawnTimer=999;h.sim.fireTimer=999;h.sim.xpNext=1e9;h.sim.invulnerable=0;h.sim.bannerTime=0;h.update(0);`);
  const shot=async name=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:path.join(out,tag+'-'+name+'.png')});};
  await reset();
  await fixture(`h.combatFx.event({type:'blast',x:0,y:90,amount:100,angle:0},false);`);
  const blast=[];
  for(let frame=0;frame<16;frame++){
   const state=await fixture(`h.combatFx.update(${frame===0?0:0.03});const b=h.combatFx.bursts[0];return {frame:b?b.frames.indexOf(b.sprite.spriteFrame):-1,pos:b?{x:b.node.position.x,y:b.node.position.y}:null};`);
   blast.push(state);if([1,5,8,11,14].includes(frame))await shot('blast-'+frame);
  }
  assert.deepEqual([...new Set(blast.map(s=>s.frame))],Array.from({length:16},(_,i)=>i));
  assert(blast.every(s=>s.pos.x===blast[0].pos.x&&s.pos.y===blast[0].pos.y));report.checks[tag+'Blast']=blast;
  await reset();
  await fixture(`const e=h.sim.spawn('bomber',{x:65,y:0});e.abilityCooldown=0;h.update(.01);`);await shot('bomber-warning');
  await fixture(`for(let i=0;i<68;i++)h.update(1/60);`);
  const detonation=await fixture(`return {hp:h.sim.hp,hits:h.sim.hitEvents,kills:h.sim.kills,coins:h.sim.coins,enemies:h.sim.enemies.length,dying:h.dying.length,vfx:h.combatFx.snapshot(),bursts:h.combatFx.bursts.map(b=>({count:b.count,frame:b.frames.indexOf(b.sprite.spriteFrame)}))};`);
  assert.equal(detonation.hp,72);assert.equal(detonation.hits,1);assert.equal(detonation.kills,0);assert.equal(detonation.coins,0);assert.equal(detonation.enemies,0);
  if(!before){assert.equal(detonation.dying,0);assert.equal(detonation.bursts.length,1);assert(detonation.bursts[0].count>4);}
  report.checks[tag+'Detonation']=detonation;await shot('bomber-detonation');
  await fixture('h.sim.pause();');
  const pause=await fixture(`const take=()=>JSON.stringify({sim:h.sim.snapshot(),bursts:h.combatFx.bursts.map(b=>[b.age,b.frames.indexOf(b.sprite.spriteFrame)]),vfx:h.combatFx.snapshot()});const a=take();for(let i=0;i<40;i++)h.update(1/60);return a===take();`);assert(pause);
  await fixture(`h.sim.phase='upgrade';`);
  const upgrade=await fixture(`const a=h.combatFx.bursts.map(b=>b.age);for(let i=0;i<40;i++)h.update(1/60);return JSON.stringify(a)===JSON.stringify(h.combatFx.bursts.map(b=>b.age));`);assert(upgrade);
  await fixture(`h.sim.phase='playing';for(let i=0;i<12;i++)h.update(1/60);`);await shot('bomber-smoke');
  const expired=await fixture(`for(let i=0;i<100;i++)h.update(1/60);return {hp:h.sim.hp,vfx:h.combatFx.snapshot(),dying:h.dying.length};`);
  assert.equal(expired.hp,72);assert.equal(expired.vfx.activeBursts,0);assert.equal(expired.dying,0);
  await reset();
  const shotDown=await fixture(`const e=h.sim.spawn('bomber',{x:65,y:0});e.abilityCooldown=0;h.update(.01);h.sim.hurtEnemy(e,999,0,0);h.update(1/60);return {kills:h.sim.kills,coins:h.sim.coins,vfx:h.combatFx.snapshot(),dying:h.dying.length};`);
  assert.equal(shotDown.kills,1);assert.equal(shotDown.coins,2);assert.equal(shotDown.vfx.events.explosion||0,0);assert.equal(shotDown.dying,1);
  await fixture(`await h.returnMenu();h.update(0);`);assert.equal(await fixture('return h.combatFx.snapshot().activeBursts;'),0);
  report.checks[tag+'Lifecycle']={pause,upgrade,expired,shotDown,errors};assert.deepEqual(errors,[]);await ctx.close();
 }report.result='passed';}catch(e){report.result='failed';report.error=e.stack;throw e;}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify({result:report.result,before,checks:Object.keys(report.checks)}));
})().catch(e=>{console.error(e);process.exitCode=1});
