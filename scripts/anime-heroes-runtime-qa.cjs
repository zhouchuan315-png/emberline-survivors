/** Isolated, actual Cocos export: source textures, menu touch flows and new poses. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const pw=require('/Users/xm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=path.resolve(process.env.QA_OUT||'evidence/runtime-anime-heroes-20260928');fs.mkdirSync(out,{recursive:true});
const url=process.env.GAME_URL||'http://127.0.0.1:8765/__preview/18de0928ab070071/?v=anime-heroes-20260928';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={result:'pending',url,viewports:[],policy:'Fresh browser profiles; scripted no-damage combat only in QA, real mouse/touch hero selection.'};
(async()=>{
 const browser=await pw.chromium.launch({headless:true,channel:'chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
 try{
  for(const [tag,viewport,mobile] of [['desktop',{width:1440,height:900},false],['mobile',{width:390,height:844},true]]){
   const ctx=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile}),p=await ctx.newPage(),errors=[];
   p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
   await p.goto(url);await p.waitForFunction(()=>window.emberlineReady===true);
   const fixture=s=>p.evaluate(async s=>{const cc=System.get(System.resolve('cc')),h=cc.director.getScene().getChildByName('Game').getComponent('Emberline');return new(Object.getPrototypeOf(async function(){}).constructor)('h','cc',s)(h,cc)},s);
   const shot=async name=>{await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await p.screenshot({path:path.join(out,tag+'-'+name+'.png')})};
   const click=async name=>{
    const a=await fixture(`const find=n=>n.name===${JSON.stringify(name)}?n:n.children.map(find).find(Boolean);const n=find(h.overlay)||find(h.hud);if(!n)throw Error('missing button');const q=n.worldPosition,c=h.canvas.worldPosition;return{x:q.x-c.x,y:q.y-c.y,W:h.W,H:h.H};`);
    const b=await p.locator('#GameCanvas').boundingBox(),s=Math.min(b.width/a.W,b.height/a.H),x=b.x+b.width/2+a.x*s,y=b.y+b.height/2-a.y*s;
    if(mobile)await p.touchscreen.tap(x,y);else await p.mouse.click(x,y);
    await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   };
   const assets=await fixture(`return ['cover-wide','cover-tall','vanguard-portrait','scout-portrait','medic-portrait'].map(name=>({name,url:h.frames.get(name).texture.image.nativeUrl}));`);
   for(const a of assets){const res=await p.request.get(new URL(a.url,p.url()).href);assert(res.ok());a.sha256=hash(await res.body());assert.equal(a.sha256,hash(fs.readFileSync('assets/resources/roster/'+a.name+'.png')));}
   assert(await fixture(`return h.overlay.getChildByName('AnimeCover').getComponent(cc.Sprite).spriteFrame===h.frames.get('${mobile?'cover-tall':'cover-wide'}');`));
   assert(await fixture(`return !h.clips.has('survivor')&&!h.clips.has('survivor-run')&&!h.frames.has('survivor');`));
   await shot('home');await click('OpenHeroes');await shot('selection');
   const heroes=[];
   for(const hero of ['vanguard','scout','medic']){
    await click('Hero:'+hero);await p.waitForFunction(hero=>JSON.parse(render_game_to_text()).profile.selectedHero===hero,hero);
    await click('StartRun');await p.waitForFunction(()=>JSON.parse(render_game_to_text()).phase==='playing');
    await fixture(`h.enabled=false;h.muted=true;h.sim.spawnTimer=999;h.sim.fireTimer=999;h.sim.invulnerable=999;h.sim.enemies=[];h.player.attack=0;h.runCycle.reset(h.sim.x,h.sim.y);h.renderWorld(0);`);
    assert(await fixture(`return h.player.name==='${hero}'&&h.playerClip==='${hero}'&&h.player.frame===8;`));
    await shot(hero+'-idle');
    const muzzle=await fixture(`h.consumeCombatEvents([{type:'fire',x:h.sim.x,y:h.sim.y,angle:0}]);const b=h.combatFx.bursts.find(b=>b.frames===h.clips.get('effects'));const expected=h.heroMuzzle(h.sim.x,h.sim.y,h.sim.facing,true);return {expected,actual:{x:b.node.position.x,y:b.node.position.y}};`);
    assert(Math.hypot(muzzle.expected.x-muzzle.actual.x,muzzle.expected.y-muzzle.actual.y)<.001);
    const shooting=[];for(let i=0;i<4;i++)shooting.push(await fixture(`h.player.attack=.17-${i}*.0425;h.animatePlayer(0);return {frame:h.player.frame,clip:h.playerClip};`));
    assert(shooting.every(f=>f.clip===hero&&f.frame>=8&&f.frame<12));
    await shot(hero+'-fire');
    await fixture(`h.player.attack=0;h.sim.facing=-1;h.runCycle.phase=.25;h.runCycle.moving=true;h.animatePlayer(0);`);await shot(hero+'-left');
    const death=[];
    for(let i=0;i<4;i++){
     death.push(await fixture(`h.player.dying=${i}*.14+.001;h.animatePlayer(0);return {frame:h.player.frame,clip:h.playerClip};`));
     await shot(hero+'-defeat-'+i);
    }
    assert.deepEqual(death.map(f=>f.frame),[12,13,14,15]);assert(death.every(f=>f.clip===hero));
    heroes.push({hero,shooting,death,muzzle});
    await fixture(`await h.returnMenu();h.enabled=true;`);await click('OpenHeroes');
   }
   assert.deepEqual(errors,[]);report.viewports.push({tag,viewport,assets,heroes,errors});await ctx.close();
  }
  report.result='passed';
 }catch(e){report.result='failed';report.error=String(e);throw e}
 finally{fs.writeFileSync(path.join(out,'anime-report.json'),JSON.stringify(report,null,2));await browser.close()}
 console.log(JSON.stringify({result:report.result,viewports:report.viewports.map(v=>v.tag)}));
})().catch(e=>{console.error(e);process.exitCode=1});
