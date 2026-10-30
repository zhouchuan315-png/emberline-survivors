const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const pw=require('/Users/xm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=path.resolve(process.env.QA_OUT||'evidence/runtime-boss-loot-20260928');fs.mkdirSync(out,{recursive:true});
const url=process.env.GAME_URL||'http://127.0.0.1:8765/__preview/18df2026092804/?v=boss-loot-20260928';
const report={result:'pending',url,checks:{},scope:'Actual Cocos Web export, isolated profiles, deterministic boss kills and loot pickup.'};
(async()=>{
 const browser=await pw.chromium.launch({headless:true,channel:'chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
 try{for(const mobile of [false,true]){
  const tag=mobile?'mobile':'desktop',ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForFunction(()=>window.emberlineReady===true);await page.locator('#GameCanvas').focus();
  const fixture=src=>page.evaluate(async src=>{const cc=System.get(System.resolve('cc')),h=cc.director.getScene().getChildByName('Game').getComponent('Emberline');return new(Object.getPrototypeOf(async function(){}).constructor)('h','cc',src)(h,cc)},src);
  const shot=async name=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:path.join(out,tag+'-'+name+'.png')});};
  for(const map of ['yard','foundry','laboratory'])for(const tier of ['elite','final']){
   await fixture(`h.enabled=false;h.muted=true;h.keys.clear();h.stick.set(0,0);await h.returnMenu();await h.profileStore.transact(p=>{p.selectedHero='vanguard';p.selectedMap='${map}';});await h.refreshProfile();await h.startGame();h.sim.spawnTimer=999;h.sim.fireTimer=999;h.sim.xpNext=1e9;h.sim.x=-90;h.sim.y=-60;h.sim.hp=10;h.sim.spawn('boss',{x:80,y:0},{id:'${map==='yard'?'warden':map==='foundry'?'furnace':'hive'}',tier:'${tier}'});h.update(0);const e=h.sim.enemies[0];h.sim.hurtEnemy(e,1e9,0,0);h.update(.05);h.update(.05);h.renderHUD();`);
   const drop=await fixture(`return {items:h.sim.drops.map(d=>({...d})),xp:h.sim.drops.filter(d=>d.kind==='xp').reduce((n,d)=>n+d.value,0),heals:h.sim.drops.filter(d=>d.kind==='heal').length,coins:h.sim.coins,multiplier:h.sim.arena.reward,dying:h.dying.length};`);
   assert.equal(drop.items.length,tier==='elite'?10:22);assert.equal(drop.xp,tier==='elite'?64:180);assert.equal(drop.heals,tier==='elite'?2:4);assert.equal(drop.coins,Math.floor((tier==='elite'?50:200)*drop.multiplier*.68));assert.equal(drop.dying,1);
   await shot(map+'-'+tier+'-drop');
   await page.keyboard.press('KeyP');await fixture('h.update(0);');
   const frozen=await fixture(`const before=JSON.stringify(h.sim.drops);for(let i=0;i<45;i++)h.update(1/60);return h.sim.phase==='paused'&&JSON.stringify(h.sim.drops)===before;`);assert(frozen);await page.keyboard.press('KeyP');
   const collected=await fixture(`let guard=0;while(h.sim.drops.length&&guard++<40){const d=h.sim.drops[0];h.sim.x=d.x;h.sim.y=d.y;for(let i=0;i<8;i++)h.update(.05);}h.renderHUD();return {remaining:h.sim.drops.length,xp:h.sim.xp,hp:h.sim.hp,pickups:h.sim.pickupEvents,coins:h.sim.coins};`);
   assert.equal(collected.remaining,0);assert.equal(collected.xp,tier==='elite'?64:180);assert.equal(collected.pickups,tier==='elite'?10:22);assert.equal(collected.hp,tier==='elite'?54:98);assert.equal(collected.coins,drop.coins);
   report.checks[`${tag}-${map}-${tier}`]={drop,collected,frozen};
  }
  await fixture('await h.returnMenu();h.update(0);');assert.equal(await fixture('return h.sim.drops.length;'),0);assert.deepEqual(errors,[]);report.checks[tag+'Errors']=errors;await ctx.close();
 }report.result='passed';}catch(e){report.result='failed';report.error=e.stack;throw e;}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify({result:report.result,checks:Object.keys(report.checks)}));
})().catch(e=>{console.error(e);process.exitCode=1});
