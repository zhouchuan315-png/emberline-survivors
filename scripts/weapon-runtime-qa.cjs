/** Actual Creator Web export. Fixtures run only in the isolated QA browser. */
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
let pw;try{pw=require('playwright')}catch{pw=require(process.env.PLAYWRIGHT_PATH||'/Users/xm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const out=path.resolve(process.env.QA_OUT||'evidence/runtime-weapon-latest');fs.mkdirSync(out,{recursive:true});
class GamePage {
  constructor(page){this.page=page;this.errors=[];page.on('pageerror',e=>this.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')this.errors.push(m.text())});}
  async open(){await this.page.goto(process.env.GAME_URL||'http://127.0.0.1:8765/?v=magazine-20260924');await this.page.waitForFunction(()=>window.emberlineReady===true,null,{timeout:60000});await this.page.locator('#GameCanvas').focus();}
  async state(){return this.page.evaluate(()=>JSON.parse(render_game_to_text()));}
  async start(){await this.page.keyboard.press('Enter');await this.page.waitForFunction(()=>JSON.parse(render_game_to_text()).phase==='playing');}
  async fixture(source){return this.page.evaluate(source=>{const cc=System.get(System.resolve('cc'));const h=cc.director.getScene().getChildByName('Game').getComponent('Emberline');const rules=System.get('chunks:///_virtual/Simulation.ts');return new (Object.getPrototypeOf(async function(){}).constructor)('h','rules','cc',source)(h,rules,cc)},source);}
  async shot(name){await this.page.screenshot({path:path.join(out,name)});}
  async frames(){await this.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
  async buttonCenter(name){
    const layout=await this.fixture(`const n=h.hud.getChildByName(${JSON.stringify(name)});const p=n.position;return {x:p.x,y:p.y,width:h.W,height:h.H};`);
    const rect=await this.page.locator('#GameCanvas').boundingBox();
    const scale=Math.min(rect.width/layout.width,rect.height/layout.height);
    return {x:rect.x+rect.width/2+layout.x*scale,y:rect.y+rect.height/2-layout.y*scale};
  }
}
const report={result:'pending',checks:{},type:'Cocos 3.8.6 export; isolated rule fixtures, real keyboard and touchscreen inputs'};
(async()=>{
  const browser=await pw.chromium.launch({headless:true,channel:'chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:900}});const game=new GamePage(await context.newPage());
    await game.open();report.url=game.page.url();await game.start();
    assert.equal((await game.state()).weapon.ammo,18);
    await game.fixture(`await h.startGame();h.sim.spawnTimer=999;h.sim.fireTimer=999;h.sim.ammo=5;`);
    await game.page.keyboard.press('r');await game.page.waitForFunction(()=>JSON.parse(render_game_to_text()).weapon.reloading);
    // Advancing by movement proves a reload does not lock the character.
    await game.page.keyboard.down('d');await game.page.waitForFunction(()=>JSON.parse(render_game_to_text()).player.x>24);await game.page.keyboard.up('d');
    await game.page.keyboard.press('Space');await game.frames();const reloading=await game.state();
    assert.equal(reloading.weapon.ammo,5);assert.equal(reloading.weapon.reloading,true);assert.ok(reloading.animation.actions.reload>=1);assert.ok(reloading.vfx.events.dash>=1);
    report.checks.manualReloadAndMovement=reloading.weapon;await game.shot('reload-desktop.png');
    await game.page.keyboard.press('p');const paused=await game.state();assert.equal(paused.phase,'paused');
    await game.page.waitForTimeout(180);assert.deepEqual(await game.state(),paused);report.checks.pauseFreezesReload=true;
    await game.page.keyboard.press('p');await game.page.waitForFunction(()=>!JSON.parse(render_game_to_text()).weapon.reloading);
    const ready=await game.state();assert.equal(ready.weapon.ammo,18);assert.equal(ready.weapon.reloadsCompleted,1);
    report.checks.refill=ready.weapon;await game.shot('ready-desktop.png');
    // Actual compiled rules: last round empties the magazine while a target is present.
    report.checks.autoReload=await game.fixture(`await h.startGame();const s=h.sim;s.spawnTimer=999;s.invulnerable=999;s.ammo=1;s.upgrades.multi=2;const e=s.spawn('brute',{x:200,y:0});e.speed=0;e.hp=e.maxHp=10000;s.update(.01);const empty=s.snapshot().weapon;for(let i=0;i<60;i++)s.update(1/60);const blocked=s.snapshot().weapon;for(let i=0;i<34;i++)s.update(1/60);const resumed=s.snapshot().weapon;return {empty,blocked,resumed};`);
    const automatic=report.checks.autoReload;assert.equal(automatic.empty.ammo,0);assert.equal(automatic.empty.shotsFired,1);assert.equal(automatic.blocked.shotsFired,1);assert.equal(automatic.resumed.reloadsCompleted,1);assert.equal(automatic.resumed.shotsFired,2);
    // Deliberately expose new card sets to inspect text and select with ordinary input.
    await game.fixture(`await h.startGame();h.sim.spawnTimer=999;h.sim.fireTimer=999;h.sim.level=2;h.sim.phase='upgrade';h.sim.choices=['magazine','reload','critical'].map(id=>rules.UPGRADES.find(u=>u.id===id));`);
    await game.frames();await game.shot('upgrades-ammo-desktop.png');await game.page.keyboard.press('1');await game.frames();
    let state=await game.state();assert.equal(state.upgrades.magazine,1);assert.equal(state.weapon.capacity,24);assert.equal(state.weapon.ammo,24);
    report.checks.selectNewCard=state.weapon;
    await game.fixture(`h.sim.ammo=4;h.sim.reload();h.sim.update(.05);h.sim.phase='upgrade';h.sim.choices=['reload','frost','leech'].map(id=>rules.UPGRADES.find(u=>u.id===id));`);
    await game.frames();const upgradeFrozen=await game.state();await game.page.waitForTimeout(180);assert.deepEqual(await game.state(),upgradeFrozen);
    await game.page.keyboard.press('1');await game.frames();state=await game.state();assert.equal(state.upgrades.reload,1);assert.ok(state.weapon.reloadDuration<1.55);assert.equal(state.weapon.ammo,4);
    report.checks.upgradeDuringReload=state.weapon;
    // Ensure every added modifier is also accepted by the compiled Cocos rules.
    report.checks.newUpgrades=await game.fixture(`await h.startGame();const s=h.sim;s.spawnTimer=999;const ids=['magazine','reload','velocity','armor','critical','frost','leech','finisher'];for(const id of ids){s.phase='upgrade';s.choices=[rules.UPGRADES.find(u=>u.id===id)];s.selectUpgrade(0);}const e=s.spawn('brute',{x:80,y:0});e.speed=0;e.hp=e.maxHp=1000;s.random=()=>.01;s.ammo=3;s.update(.001);const b=s.bullets[0];const shot={damage:b.damage,critical:b.critical,slow:b.slow,speed:Math.hypot(b.vx,b.vy)};for(let i=0;i<8;i++)s.update(1/60);return {upgrades:{...s.upgrades},shot,enemyHP:e.hp,slowTime:e.slowTime,weapon:s.snapshot().weapon};`);
    assert.equal(Object.keys(report.checks.newUpgrades.upgrades).length,8);assert.ok(Math.abs(report.checks.newUpgrades.shot.damage-64.8)<.0001);assert.ok(report.checks.newUpgrades.slowTime>0);assert.ok(report.checks.newUpgrades.enemyHP<1000);
    await game.fixture(`h.sim.pause();`);await game.frames();await game.page.keyboard.press('r');await game.page.waitForFunction(()=>JSON.parse(render_game_to_text()).phase==='menu');await game.start();
    state=await game.state();assert.deepEqual(state.upgrades,{});assert.equal(state.weapon.ammo,18);assert.equal(state.weapon.reloading,false);report.checks.restartResetsWeapon=true;
    // Ordinary gameplay with no rule overrides.
    await game.page.keyboard.down('d');await game.page.waitForFunction(()=>JSON.parse(render_game_to_text()).time>1);await game.page.keyboard.up('d');
    await game.page.keyboard.down('w');await game.page.waitForFunction(()=>JSON.parse(render_game_to_text()).time>2);await game.page.keyboard.up('w');
    await game.page.waitForFunction(()=>JSON.parse(render_game_to_text()).weapon.shotsFired>0);report.checks.realPlay=(await game.state()).weapon;await game.shot('combat-desktop.png');
    assert.deepEqual(game.errors,[]);report.desktopErrors=game.errors;await context.close();

    const mobileContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});const mobile=new GamePage(await mobileContext.newPage());await mobile.open();await mobile.start();
    await mobile.fixture(`h.sim.spawnTimer=999;h.sim.fireTimer=999;h.sim.ammo=6;h.renderHUD();`);
    const point=await mobile.buttonCenter('ReloadButton');await mobile.page.touchscreen.tap(point.x,point.y);
    await mobile.page.waitForFunction(()=>JSON.parse(render_game_to_text()).weapon.reloadProgress>.15);report.checks.touchReload=(await mobile.state()).weapon;await mobile.shot('reload-mobile.png');
    await mobile.page.waitForFunction(()=>!JSON.parse(render_game_to_text()).weapon.reloading);assert.equal((await mobile.state()).weapon.ammo,18);
    await mobile.fixture(`h.sim.phase='upgrade';h.sim.level=2;h.sim.choices=['frost','leech','finisher'].map(id=>rules.UPGRADES.find(u=>u.id===id));`);
    await mobile.frames();await mobile.shot('upgrades-effects-mobile.png');
    const box=await mobile.page.locator('#GameCanvas').boundingBox();const scale=Math.min(box.width/800,box.height/1280);await mobile.page.touchscreen.tap(box.x+box.width*.5,box.y+box.height*.5-245*scale);
    await mobile.page.waitForFunction(()=>JSON.parse(render_game_to_text()).phase==='playing');assert.equal((await mobile.state()).upgrades.frost,1);report.checks.touchUpgrade=true;
    assert.deepEqual(mobile.errors,[]);report.mobileErrors=mobile.errors;await mobileContext.close();report.result='passed';
  }catch(e){report.result='failed';report.error=String(e);throw e;}
  finally{fs.writeFileSync(path.join(out,'weapon-report.json'),JSON.stringify(report,null,2));await browser.close();}
  console.log(JSON.stringify({result:report.result,checks:Object.keys(report.checks),url:report.url}));
})().catch(e=>{console.error(e);process.exitCode=1});
