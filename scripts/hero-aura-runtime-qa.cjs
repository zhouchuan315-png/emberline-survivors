/** Real Cocos shader validation. All combat fixtures use disposable saves. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const deps=process.env.PLAYWRIGHT_DEPS || 'node_modules';
let pw,PNG;try{pw=require('playwright')}catch{pw=require(process.env.PLAYWRIGHT_PATH||deps+'/playwright')}
try{({PNG}=require('pngjs'))}catch{({PNG}=require(deps+'/pngjs'))}
const out=path.resolve(process.env.QA_OUT||'evidence/runtime-hero-aura-20260928');fs.mkdirSync(out,{recursive:true});
const url=process.env.GAME_URL||'http://127.0.0.1:8765/__preview/18de0928fa060060/?v=shader-aura-20260928';
const report={result:'pending',url,checks:{},policy:'Actual Web export and rendered pixel comparisons in isolated browser contexts. No production profile changes.'};
const overlapDiff=(off,on)=>{
 const a=PNG.sync.read(off),b=PNG.sync.read(on);let changed=0,centre=0,edge=0,brighter=0;
 for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){
  const i=(y*a.width+x)*4,d=Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2]);
  if(d<5)continue;changed++;
  const r=Math.hypot((x+.5)/a.width*2-1,(y+.5)/a.height*2-1);
  if(r<.23)centre++;if(r>1.04)edge++;
  if(b.data[i]+b.data[i+1]+b.data[i+2]>a.data[i]+a.data[i+1]+a.data[i+2])brighter++;
 }
 return {changed,centre,edge,brighter};
};
(async()=>{
 let browser;
 try{
  for(const tag of ['desktop','mobile','webgl1']){
   browser=await pw.chromium.launch({headless:true,channel:'chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist',...(tag==='webgl1'?['--disable-webgl2']:[])]});
   const mobile=tag==='mobile',ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
   await page.goto(url);await page.waitForFunction(()=>window.emberlineReady===true,null,{timeout:60000});await page.locator('#GameCanvas').focus();
   const fixture=source=>page.evaluate(async source=>{const cc=System.get(System.resolve('cc')),h=cc.director.getScene().getChildByName('Game').getComponent('Emberline');return new (Object.getPrototypeOf(async function(){}).constructor)('h','cc',source)(h,cc);},source);
   const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const shot=async(name,clip)=>{await frames();return page.screenshot({path:path.join(out,tag+'-'+name+'.png'),...(clip?{clip}:{})});};
   const advance=seconds=>fixture(`for(let i=0;i<${Math.round(seconds*60)};i++)h.update(1/60);`);
   await fixture(`h.enabled=false;h.muted=true;await h.startGame();h.sim.spawnTimer=999;h.sim.fireTimer=999;h.sim.xpNext=1e9;h.sim.invulnerable=0;h.sim.bannerTime=0;h.sim.enemies=[];h.renderWorld(0);h.renderHUD();`);
   assert.equal(await fixture('return h.heroAura.root.active;'),false);
   const runtime=await fixture(`return {effect:h.heroAura.snapshot().effect,api:cc.director.root.device.gfxAPI,webgl:cc.gfx.API.WEBGL,webgl2:cc.gfx.API.WEBGL2,oldAtlasLoaded:h.clips.has('frenzy-vfx')};`);
   assert(runtime.effect.includes('hero-aura'));assert(!runtime.oldAtlasLoaded);if(tag==='webgl1')assert.equal(runtime.api,runtime.webgl);
   await fixture(`h.sim.upgrades.frenzy=1;for(let i=0;i<8;i++){const e=h.sim.spawn('walker',{x:450+i*20,y:0});h.sim.hurtEnemy(e,1e6,0,0);}h.update(1/60);`);
   assert.equal(await fixture('return h.combatFx.snapshot().events.frenzy;'),1);await advance(.6);
   const active=await fixture('return h.heroAura.snapshot();');assert(active.active&&active.power>.98);assert.equal(await fixture('return h.sim.awakeningTier;'),0);
   await shot('frenzy');
   const geom=await fixture(`const n=h.heroAura.root,p=n.worldPosition,c=h.canvas.worldPosition;return {x:p.x-c.x,y:p.y-c.y,w:180*h.scale,h:100*h.scale,W:h.W,H:h.H};`);
   const rect=await page.locator('#GameCanvas').boundingBox(),scale=Math.min(rect.width/geom.W,rect.height/geom.H);
   const clip={x:rect.x+rect.width/2+(geom.x-geom.w/2)*scale,y:rect.y+rect.height/2-(geom.y+geom.h/2)*scale,width:geom.w*scale,height:geom.h*scale};
   const on=await shot('aura-on',clip);await fixture('h.heroAura.root.active=false;');const off=await shot('aura-off',clip);await fixture('h.heroAura.root.active=true;');
   const pixels=overlapDiff(off,on);assert(pixels.changed>60,`${tag}: shader must produce visible pixels`);assert.equal(pixels.centre,0,'aura centre stays transparent');assert.equal(pixels.edge,0,'quad corners stay transparent');assert(pixels.brighter/pixels.changed>.98,'additive light must brighten the ground');
   const samples=[],motionClip={...clip,y:clip.y-80*scale,height:clip.height+80*scale};
   for(let i=0;i<(tag==='desktop'?24:3);i++){await advance(.15);samples.push(await fixture('return h.heroAura.snapshot();'));await shot('motion-'+String(i).padStart(2,'0'),motionClip);}
   assert(samples.at(-1).params[0]>samples[0].params[0]);
   assert.notEqual(Buffer.compare(fs.readFileSync(path.join(out,tag+'-motion-00.png')),fs.readFileSync(path.join(out,tag+'-motion-02.png'))),0,'shader animation changes rendered pixels');
   await page.keyboard.press('p');await fixture('h.update(1/60);');
   const paused=await fixture('const v=h.heroAura.material.getProperty("auraParams");return {phase:h.sim.phase,aura:h.heroAura.snapshot(),material:[v.x,v.y,v.z,v.w]};');
   const frozenImage=await shot('paused',clip);await advance(1);
   assert.equal(paused.phase,'paused');assert.deepEqual(await fixture('return h.heroAura.snapshot();'),paused.aura);assert.equal(Buffer.compare(frozenImage,await shot('paused-after',clip)),0);
   assert.deepEqual(await fixture('const v=h.heroAura.material.getProperty("auraParams");return [v.x,v.y,v.z,v.w];'),paused.material);
   await page.keyboard.press('Enter');await advance(.1);await page.keyboard.down('d');await advance(.4);await page.keyboard.up('d');
   const follow=await fixture('return {x:h.sim.x,y:h.sim.y,aura:h.heroAura.snapshot(),parent:h.heroAura.root.parent.name,ground:h.sceneMap.ground.name};');
   assert(follow.x>30);assert.equal(follow.aura.position.x,follow.x);assert.equal(follow.aura.position.y,follow.y+2);assert.equal(follow.parent,follow.ground);
   await fixture('h.sim.phase="upgrade";h.showPhase();');const upgrade=await fixture('return h.heroAura.snapshot();');await advance(.5);assert.deepEqual(await fixture('return h.heroAura.snapshot();'),upgrade);
   await fixture('h.sim.phase="playing";h.showPhase();h.sim.frenzyTime=4;h.reducedMotion=true;');await advance(.2);
   await shot('reduced-motion',clip);await advance(.4);await shot('reduced-motion-after',clip);
   assert.equal(await fixture('return h.heroAura.snapshot().params[0];'),0);assert.equal(await fixture('return h.heroAura.snapshot().params[3];'),0);
   // Let the strength settle before checking the deliberately static light.
   await advance(1);const staticA=await shot('reduced-steady',clip);await advance(.3);assert.equal(Buffer.compare(staticA,await shot('reduced-steady-after',clip)),0);
   await fixture('h.reducedMotion=false;h.sim.frenzyTime=0;');await advance(1);assert.equal(await fixture('return h.heroAura.root.active;'),false);
   for(const hero of tag==='desktop'?['vanguard','scout','medic']:['vanguard']){
    await fixture(`await h.returnMenu();await h.profileStore.transact(p=>{p.selectedHero='${hero}';});await h.startGame();h.sim.spawnTimer=999;h.sim.fireTimer=999;h.sim.bannerTime=0;h.sim.awakeningTier=2;h.heroAura.activate();`);await advance(1);
    assert(await fixture('return h.heroAura.root.active;'));await shot(hero+'-awakened');
   }
   await fixture('h.sim.hp=0;h.sim.phase="dead";h.update(1/60);');assert.equal(await fixture('return h.heroAura.root.active;'),false);
   await fixture('await h.returnMenu();h.update(0);');assert.equal(await fixture('return h.heroAura.root.active;'),false);
   await fixture('await h.startGame();h.renderWorld(0);');assert.equal(await fixture('return h.heroAura.root.active;'),false);
   const nodes=await fixture(`const find=n=>(n.name==='Hero-Shader-Aura'?1:0)+n.children.reduce((sum,c)=>sum+find(c),0);return find(h.world);`);assert.equal(nodes,1,'restarts must reuse one aura quad');
   // The forced WebGL1 case intentionally rejects WebGL2 before engine fallback.
   const expectedDiagnostics=tag==='webgl1'?['This device does not support WebGL2']:[];
   assert.deepEqual(errors,expectedDiagnostics);report.checks[tag]={runtime,active,pixels,follow,pauseFrozen:true,upgradeFrozen:true,reducedStatic:true,expires:true,cleanup:true,nodes,expectedDiagnostics,errors:[]};
   await browser.close();browser=null;
  }
  report.result='passed';
 }catch(e){report.error=e.stack;throw e;}
 finally{if(browser)await browser.close();fs.writeFileSync(path.join(out,'hero-aura-report.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({result:report.result,checks:Object.keys(report.checks)}));
})().catch(e=>{console.error(e);process.exitCode=1});
