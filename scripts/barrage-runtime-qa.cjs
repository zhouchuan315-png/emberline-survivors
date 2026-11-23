const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
let pw;try{pw=require('playwright')}catch{pw=require(process.env.PLAYWRIGHT_PATH || 'playwright')}
const out=path.resolve(process.env.QA_OUT||'evidence/runtime-barrage-20260928');fs.mkdirSync(out,{recursive:true});
const url=process.env.GAME_URL||'http://127.0.0.1:8765/__preview/18df2026092802/?v=barrage-20260928';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={result:'pending',url,checks:{},scope:'Isolated storage; actual Cocos export, deterministic fixtures and native pause/touch input.'};
(async()=>{
 const browser=await pw.chromium.launch({channel:'chrome',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
 try{for(const mobile of [false,true]){
  const tag=mobile?'mobile':'desktop',ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(url);await page.waitForFunction(()=>window.emberlineReady===true);
  const fixture=source=>page.evaluate(async source=>{const cc=System.get(System.resolve('cc')),h=cc.director.getScene().getChildByName('Game').getComponent('Emberline');return new(Object.getPrototypeOf(async function(){}).constructor)('h','cc',source)(h,cc)},source);
  const shot=async name=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:path.join(out,`${tag}-${name}.png`)});};
  const click=async name=>{const p=await fixture(`const a=h.hud.getChildByName('${name}').worldPosition,b=h.canvas.worldPosition;return {x:a.x-b.x,y:a.y-b.y,W:h.W,H:h.H}`),r=await page.locator('#GameCanvas').boundingBox(),s=Math.min(r.width/p.W,r.height/p.H);const x=r.x+r.width/2+p.x*s,y=r.y+r.height/2-p.y*s;if(mobile)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);};
  const texture=await fixture(`return h.clips.get('projectile-vfx')[0].texture.image.nativeUrl;`),response=await page.request.get(new URL(texture,page.url()).href);
  assert(response.ok());const textureHash=hash(await response.body());assert.equal(textureHash,hash(fs.readFileSync('assets/resources/expansion/projectile-vfx.png')));
  report.checks[tag+'Texture']={texture,sha256:textureHash};
  for(const [map,id] of [['yard','warden'],['foundry','furnace'],['laboratory','hive']]){
   const reset=()=>fixture(`h.enabled=false;h.muted=true;h.reducedMotion=false;await h.returnMenu();await h.profileStore.transact(p=>{p.selectedMap='${map}';});await h.refreshProfile();await h.startGame();h.sim.spawnTimer=999;h.sim.fireTimer=999;h.sim.xpNext=1e9;h.sim.invulnerable=999;h.sim.bannerTime=0;h.sim.x=-100;h.sim.y=-50;h.sim.spawn('boss',{x:70,y:75},{id:'${id}',tier:'final'});h.update(0);`);
   for(const phase of [1,2,3]){
    await reset();
    await fixture(`const e=h.sim.enemies.find(e=>e.boss);e.hp=e.maxHp*${phase===3?.3:phase===2?.6:1};Object.assign(e.boss,{phase:${phase},skill:'volley',castTotal:.95,castRemaining:.95,angle:Math.atan2(h.sim.y-e.y,h.sim.x-e.x),huntCooldown:999,cooldown:999});h.update(.01);h.renderHUD();`);
    if(phase===3)await shot(id+'-warning');
    const waves=await fixture(`const e=h.sim.enemies.find(e=>e.boss),seen=new Set(),samples=[];for(let i=0;i<120;i++){h.update(1/60);const fresh=h.sim.enemyProjectiles.filter(p=>!seen.has(p.id));if(fresh.length)samples.push({time:h.sim.time,count:fresh.length,styles:fresh.map(p=>p.style)});fresh.forEach(p=>seen.add(p.id));}h.renderHUD();return {samples,active:h.projectileView.snapshot(),hud:h.bossSkillLabel.string,boss:{...e.boss},frames:Array.from(h.projectileView.live.values()).map(p=>h.clips.get('projectile-vfx').indexOf(p.sprite.spriteFrame))};`);
    assert(waves.samples.length>=phase+1,JSON.stringify(waves));assert(waves.active.active>0);assert(waves.frames.every(f=>f>=4&&f<16));
    report.checks[`${tag}-${id}-phase${phase}`]=waves;
    await shot(id+'-phase'+phase);
    if(phase===3){
     await fixture('h.projectileView.root.active=false;');await shot(id+'-hidden');await fixture('h.projectileView.root.active=true;');
     await click('PauseButton');await fixture('h.update(0);');
     const frozen=await fixture(`const state=()=>JSON.stringify({sim:h.sim.snapshot(),shots:h.sim.enemyProjectiles,sprites:Array.from(h.projectileView.live.values()).map(s=>({pos:s.node.position,angle:s.node.angle,frame:h.clips.get('projectile-vfx').indexOf(s.sprite.spriteFrame)}))});const a=state();for(let i=0;i<90;i++)h.update(1/60);return h.sim.phase==='paused'&&a===state();`);assert(frozen);
     await fixture(`h.sim.pause();const e=h.sim.enemies.find(e=>e.boss);e.hp=e.maxHp;Object.assign(e.boss,{phase:1,barrage:{skill:'volley',wave:1,total:4,timer:.01,angle:0},recovery:0});h.sim.hurtEnemy(e,e.maxHp*.7,0,0);h.update(.02);`);
     const cleaned=await fixture('return {shots:h.sim.enemyProjectiles.length,sprites:h.projectileView.snapshot().active,barrage:h.sim.enemies.find(e=>e.boss).boss.barrage};');assert.deepEqual(cleaned,{shots:0,sprites:0,barrage:null});
     report.checks[`${tag}-${id}-lifecycle`]={frozen,cleaned};
    }
   }
   await reset();await fixture(`const e=h.sim.enemies.find(e=>e.boss);e.hp=e.maxHp*.3;Object.assign(e.boss,{phase:3,skill:'nova',castTotal:.95,castRemaining:.95,angle:Math.atan2(h.sim.y-e.y,h.sim.x-e.x),cooldown:999});h.update(.01);h.renderHUD();`);await shot(id+'-ring-warning');
   await fixture('for(let i=0;i<108;i++)h.update(1/60);h.renderHUD();');await shot(id+'-rings');
   assert(await fixture('return h.projectileView.snapshot().active>0;'));
  }
  // Normal auto-fire uses the friendly row, including scatter and charged rounds.
  await fixture(`await h.returnMenu();await h.startGame();h.sim.spawnTimer=999;h.sim.invulnerable=999;h.sim.upgrades.multi=3;h.sim.awakeningTier=2;h.sim.empoweredShots=4;h.sim.spawn('brute',{x:250,y:50});for(let i=0;i<15;i++)h.update(1/60);`);
  const friendly=await fixture(`return Array.from(h.projectileView.live.values()).map(s=>h.clips.get('projectile-vfx').indexOf(s.sprite.spriteFrame));`);assert(friendly.some(f=>f>=0&&f<4));await shot('friendly-scatter');report.checks[tag+'Friendly']=friendly;
  await fixture('await h.returnMenu();h.update(0);');assert.deepEqual(await fixture('return h.projectileView.snapshot();'),{active:0,pooled:0});
  assert.deepEqual(errors,[]);report.checks[tag+'Errors']=errors;await ctx.close();
 }report.result='passed';}catch(e){report.result='failed';report.error=e.stack;throw e;}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify({result:report.result,url,checks:Object.keys(report.checks)}));
})().catch(e=>{console.error(e);process.exitCode=1});
