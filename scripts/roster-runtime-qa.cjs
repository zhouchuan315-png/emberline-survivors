/** Actual exported Cocos runtime QA for the new roster and multi-phase bosses. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
let pw;try{pw=require('playwright')}catch{pw=require(process.env.PLAYWRIGHT_PATH || 'playwright')}
const out=path.resolve(process.env.QA_OUT||'evidence/runtime-roster-20260924');fs.mkdirSync(out,{recursive:true});
class GamePage{
 constructor(page){this.page=page;this.errors=[];page.on('pageerror',e=>this.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')this.errors.push(m.text())})}
 async open(){await this.page.goto(process.env.GAME_URL||'http://127.0.0.1:8765/?v=walkfix-20260924-final');await this.page.waitForFunction(()=>window.emberlineReady===true,null,{timeout:60000});await this.page.locator('#GameCanvas').focus()}
 async state(){return this.page.evaluate(()=>JSON.parse(render_game_to_text()))}
 async fixture(source){return this.page.evaluate(async source=>{const cc=System.get(System.resolve('cc'));const h=cc.director.getScene().getChildByName('Game').getComponent('Emberline');const rules=System.get('chunks:///_virtual/Simulation.ts');const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;return new AsyncFunction('h','rules','cc',source)(h,rules,cc)},source)}
 async shot(name){await this.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await this.page.screenshot({path:path.join(out,name)})}
 async wait(expression){await this.page.waitForFunction(expression,null,{timeout:45000})}
}
const report={result:'pending',checks:{},fixturePolicy:'Separate browser context; fixed-step boss sampling avoids wall-clock races and resets skill sequence on an open central lane; no player profile access.'};
(async()=>{
 const browser=await pw.chromium.launch({headless:true,channel:'chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
 try{
  const ctx=await browser.newContext({viewport:{width:1440,height:900}});const game=new GamePage(await ctx.newPage());await game.open();report.url=game.page.url();
  const assets=await game.fixture(`return {heroes:['vanguard','scout','medic'].map(n=>({name:n,frames:h.clips.get(n).length,run:h.clips.get(n+'-run').length})),bosses:['warden','furnace','hive'].map(n=>({name:n,frames:h.clips.get(n).length})),fx:h.clips.get('boss-fx').length}`);
  assert.deepEqual(assets.heroes.map(a=>a.frames),[16,16,16]);assert.deepEqual(assets.heroes.map(a=>a.run),[16,16,16]);assert.deepEqual(assets.bosses.map(a=>a.frames),[16,16,16]);assert.equal(assets.fx,16);report.checks.atlasFrames=assets;
  await game.fixture(`h.campView='heroes';h.showPhase();`);await game.shot('hero-selection.png');
  const heroSelection=await game.fixture(`const names=h.overlay.children.map(n=>n.name).filter(n=>n.startsWith('Hero:'));await h.selectHero('scout');return {cards:names,selected:h.profile.selectedHero};`);
  assert.deepEqual(heroSelection.cards.sort(),['Hero:medic','Hero:scout','Hero:vanguard']);assert.equal(heroSelection.selected,'scout');report.checks.heroSelection=heroSelection;
  for(const [map,bossId] of [['yard','warden'],['foundry','furnace'],['laboratory','hive']]){
   await game.fixture(`h.enabled=true;await h.returnMenu();await h.profileStore.transact(p=>{p.selectedMap=${JSON.stringify(map)};p.selectedHero='${map==='laboratory'?'medic':map==='foundry'?'scout':'vanguard'}';});await h.refreshProfile();await h.startGame();h.sim.spawnTimer=999;h.sim.fireTimer=999;h.sim.invulnerable=999;h.sim.time=h.sim.duration-h.sim.arena.waveSeconds-.02;h.sim.update(.03);`);
   await game.wait(()=>JSON.parse(render_game_to_text()).phase==='playing');
   await game.page.keyboard.down('KeyD');await game.page.waitForTimeout(360);const moving=await game.state();await game.page.keyboard.up('KeyD');
   assert.equal(moving.animation.playerClip,`${moving.hero}-run`);assert.ok(moving.animation.playerFrame>=0&&moving.animation.playerFrame<16,`${map} dedicated movement atlas frame out of range`);
   report.checks[`${map}MovementFrames`]={hero:moving.hero,clip:moving.animation.playerClip,frame:moving.animation.playerFrame};
   const spawned=await game.fixture(`const b=h.sim.enemies.find(e=>e.finalBoss);return {id:b&&b.boss.id,hp:b&&b.hp,phase:b&&b.boss.phase};`);assert.equal(spawned.id,bossId);assert.equal(spawned.phase,1);
   const movementFrames=await game.fixture(`h.enabled=false;const b=h.sim.enemies.find(e=>e.boss);b.x=120;b.y=0;b.boss.arrival=0;h.sim.bossWarning=null;b.boss.cooldown=999;h.sim.x=-300;h.sim.y=0;const out=[];for(let i=0;i<18;i++){h.update(.035);const a=h.actors.get(b.id);if(a)out.push({frame:a.frame,attack:a.attack>0});}return out;`);
   assert.ok(movementFrames.some(s=>s.frame>=0&&s.frame<8&& !s.attack),`${map} boss movement did not stay in 0-7`);assert.ok(movementFrames.every(s=>s.frame<8||s.attack),`${map} boss movement used attack frame without attack state`);
   report.checks[`${map}BossMovementFrames`]=movementFrames;
   await game.shot(`${map}-boss-phase1.png`);
   const phases=[];
   for(const phase of [2,3]){
    const reached=await game.fixture(`const b=h.sim.enemies.find(e=>e.boss);h.sim.hurtEnemy(b,b.maxHp*.36,0,0);h.update(.01);return {phase:b.boss.phase,zones:h.sim.bosses.zones.length,transition:b.boss.transition};`);
    assert.equal(reached.phase,phase);phases.push(reached);await game.shot(`${map}-boss-phase${phase}.png`);
   }
   const skill=await game.fixture(`const b=h.sim.enemies.find(e=>e.boss);b.boss.transition=0;b.boss.cooldown=0;b.boss.castRemaining=0;b.boss.chargeRemaining=0;b.boss.pursuitRemaining=0;b.boss.pursuitSpeed=0;b.boss.recovery=0;b.boss.huntCooldown=0;b.x=120;b.y=0;b.pushX=0;b.pushY=0;h.sim.x=0;h.sim.y=0;b.boss.sequence=0;h.update(.02);return {skill:b.boss.skill,cast:b.boss.castRemaining,zones:h.sim.bosses.zones.length,projectiles:h.sim.enemyProjectiles.length,hud:JSON.parse(render_game_to_text()).bosses};`);
   assert.ok(skill.cast>0||skill.zones>0);await game.fixture('for(let i=0;i<90;i++)h.update(1/60);');const casted=await game.state();assert.ok(casted.bosses.length===1);report.checks[`${map}Boss`]={bossId,phases,skill,castedBoss:casted.bosses[0]};
   const attackFrames=await game.fixture(`const b=h.sim.enemies.find(e=>e.boss);b.boss.transition=0;b.boss.cooldown=0;b.boss.castRemaining=0;b.boss.chargeRemaining=0;b.boss.pursuitRemaining=0;b.boss.pursuitSpeed=0;b.boss.recovery=0;b.boss.huntCooldown=0;b.boss.sequence=0;b.x=120;b.y=0;b.pushX=0;b.pushY=0;h.sim.x=0;h.sim.y=0;const out=[];for(let i=0;i<12;i++){h.update(.035);const a=h.actors.get(b.id);if(a)out.push({frame:a.frame,attack:a.attack>0,cast:b.boss.castRemaining});}return out;`);
   assert.ok(attackFrames.some(s=>s.attack&&s.frame>=8&&s.frame<12),`${map} boss cast never used 8-11 attack frames`);report.checks[`${map}BossAttackFrames`]=attackFrames;
   const deathFrames=await game.fixture(`const b=h.sim.enemies.find(e=>e.boss);h.sim.hurtEnemy(b,1e9,0,0);h.update(.02);return h.dying.filter(a=>a.name===b.boss.id).map(a=>({frame:a.frame,dying:a.dying}));`);
   assert.ok(deathFrames.some(s=>s.frame>=12&&s.frame<16),`${map} boss death never used 12-15 frames`);report.checks[`${map}BossDeathFrames`]=deathFrames;
  }
  assert.deepEqual(game.errors,[]);report.checks.noConsoleErrors=true;await ctx.close();report.result='passed';
 }catch(e){report.result='failed';report.error=String(e);throw e}
 finally{fs.writeFileSync(path.join(out,'roster-report.json'),JSON.stringify(report,null,2));await browser.close()}
 console.log(JSON.stringify({result:report.result,checks:Object.keys(report.checks),url:report.url}));
})().catch(e=>{console.error(e);process.exitCode=1});
