/** Fixed-timestep + real keyboard regression against the actual Cocos Web export. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
let pw;try{pw=require('playwright')}catch{pw=require(process.env.PLAYWRIGHT_PATH || 'playwright')}
const out=path.resolve(process.env.QA_OUT||'evidence/runtime-roster-20260928');fs.mkdirSync(out,{recursive:true});
const url=process.env.GAME_URL||'http://127.0.0.1:8765/__preview/18de0928a11c0016/?v=walksmooth-20260928-final';
const report={result:'pending',url,policy:'Isolated browser profile; native keyboard input; fixed timestep on the exported component; enemy suppression only for gait observations.',heroes:{}};
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
(async()=>{
 const browser=await pw.chromium.launch({headless:true,channel:'chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(url);await page.waitForFunction(()=>window.emberlineReady===true);await page.locator('#GameCanvas').focus();
  const fixture=source=>page.evaluate(async source=>{const cc=System.get(System.resolve('cc')),h=cc.director.getScene().getChildByName('Game').getComponent('Emberline');return new (Object.getPrototypeOf(async function(){}).constructor)('h','cc',source)(h,cc)},source);
  const shot=async name=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:path.join(out,name)})};
  for(const hero of ['vanguard','scout','medic']){
   await fixture(`h.enabled=false;h.muted=true;h.reducedMotion=true;await h.returnMenu();await h.profileStore.transact(p=>{p.selectedHero='${hero}';p.selectedMap='yard'});await h.refreshProfile();await h.startGame();h.sim.spawnTimer=999;h.sim.fireTimer=999;h.sim.invulnerable=999;h.sim.bannerTime=0;h.renderWorld(0);`);
   const assets=await fixture(`return ['${hero}','${hero}-run'].map(clip=>({clip,url:h.clips.get(clip)[0].texture.image.nativeUrl,frames:h.clips.get(clip).length}));`);
   for(const a of assets){const res=await page.request.get(new URL(a.url,page.url()).href);assert(res.ok());a.sha256=hash(await res.body());assert.equal(a.sha256,hash(fs.readFileSync(path.join('assets/resources/roster',a.clip+'.png'))),'browser texture differs from source');assert.equal(a.frames,16);}
   await page.keyboard.down('KeyD');
   const samples=await fixture(`const out=[];for(let i=0;i<60;i++){h.update(1/60);out.push({x:h.sim.x,y:h.sim.y,phase:h.runCycle.phase,frame:h.player.frame,clip:h.playerClip,bodyY:h.player.body.position.y,angle:h.player.body.angle});}return out;`);
   await page.keyboard.up('KeyD');
   assert.equal(new Set(samples.map(s=>s.frame)).size,16);
   for(const s of samples){assert.equal(s.clip,hero+'-run');assert.equal(s.frame,Math.floor((s.phase%1)*16));assert.equal(s.bodyY,42.25);assert(s.angle===0);assert(Math.abs(s.x/104-s.phase)<1e-9);}
   const cycles=samples.filter((s,i)=>i&&s.frame<samples[i-1].frame).length;assert(cycles>=1&&cycles<=3);
   await shot(hero+'-moving.png');
   // Capture the full cycle on the actual scene for a visual contact sheet/movie.
   for(let i=0;i<16;i++){
    await fixture(`h.sim.x=0;h.sim.y=0;h.sim.facing=1;h.runCycle.reset();h.runCycle.phase=${i}/16+.01;h.runCycle.moving=true;h.animatePlayer(0);h.player.root.setPosition(0,0);h.world.setPosition(0,0);`);
    await shot(`${hero}-frame-${String(i).padStart(2,'0')}.png`);
   }
   await fixture(`h.runCycle.reset(h.sim.x,h.sim.y);h.update(1/60);`);
   const idle=await fixture(`return {clip:h.playerClip,frame:h.player.frame,moving:h.runCycle.moving,bodyY:h.player.body.position.y};`);assert.equal(idle.clip,hero);assert.equal(idle.frame,8);assert(!idle.moving);await shot(hero+'-idle.png');
   await page.keyboard.down('KeyD');await fixture('h.update(1/60);');await page.keyboard.press('KeyP');
   const paused=await fixture(`const before=render_game_to_text();const frame=h.player.sprite.spriteFrame;for(let i=0;i<20;i++)h.update(1/60);return {frozen:before===render_game_to_text(),spriteFrozen:frame===h.player.sprite.spriteFrame,phase:h.sim.phase};`);
   assert(paused.frozen&&paused.spriteFrozen&&paused.phase==='paused');await page.keyboard.press('KeyP');await page.keyboard.up('KeyD');
   await fixture(`h.sim.x=1184;h.sim.y=0;h.runCycle.reset(1184,0);`);await page.keyboard.down('KeyD');
   const blocked=await fixture(`for(let i=0;i<10;i++)h.update(1/60);return {x:h.sim.x,moving:h.runCycle.moving,phase:h.runCycle.phase,clip:h.playerClip};`);await page.keyboard.up('KeyD');
   assert.equal(blocked.x,1184);assert(!blocked.moving);assert.equal(blocked.phase,0);assert.equal(blocked.clip,hero);
   await fixture(`h.sim.x=0;h.sim.y=0;h.runCycle.reset();h.sim.dashCooldown=0;`);await page.keyboard.down('KeyA');await fixture('h.update(1/60);');
   const left=await fixture(`for(let i=0;i<12;i++)h.update(1/60);return {x:h.sim.x,scale:h.player.body.scale.x,frame:h.player.frame};`);assert(left.x<0&&left.scale===-1);
   await page.keyboard.press('Space');const dash=await fixture(`h.update(1/60);return {dashing:h.runCycle.dashing,frame:h.player.frame};`);assert(dash.dashing&&dash.frame===4);await page.keyboard.up('KeyA');
   // Facing a target while moving away must reverse feet without flipping the gun.
   await fixture(`h.sim.dashTime=0;h.sim.x=0;h.sim.y=0;h.runCycle.reset();h.sim.spawn('brute',{x:-200,y:0});h.sim.fireTimer=999;`);await page.keyboard.down('KeyD');
   const back=await fixture(`for(let i=0;i<18;i++)h.update(1/60);return {phase:h.runCycle.phase,backwards:h.runCycle.backwards,scale:h.player.body.scale.x,frame:h.player.frame};`);await page.keyboard.up('KeyD');assert(back.backwards&&back.phase<0&&back.scale===-1);
   await fixture(`h.sim.enemies.length=0;h.sim.x=0;h.sim.y=0;h.runCycle.reset();h.sim.upgrades.speed=2;`);await page.keyboard.down('KeyD');
   const fast=await fixture(`for(let i=0;i<30;i++)h.update(1/60);return {distance:h.sim.x,phase:h.runCycle.phase};`);await page.keyboard.up('KeyD');assert(Math.abs(fast.distance/104-fast.phase)<1e-9);
   report.heroes[hero]={assets,samples,cycles,idle,paused,blocked,left,dash,back,fast};
  }
  // Real-time movement, with the component restored to its normal scheduler.
  await fixture(`h.sim.upgrades.speed=0;h.sim.x=0;h.sim.y=0;h.runCycle.reset();h.enabled=true;`);await page.keyboard.down('KeyD');await page.waitForTimeout(520);await page.keyboard.up('KeyD');
  const live=await fixture(`return {x:h.sim.x,clip:h.playerClip,phase:h.runCycle.phase};`);assert(live.x>30);report.liveInput=live;
  await shot('live-movement.png');assert.deepEqual(errors,[]);report.errors=errors;report.result='passed';await context.close();
 }catch(error){report.result='failed';report.error=String(error);throw error}
 finally{fs.writeFileSync(path.join(out,'gait-report.json'),JSON.stringify(report,null,2));await browser.close()}
 console.log(JSON.stringify({result:report.result,heroes:Object.keys(report.heroes),url:report.url}));
})().catch(e=>{console.error(e);process.exitCode=1});
