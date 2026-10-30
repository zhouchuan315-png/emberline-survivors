/** Actual Creator export; all seeded balances and scripted combat are isolated QA fixtures. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
let pw;try{pw=require('playwright')}catch{pw=require(process.env.PLAYWRIGHT_PATH||'/Users/xm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const out=path.resolve('evidence/runtime-expansion-20260924');fs.mkdirSync(out,{recursive:true});
class GamePage{
 constructor(page){this.page=page;this.errors=[];page.on('pageerror',e=>this.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')this.errors.push(m.text())});}
 async open(){await this.page.goto(process.env.GAME_URL||'http://127.0.0.1:8765/__preview/18d824de25ebd7c8/?v=campaign-20260924');await this.page.waitForFunction(()=>window.emberlineReady===true,null,{timeout:60000});await this.page.locator('#GameCanvas').focus();}
 async state(){return this.page.evaluate(()=>JSON.parse(render_game_to_text()));}
 async fixture(source){return this.page.evaluate(async source=>{const cc=System.get(System.resolve('cc'));const h=cc.director.getScene().getChildByName('Game').getComponent('Emberline');const rules=System.get('chunks:///_virtual/Simulation.ts'),progress=System.get('chunks:///_virtual/Progression.ts'),campaign=System.get('chunks:///_virtual/Campaign.ts');const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;return new AsyncFunction('h','rules','cc','progress','campaign',source)(h,rules,cc,progress,campaign);},source);}
 async frames(){await this.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
 async shot(name){await this.frames();await this.page.screenshot({path:path.join(out,name)});}
 async click(name,touch=false){await this.frames();const pos=await this.fixture(`const find=n=>n.name===${JSON.stringify(name)}?n:n.children.map(find).find(Boolean);const node=find(h.overlay)||find(h.hud);if(!node)throw new Error('Missing button '+${JSON.stringify(name)});const a=node.worldPosition,b=h.canvas.worldPosition;return {x:a.x-b.x,y:a.y-b.y,W:h.W,H:h.H};`);const rect=await this.page.locator('#GameCanvas').boundingBox(),scale=Math.min(rect.width/pos.W,rect.height/pos.H);const x=rect.x+rect.width/2+pos.x*scale,y=rect.y+rect.height/2-pos.y*scale;if(touch)await this.page.touchscreen.tap(x,y);else await this.page.mouse.click(x,y);await this.frames();}
 async wait(expression){await this.page.waitForFunction(expression,null,{timeout:45000});}
}
const report={result:'pending',checks:{},fixturePolicy:'Separate browser contexts; no production profile changes or gameplay hooks'};
(async()=>{
 const browser=await pw.chromium.launch({headless:true,channel:'chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:900}});const game=new GamePage(await context.newPage());await game.open();report.url=game.page.url();await game.shot('camp-desktop.png');
  assert.equal((await game.state()).profile.coins,0);await game.click('StartRun');await game.wait(()=>JSON.parse(render_game_to_text()).phase==='playing');
  await game.wait(()=>JSON.parse(render_game_to_text()).campaign.coins>0);await game.page.keyboard.press('p');await game.frames();let state=await game.state();assert.ok(state.kills>0);assert.equal(state.profile.coins,state.campaign.coins);report.checks.unmodifiedGameplayEarnsCoins={kills:state.kills,coins:state.profile.coins,time:state.time};
  await game.page.keyboard.press('r');await game.wait(()=>JSON.parse(render_game_to_text()).phase==='menu');const earned=(await game.state()).profile.coins;
  await game.page.reload();await game.wait(()=>window.emberlineReady===true);assert.equal((await game.state()).profile.coins,earned);report.checks.earningsSurviveReload=true;
  await game.click('OpenShop');await game.click('BuyTalent:arsenal');state=await game.state();assert.equal(state.profile.coins,earned);assert.match(state.shopNotice,/金币不足|未解锁/);report.checks.insufficientBalance=true;
  // Seeded balance fixture exercises the actual shop input path at all tiers.
  await game.fixture(`h.profile=(await h.profileStore.transact(p=>{p.coins=2000;})).profile;h.showPhase();`);
  await game.click('BuyTalent:arsenal');state=await game.state();assert.equal(state.profile.coins,1920);assert.equal(state.profile.heroTalents.vanguard.arsenal,1);await game.shot('talents-desktop.png');
  await game.click('BuyTalent:arsenal');await game.click('BuyTalent:overdrive');assert.equal((await game.state()).profile.heroTalents.vanguard.overdrive,1);
  await game.click('TabItems');await game.click('Buy:cryo');await game.click('Equip:cryo');state=await game.state();assert.equal(state.profile.items.cryo,1);assert.equal(state.profile.equipped,'cryo');await game.shot('items-desktop.png');
  await game.page.reload();await game.wait(()=>window.emberlineReady===true);state=await game.state();assert.equal(state.profile.heroTalents.vanguard.arsenal,2);assert.equal(state.profile.equipped,'cryo');
  await game.click('OpenMaps');await game.click('Map:foundry');await game.shot('maps-desktop.png');assert.equal((await game.state()).profile.selectedMap,'foundry');await game.click('StartRun');await game.wait(()=>JSON.parse(render_game_to_text()).phase==='playing');
  state=await game.state();assert.equal(state.maxHp,100);assert.equal(state.weapon.capacity,18);assert.equal(state.upgrades.frost,1);assert.equal(state.profile.items.cryo,0);assert.equal(state.campaign.waves,16);report.checks.purchasedLoadout=state;
  await game.fixture(`h.sim.spawnTimer=999;h.sim.fireTimer=999;h.sim.invulnerable=999;h.sim.time=5.2;const positions=[[-240,0],[-70,-170],[230,0],[70,190]];['spitter','bomber','charger','summoner'].forEach((kind,i)=>{const e=h.sim.spawn(kind,{x:positions[i][0],y:positions[i][1]});e.warning=1.4;e.chargeX=-1;e.chargeY=0;});`);
  await game.shot('foundry-monsters-desktop.png');await game.wait(()=>{const s=JSON.parse(render_game_to_text());return s.animation.actions.attack>=3&&s.animation.frameChanges>20;});state=await game.state();assert.ok(state.animation.frameChanges>20);assert.ok(state.vfx.events.explosion>=1);assert.ok(state.vfx.events.summon>=1);report.checks.newMonsterActions=state.animation.actions;
  await game.page.keyboard.press('p');await game.frames();const frozen=await game.state();await game.page.waitForTimeout(250);assert.deepEqual(await game.state(),frozen);report.checks.pauseFreezesExpansion=true;
  await game.page.keyboard.press('r');await game.wait(()=>JSON.parse(render_game_to_text()).phase==='menu');await game.click('OpenMaps');await game.click('Map:laboratory');await game.click('StartRun');await game.wait(()=>JSON.parse(render_game_to_text()).campaign.map==='laboratory'&&JSON.parse(render_game_to_text()).phase==='playing');
  state=await game.state();assert.equal(state.upgrades.frost,undefined);assert.equal(state.campaign.waves,20);assert.equal(state.map.obstacles,36);report.checks.itemConsumedOnlyOnce=true;
  await game.fixture(`h.sim.spawnTimer=999;h.sim.invulnerable=999;h.sim.time=h.sim.duration-h.sim.arena.waveSeconds-.01;h.sim.update(.02);`);await game.shot('laboratory-final-wave-desktop.png');
  const victory=await game.fixture(`const s=h.sim;const boss=s.enemies.find(e=>e.finalBoss);s.time=s.duration;s.hurtEnemy(boss,1e9,0,0);s.update(.01);await h.checkpoint();const coins=h.profile.coins;await h.checkpoint(true);return {phase:s.phase,coins,after:h.profile.coins,wins:h.profile.wins,earned:s.coins};`);
  assert.equal(victory.phase,'won');assert.equal(victory.coins,victory.after);assert.equal(victory.wins,1);report.checks.victorySettlement= victory;await game.shot('victory-desktop.png');
  await game.fixture(`await h.returnMenu();await h.startGame();h.sim.spawnTimer=999;h.sim.fireTimer=999;h.sim.invulnerable=999;h.sim.bannerTime=0;h.sim.upgrades.pulse=0;for(const [i,type] of ['frost','pulse','heal','explosion'].entries())h.combatFx.event({type,x:-240+i*160,y:0,angle:0,amount:100},false);`);
  await game.shot('skill-effects-desktop.png');
  await game.fixture(`h.sim.time=480;h.sim.wave=20;h.sim.clearedWaves=19;h.sim.bossSpawned=true;h.sim.invulnerable=999;for(let i=0;i<125;i++){const angle=i*2.39996;const e=h.sim.spawn(['walker','runner','brute','spitter','bomber','charger','summoner'][i%7],{x:Math.cos(angle)*(100+i*4),y:Math.sin(angle)*(90+i*3)});e.abilityCooldown=2;}h.sim.upgrades={multi:3,pierce:2,rate:4,frost:2,pulse:3};h.sim.fireTimer=0;h.sim.xpNext=1e9;`);
  const perf=await game.page.evaluate(()=>new Promise(resolve=>{let last=performance.now();const times=[];const frame=now=>{times.push(now-last);last=now;if(times.length===120)resolve({frames:times.length,meanMs:times.reduce((a,b)=>a+b,0)/times.length,maxMs:Math.max(...times)});else requestAnimationFrame(frame);};requestAnimationFrame(frame);}));
  report.checks.lateHorde={performance:perf,state:await game.state()};assert.equal(report.checks.lateHorde.state.map.playerClear,true);assert.ok(report.checks.lateHorde.state.animation.frameChanges>100);await game.shot('late-horde-desktop.png');
  await game.fixture(`await h.returnMenu();`);
  // Two tabs share origin-wide Web Locks: stale cached profiles cannot double-spend.
  const second=new GamePage(await context.newPage());await second.open();
  await game.fixture(`h.profile=(await h.profileStore.transact(p=>{p.coins=100;p.heroTalents={vanguard:{},scout:{},medic:{}};})).profile;`);
  await Promise.all([game.fixture(`await h.buyHeroTalent('vanguard','arsenal');`),second.fixture(`await h.buyHeroTalent('scout','deadeye');`)]);
  const concurrent=await second.fixture(`return progress.parseProfile(localStorage.getItem(progress.PROFILE_KEY));`);assert.equal(concurrent.coins,20);assert.equal((concurrent.heroTalents.vanguard.arsenal||0)+(concurrent.heroTalents.scout.deadeye||0),1);report.checks.concurrentPurchases=concurrent.coins;
  await Promise.all([game.fixture(`await h.startGame();h.sim.spawnTimer=999;h.sim.fireTimer=999;h.sim.invulnerable=999;h.sim.earnedCoins=25;await h.checkpoint(true);h.sim.pause();`),second.fixture(`await h.startGame();h.sim.spawnTimer=999;h.sim.fireTimer=999;h.sim.invulnerable=999;h.sim.earnedCoins=30;await h.checkpoint(true);h.sim.pause();`)]);
  const concurrentFinal=await second.fixture(`return progress.parseProfile(localStorage.getItem(progress.PROFILE_KEY)).coins;`);assert.equal(concurrentFinal,concurrent.coins+55);report.checks.concurrentRunEarnings=true;
  // Loaded atlas texture hashes are recorded later with the exported build manifest.
  report.checks.loadedAssets=await game.fixture(`return {atlases:Array.from(h.clips.keys()),frames:Array.from(h.clips.values()).reduce((n,a)=>n+a.length,0)};`);
  assert.deepEqual(game.errors,[]);assert.deepEqual(second.errors,[]);report.desktopErrors=game.errors.concat(second.errors);await context.close();

  const mobileContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});const mobile=new GamePage(await mobileContext.newPage());await mobile.open();await mobile.shot('camp-mobile.png');
  await mobile.click('OpenMaps',true);await mobile.click('Map:laboratory',true);await mobile.shot('maps-mobile.png');assert.equal((await mobile.state()).profile.selectedMap,'laboratory');await mobile.click('BackCamp',true);
  await mobile.click('OpenShop',true);await mobile.fixture(`h.profile=(await h.profileStore.transact(p=>{p.coins=600;})).profile;h.showPhase();`);await mobile.click('BuyTalent:arsenal',true);await mobile.shot('talents-mobile.png');assert.equal((await mobile.state()).profile.heroTalents.vanguard.arsenal,1);
  await mobile.click('TabItems',true);await mobile.click('Buy:battery',true);await mobile.click('Equip:battery',true);await mobile.shot('items-mobile.png');await mobile.click('ShopNext',true);await mobile.shot('items-page2-mobile.png');await mobile.click('BackCamp',true);await mobile.click('StartRun',true);await mobile.wait(()=>JSON.parse(render_game_to_text()).phase==='playing');
  state=await mobile.state();assert.equal(state.campaign.map,'laboratory');assert.equal(state.upgrades.pulse,1);assert.equal(state.maxHp,100);assert.equal(state.profile.items.battery,0);report.checks.mobilePurchaseEquipStart=true;
  await mobile.fixture(`h.sim.spawnTimer=999;h.sim.fireTimer=999;h.sim.invulnerable=999;h.sim.ammo=4;h.renderHUD();`);await mobile.click('ReloadButton',true);await mobile.wait(()=>JSON.parse(render_game_to_text()).weapon.reloading);await mobile.shot('combat-mobile.png');
  await mobile.fixture(`h.sim.phase='upgrade';h.sim.level=2;h.sim.choices=['pulse','frost','finisher'].map(id=>rules.UPGRADES.find(u=>u.id===id));`);await mobile.shot('skill-icons-mobile.png');
  report.checks.mobileState=await mobile.state();assert.deepEqual(mobile.errors,[]);report.mobileErrors=mobile.errors;await mobileContext.close();report.result='passed';
 }catch(e){report.result='failed';report.error=String(e);throw e;}
 finally{fs.writeFileSync(path.join(out,'expansion-report.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify({result:report.result,checks:Object.keys(report.checks),url:report.url}));
})().catch(e=>{console.error(e);process.exitCode=1});
