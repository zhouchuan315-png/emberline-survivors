/** Regression for stationary reload poses overriding locomotion in the actual export. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const pw=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const before=process.env.CAPTURE_BEFORE==='1';
const out=path.resolve(process.env.QA_OUT||`evidence/runtime-reload-motion-20260928/${before?'before':'after'}`);fs.mkdirSync(out,{recursive:true});
const url=process.env.GAME_URL||'http://127.0.0.1:8765/__preview/18df2026092803/?v=reload-motion-20260928';
const report={result:'pending',before,url,checks:{},scope:'Isolated browser profiles, actual exported Cocos components, keyboard movement and touchscreen reload/joystick.'};
(async()=>{
 const browser=await pw.chromium.launch({headless:true,channel:'chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
 try{for(const mobile of [false,true]){
  const tag=mobile?'mobile':'desktop',ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForFunction(()=>window.emberlineReady===true);await page.locator('#GameCanvas').focus();
  const fixture=src=>page.evaluate(async src=>{const cc=System.get(System.resolve('cc')),h=cc.director.getScene().getChildByName('Game').getComponent('Emberline');return new(Object.getPrototypeOf(async function(){}).constructor)('h','cc',src)(h,cc)},src);
  const shot=async name=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:path.join(out,tag+'-'+name+'.png')});};
  const state=()=>fixture(`return {x:h.sim.x,y:h.sim.y,clip:h.playerClip,frame:h.player.frame,stepFrame:h.runCycle.frame,moving:h.runCycle.moving,reloading:h.sim.reloading,progress:h.sim.reloadProgress,ammo:h.sim.ammo,capacity:h.sim.magazineSize,bodyY:h.player.body.position.y,phase:h.runCycle.phase};`);
  const moveSamples=async count=>fixture(`const out=[];for(let i=0;i<${count};i++){h.update(1/60);out.push({x:h.sim.x,clip:h.playerClip,frame:h.player.frame,stepFrame:h.runCycle.frame,reloading:h.sim.reloading,progress:h.sim.reloadProgress});}return out;`);
  for(const hero of ['vanguard','scout','medic']){
   await fixture(`h.enabled=false;h.muted=true;h.keys.clear();h.stick.set(0,0);await h.returnMenu();await h.profileStore.transact(p=>{p.selectedHero='${hero}';p.selectedMap='yard';});await h.refreshProfile();await h.startGame();h.sim.spawnTimer=999;h.sim.fireTimer=999;h.sim.ammo=1;h.sim.enemies=[];h.update(0);`);
   if(mobile){
    const p=await fixture(`const a=h.hud.getChildByName('ReloadButton').worldPosition,b=h.canvas.worldPosition;return {x:a.x-b.x,y:a.y-b.y,W:h.W,H:h.H};`),r=await page.locator('#GameCanvas').boundingBox(),s=Math.min(r.width/p.W,r.height/p.H);
    await page.touchscreen.tap(r.x+r.width/2+p.x*s,r.y+r.height/2-p.y*s);
   }else await page.keyboard.press('KeyR');
   await fixture('h.update(1/60);');const standing=await state();assert(standing.reloading&&standing.clip===hero+'-reload',JSON.stringify(standing));
   await page.keyboard.down('KeyD');const walking=await moveSamples(24);await shot(hero+'-moving-reload');
   assert(walking.at(-1).x-walking[0].x>50&&walking.every(s=>s.reloading));
   if(before){assert(walking.every(s=>s.clip===hero+'-reload'));report.checks[tag+'-'+hero]={standing,walking,bug:'Standing reload clip overrides actual movement'};await page.keyboard.up('KeyD');continue;}
   assert(walking.every(s=>s.clip===hero+'-run'&&s.frame===s.stepFrame));assert(new Set(walking.map(s=>s.frame)).size>5);
   await fixture('h.sim.pause();');const frozenBefore=await state();await fixture('for(let i=0;i<30;i++)h.update(1/60);');assert.deepEqual(await state(),frozenBefore);
   await fixture(`h.sim.phase='upgrade';`);await fixture('for(let i=0;i<30;i++)h.update(1/60);');assert.deepEqual(await state(),frozenBefore);
   await fixture(`h.sim.phase='playing';`);await page.keyboard.up('KeyD');await fixture('h.update(1/60);');const stopped=await state();
   assert(stopped.clip===hero+'-reload'&&!stopped.moving&&stopped.progress>standing.progress);assert.equal(stopped.frame,Math.floor(stopped.progress*16));await shot(hero+'-stopped-reload');
   await page.keyboard.down('KeyA');const reverse=await moveSamples(8);assert(reverse.every(s=>s.clip===hero+'-run'&&s.frame===s.stepFrame));
   await page.keyboard.press('Space');await fixture('h.update(1/60);');const dash=await state();assert(dash.clip===hero+'-run'&&dash.frame===4&&dash.reloading);
   await page.keyboard.up('KeyA');await page.keyboard.down('KeyD');const completion=await moveSamples(90);assert(completion.every(s=>s.clip===hero+'-run'));
   const loaded=await state();assert(!loaded.reloading&&loaded.ammo===loaded.capacity);await page.keyboard.up('KeyD');
   // Actual boundary collision stops the feet even while movement input remains held.
   await fixture('h.sim.x=1184;h.sim.y=0;h.runCycle.reset(h.sim.x,h.sim.y);h.sim.ammo=1;h.sim.reload();');await page.keyboard.down('KeyD');await moveSamples(8);
   const blocked=await state();assert(!blocked.moving&&blocked.clip===hero+'-reload');await page.keyboard.up('KeyD');
   await fixture('h.sim.x=0;h.sim.y=0;h.runCycle.reset();h.sim.reloadTimer=0;h.sim.ammo=0;');await page.keyboard.down('KeyD');await moveSamples(5);
   const automatic=await state();assert(automatic.reloading&&automatic.clip===hero+'-run');await page.keyboard.up('KeyD');
   if(mobile){
    const cdp=await ctx.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:85,y:550}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:125,y:550}]});
    await moveSamples(8);const touch=await state();assert(touch.reloading&&touch.moving&&touch.clip===hero+'-run');await shot(hero+'-touch-reload');await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   }
   report.checks[tag+'-'+hero]={standing,walking,stopped,reverse,dash,loaded,blocked,automatic,pauseAndUpgradeFrozen:true};
  }
  assert.deepEqual(errors,[]);report.checks[tag+'Errors']=errors;await ctx.close();
 }report.result=before?'reproduced':'passed';}catch(e){report.result='failed';report.error=e.stack;throw e;}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify({result:report.result,checks:Object.keys(report.checks)}));
})().catch(e=>{console.error(e);process.exitCode=1});
