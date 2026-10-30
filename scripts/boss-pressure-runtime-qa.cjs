/** Exported Cocos regression: isolated profiles and explicit simulation ticks. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
let pw;try{pw=require('playwright')}catch{pw=require(process.env.PLAYWRIGHT_PATH||'/Users/xm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const out=path.resolve(process.env.QA_OUT||'evidence/runtime-boss-pressure-20260928');fs.mkdirSync(out,{recursive:true});
const url=process.env.GAME_URL||'http://127.0.0.1:8765/__preview/18de0928b0550026/?v=boss-pressure-20260928-final';
const report={result:'pending',url,checks:{},policy:'Isolated browser storage. Scheduled waves and fixed gameplay updates on the actual export; ordinary keyboard and touch input. No live profile modifications.'};
(async()=>{
 const browser=await pw.chromium.launch({headless:true,channel:'chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
 try{
  for(const mobile of [false,true]){
   const tag=mobile?'mobile':'desktop',context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
   await page.goto(url);await page.waitForFunction(()=>window.emberlineReady===true);await page.locator('#GameCanvas').focus();
   const fixture=source=>page.evaluate(async source=>{const cc=System.get(System.resolve('cc')),h=cc.director.getScene().getChildByName('Game').getComponent('Emberline');return new (Object.getPrototypeOf(async function(){}).constructor)('h','cc',source)(h,cc)},source);
   const shot=async name=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:path.join(out,tag+'-'+name+'.png')})};
   const click=async name=>{const p=await fixture(`const n=h.hud.getChildByName('${name}'),a=n.worldPosition,b=h.canvas.worldPosition;return {x:a.x-b.x,y:a.y-b.y,W:h.W,H:h.H};`),r=await page.locator('#GameCanvas').boundingBox(),s=Math.min(r.width/p.W,r.height/p.H);const x=r.x+r.width/2+p.x*s,y=r.y+r.height/2-p.y*s;if(mobile)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);};
   for(const map of mobile?['yard']:['yard','foundry','laboratory']){
    await fixture(`h.enabled=false;h.muted=true;h.reducedMotion=false;await h.returnMenu();await h.profileStore.transact(p=>{p.selectedMap='${map}';p.selectedHero='vanguard';});await h.refreshProfile();await h.startGame();h.sim.spawnTimer=999;h.sim.fireTimer=999;h.sim.invulnerable=999;h.sim.xpNext=1e9;h.sim.time=75-.01;h.update(.02);const e=h.sim.enemies.find(e=>e.boss);e.x=210;e.y=50;for(let i=0;i<25;i++)h.update(1/60);h.renderHUD();`);
    const elite=await fixture(`const e=h.sim.enemies.find(e=>e.boss);return {state:JSON.parse(render_game_to_text()),size:h.actors.get(e.id).base,headline:h.bossLabel.string,warning:h.warningTitle.string,blockedInput:h.warningRoot.hasEventListener(cc.Node.EventType.TOUCH_END)};`);
    assert.equal(elite.size,164);assert.equal(elite.state.bosses[0].tier,'elite');assert.equal(elite.state.bossAlert.visible,true);assert(elite.state.bossAlert.opacity>220);assert(elite.headline.includes('精英'));assert(!elite.blockedInput);
    const alertLayout=await fixture(`const rect=n=>{const b=n.getComponent(cc.UITransform).getBoundingBoxToWorld();return {x:b.x,y:b.y,w:b.width,h:b.height}};return {title:rect(h.warningTitle.node),detail:rect(h.warningDetail.node),boss:rect(h.bossPlate),pause:rect(h.hud.getChildByName('PauseButton')),dash:rect(h.hud.getChildByName('DashButton'))};`);
    assert(await fixture('return !h.bossPlate.active&&!h.bannerPlate.active;'),'arrival warning replaces the boss strip');
    for(const a of [alertLayout.title,alertLayout.detail])for(const b of [alertLayout.pause,alertLayout.dash])assert(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y),'warning text overlaps controls');
    await shot(map+'-elite-arrival');await click('PauseButton');await fixture('h.update(1/60);');
    const paused=await fixture(`const before=JSON.stringify({s:h.sim.snapshot(),opacity:h.warningFade.opacity});for(let i=0;i<90;i++)h.update(1/60);return {phase:h.sim.phase,frozen:before===JSON.stringify({s:h.sim.snapshot(),opacity:h.warningFade.opacity})};`);assert(paused.phase==='paused'&&paused.frozen);
    await page.keyboard.press('Enter');await fixture('for(let i=0;i<140;i++)h.update(1/60);');
    assert.equal(await fixture('return h.warningRoot.active;'),false);
    await fixture(`for(const e of h.sim.enemies.slice())h.sim.hurtEnemy(e,1e9,0,0);h.update(.01);h.clearActors();h.sim.time=h.sim.duration-h.sim.arena.waveSeconds-.01;h.update(.02);const b=h.sim.enemies.find(e=>e.finalBoss);b.x=240;b.y=0;for(let i=0;i<25;i++)h.update(1/60);h.renderHUD();`);
    const final=await fixture(`const b=h.sim.enemies.find(e=>e.finalBoss);return {boss:{...b.boss},hp:b.maxHp,size:h.actors.get(b.id).base,warning:h.warningTitle.string,state:JSON.parse(render_game_to_text())};`);
    assert.equal(final.size,230);assert.equal(final.boss.tier,'final');assert(final.hp>4000);assert(final.warning.includes('最终首领'));assert.equal(final.state.bossWarning.total,3);await shot(map+'-final-arrival');
    // The warning does not block the on-screen dash control.
    await click('DashButton');assert(await fixture('return h.sim.dashCooldown>0;'));
    await fixture(`h.sim.dashTime=0;h.sim.dashCooldown=0;for(let i=0;i<185;i++)h.update(1/60);const b=h.sim.enemies.find(e=>e.finalBoss);b.x=360;b.y=0;h.sim.x=0;h.sim.y=0;Object.assign(b.boss,{cooldown:0,arrival:0,castRemaining:0,pursuitRemaining:0,recovery:0,huntCooldown:0,sequence:0});h.update(1/60);h.renderHUD();`);
    const tell=await fixture(`const b=h.sim.enemies.find(e=>e.finalBoss);return {skill:b.boss.skill,cast:b.boss.castRemaining,frame:h.actors.get(b.id).frame,hud:h.bossSkillLabel.string};`);assert.equal(tell.skill,'hunt');assert(tell.cast>=.7);assert(tell.frame>=8&&tell.frame<12);await shot(map+'-hunt-warning');
    const chase=await fixture(`const b=h.sim.enemies.find(e=>e.finalBoss),samples=[];for(let i=0;i<130;i++){h.update(1/60);samples.push({x:b.x,y:b.y,speed:b.boss.pursuitSpeed,pursuit:b.boss.pursuitRemaining,frame:h.actors.get(b.id).frame});if(b.boss.pursuitSpeed>320)break;}h.renderHUD();return {samples,hud:h.bossSkillLabel.string};`);
    assert(chase.samples.some(s=>s.speed>320&&s.x<340));assert(chase.samples.at(-1).frame<8);assert(chase.hud.includes('加速追猎'));await shot(map+'-accelerating');
    const stomp=await fixture(`const b=h.sim.enemies.find(e=>e.finalBoss);for(let i=0;i<160&&b.boss.skill!=='slam';i++)h.update(1/60);h.renderHUD();return {skill:b.boss.skill,cast:b.boss.castRemaining,zones:h.sim.bosses.zones.filter(z=>z.owner===b.id).map(z=>({...z})),frame:h.actors.get(b.id).frame};`);
    assert.equal(stomp.skill,'slam');assert(stomp.cast>.5);assert(stomp.zones.length>0);assert(stomp.zones.every(z=>!z.activated));await shot(map+'-close-stomp');
    const phaseChange=await fixture(`const b=h.sim.enemies.find(e=>e.finalBoss);h.sim.hurtEnemy(b,b.maxHp*.7,0,0);h.update(.01);return {phase:b.boss.phase,pursuit:b.boss.pursuitRemaining,zones:h.sim.bosses.zones.length};`);assert.equal(phaseChange.phase,3);assert.equal(phaseChange.pursuit,0);assert.equal(phaseChange.zones,0);
    const cleanup=await fixture(`await h.returnMenu();h.update(1/60);return {warning:h.warningRoot.active,actors:h.actors.size,phase:h.sim.phase};`);assert(!cleanup.warning&&cleanup.actors===0&&cleanup.phase==='menu');
    report.checks[tag+'-'+map]={elite,alertLayout,paused,final,tell,chase,stomp,phaseChange,cleanup};
   }
   assert.deepEqual(errors,[]);report.checks[tag+'Errors']=errors;await context.close();
  }
  report.result='passed';
 }catch(e){report.result='failed';report.error=String(e);throw e}
 finally{fs.writeFileSync(path.join(out,'boss-pressure-report.json'),JSON.stringify(report,null,2));await browser.close()}
 console.log(JSON.stringify({result:report.result,checks:Object.keys(report.checks),url}));
})().catch(e=>{console.error(e);process.exitCode=1});
