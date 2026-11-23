/** Actual Creator export: isolated collision fixtures plus normal input smoke playtest. */
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
let pw;try{pw=require('playwright')}catch{pw=require(process.env.PLAYWRIGHT_PATH || 'playwright')}
const out=path.resolve(process.env.QA_OUT||'evidence/runtime-scene-latest');fs.mkdirSync(out,{recursive:true});
class GamePage {
 constructor(page){this.page=page;this.errors=[];page.on('pageerror',e=>this.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')this.errors.push(m.text())});}
 async open(){await this.page.goto(process.env.GAME_URL||'http://127.0.0.1:8765/?v=scene-20260924');await this.page.waitForFunction(()=>window.emberlineReady===true,null,{timeout:60000});await this.page.locator('#GameCanvas').focus();}
 async state(){return this.page.evaluate(()=>JSON.parse(render_game_to_text()));}
 async start(){await this.page.keyboard.press('Enter');await this.page.waitForFunction(()=>JSON.parse(render_game_to_text()).phase==='playing');}
 async fixture(source){return this.page.evaluate(source=>{const cc=System.get(System.resolve('cc'));const h=cc.director.getScene().getChildByName('Game').getComponent('Emberline');const map=System.get('chunks:///_virtual/SceneMap.ts');return new (Object.getPrototypeOf(async function(){}).constructor)('h','map',source)(h,map)},source);}
 async shot(name){await this.page.screenshot({path:path.join(out,name)});}
 async keyFor(key,seconds){const start=(await this.state()).time;await this.page.keyboard.down(key);try{await this.page.waitForFunction(t=>JSON.parse(render_game_to_text()).time>=t,start+seconds,{timeout:20000});}finally{await this.page.keyboard.up(key);}}
 async assertClear(){const state=await this.state();assert.equal(state.map.playerClear,true);return state;}
}
(async()=>{
 const browser=await pw.chromium.launch({headless:true,channel:'chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
 const report={result:'pending',type:'Creator 3.8.6 Web; named isolated fixtures and ordinary input smoke',checks:{}};
 try{
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const game=new GamePage(await context.newPage());await game.open();report.url=game.page.url();await game.start();
 report.checks.assembled=await game.fixture(`return {chunks:h.sceneMap.ground.children.filter(n=>n.name.startsWith('zone-')).length,tiles:h.sceneMap.ground.children.filter(n=>n.name.startsWith('zone-')).reduce((sum,n)=>sum+n.children.length,0),props:h.sceneMap.props.length,assets:h.frames.size,obstacles:map.OBSTACLES.length};`);
 assert.equal(report.checks.assembled.tiles,240);assert.equal(report.checks.assembled.props,24);
 await game.shot('scene-start.png');
 // Fixture: the same prop and player share a single depth-sorted layer.
 await game.fixture(`await h.startGame();h.sim.spawnTimer=999;h.sim.fireTimer=999;const o=map.OBSTACLES[0];h.sim.x=o.x+25;h.sim.y=o.y+85;h.sceneMap.debugVisible=false;`);
 await game.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 report.checks.depthBehind=await game.fixture(`return h.player.root.getSiblingIndex()<h.sceneMap.props[0].getSiblingIndex();`);assert.equal(report.checks.depthBehind,true);await game.shot('behind-container.png');
 await game.fixture(`const o=map.OBSTACLES[0];h.sim.y=o.y-85;`);await game.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 report.checks.depthFront=await game.fixture(`return h.player.root.getSiblingIndex()>h.sceneMap.props[0].getSiblingIndex();`);assert.equal(report.checks.depthFront,true);
 // Fixture: hold the real movement input into a barrier, then dash into its footprint.
 await game.fixture(`await h.startGame();h.sim.spawnTimer=999;h.sim.fireTimer=999;const o=map.OBSTACLES[10];h.sim.x=o.x;h.sim.y=o.y-95;`);
 await game.page.keyboard.down('w');await game.page.waitForFunction(()=>JSON.parse(render_game_to_text()).map.blockedMoves>3);await game.page.keyboard.up('w');
 report.checks.playerWall=await game.assertClear();await game.page.keyboard.press('b');await game.shot('collision-overlay.png');
 await game.fixture(`await h.startGame();h.sim.spawnTimer=999;h.sim.fireTimer=999;const o=map.OBSTACLES[10];h.sim.x=o.x;h.sim.y=o.y-72;h.sim.lastMoveX=0;h.sim.lastMoveY=1;`);
 await game.page.keyboard.press('Space');await game.page.waitForFunction(()=>JSON.parse(render_game_to_text()).map.blockedMoves>0);report.checks.dash=await game.assertClear();
 // Actual compiled rule fixture: route a brute around cover, never entering it.
 report.checks.enemyRoute=await game.fixture(`await h.startGame();const s=h.sim,o=map.OBSTACLES[10];s.spawnTimer=999;s.fireTimer=999;s.invulnerable=999;s.x=o.x+o.width*.7+40;s.y=o.y;const e=s.spawn('brute',{x:o.x-o.width*.7-40,y:o.y});let clear=true;for(let i=0;i<900;i++){s.update(1/60);clear=clear&&map.isFree(e,e.radius);if(Math.hypot(e.x-s.x,e.y-s.y)<50)break;}return {clear,distance:Math.hypot(e.x-s.x,e.y-s.y),position:{x:e.x,y:e.y}};`);
 assert.ok(report.checks.enemyRoute.clear);assert.ok(report.checks.enemyRoute.distance<50);
 report.checks.bullet=await game.fixture(`await h.startGame();const s=h.sim,o=map.OBSTACLES[10];s.spawnTimer=999;s.fireTimer=999;s.x=o.x;s.y=o.y-160;const e=s.spawn('brute',{x:o.x,y:o.y+160});e.speed=0;const hp=e.hp;s.bullets.push({id:999,x:s.x,y:s.y,vx:0,vy:10000,life:1,damage:999,pierce:6,hit:new Set()});s.update(.05);return {hpBefore:hp,hpAfter:e.hp,wallHits:s.wallsHit,bullets:s.bullets.length};`);
 assert.equal(report.checks.bullet.hpBefore,report.checks.bullet.hpAfter);assert.equal(report.checks.bullet.wallHits,1);
 await game.fixture(`await h.startGame();h.sim.spawnTimer=999;h.sim.fireTimer=999;h.sceneMap.debugVisible=false;`);
 await game.keyFor('d',3.4);report.checks.scrolling=await game.assertClear();assert.ok(report.checks.scrolling.player.x>650);assert.ok(report.checks.scrolling.camera.x>400);await game.shot('scene-east.png');
 await game.page.keyboard.press('p');const paused=await game.state();await game.page.evaluate(()=>new Promise(r=>setTimeout(r,250)));assert.deepEqual(await game.state(),paused);report.checks.pauseFrozen=true;
 await game.page.keyboard.press('r');await game.page.waitForFunction(()=>JSON.parse(render_game_to_text()).phase==='menu');await game.start();assert.equal((await game.state()).map.obstacles,24);report.checks.restart=true;
 // Overview is explicitly a zoomed-out presentation fixture, not normal play scale.
 await game.fixture(`await h.startGame();h.sim.spawnTimer=999;h.sim.fireTimer=999;h.scale=.50;h.world.setScale(.50,.50,1);h.hud.active=false;h.sceneMap.debugVisible=false;`);
 await game.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await game.shot('map-overview.png');
 await game.fixture(`h.scale=1;h.world.setScale(1,1,1);await h.returnMenu();`);
 // Unmodified gameplay and ordinary keyboard input.
 await game.start();await game.keyFor('d',1.4);await game.keyFor('w',1.1);await game.page.keyboard.press('Space');await game.keyFor('a',1.4);await game.keyFor('s',1.1);
 report.checks.realPlay=await game.assertClear();assert.ok(report.checks.realPlay.enemies>0);await game.shot('scene-combat.png');
 assert.equal(game.errors.length,0);report.desktopErrors=game.errors;await context.close();
 const mobileContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});const mobile=new GamePage(await mobileContext.newPage());await mobile.open();await mobile.start();
 await mobile.fixture(`h.sim.spawnTimer=999;`);const before=await mobile.state();const cdp=await mobileContext.newCDPSession(mobile.page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:80,y:570,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:140,y:570,id:1}]});
 await mobile.page.waitForFunction(x=>JSON.parse(render_game_to_text()).player.x>x+30,before.player.x);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 report.checks.mobile=await mobile.assertClear();assert.ok(report.checks.mobile.player.x>30);await mobile.shot('scene-mobile.png');assert.equal(mobile.errors.length,0);report.mobileErrors=mobile.errors;await mobileContext.close();
 report.result='passed';fs.writeFileSync(path.join(out,'scene-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({result:report.result,checks:Object.keys(report.checks),url:report.url}));
 }catch(e){report.result='failed';report.error=String(e);fs.writeFileSync(path.join(out,'scene-report.json'),JSON.stringify(report,null,2));throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
