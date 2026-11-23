const path=require('node:path');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const pw=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const url=process.env.GAME_URL||'http://127.0.0.1:8765/__preview/18df2026092911/?v=talent-ui-20260929';
const out=path.resolve(process.env.QA_OUT||'evidence/runtime-hero-talents-20260929/ui');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await pw.chromium.launch({channel:'chrome',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
 try{for(const [tag,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
   const page=await browser.newPage({viewport,hasTouch:tag==='mobile',isMobile:tag==='mobile'});
   await page.goto(url);await page.waitForFunction(()=>window.emberlineReady===true);
   await page.evaluate(()=>{const cc=System.get(System.resolve('cc'));const h=cc.director.getScene().getChildByName('Game').getComponent('Emberline');h.campView='shop';h.shopTab='talents';h.showPhase();});
   const imported=await page.evaluate(()=>{const cc=System.get(System.resolve('cc'));const h=cc.director.getScene().getChildByName('Game').getComponent('Emberline');return ['available','selected','locked','maxed','detail','detail-locked','branch','action'].map(name=>{const f=h.frames.get('ui/talent/'+name);return {name,width:f.rect.width,height:f.rect.height,url:new URL(f.texture.image.nativeUrl,location.href).href};});});
   for(const asset of imported){const response=await page.request.get(asset.url);assert(response.ok(),asset.name+' loaded');const bytes=await response.body(),source=fs.readFileSync(path.join(__dirname,'../assets/resources/ui/talent',asset.name+'.png'));asset.sha256=createHash('sha256').update(bytes).digest('hex');assert.equal(asset.sha256,createHash('sha256').update(source).digest('hex'),asset.name+' export matches source');}
   if(tag==='desktop'){
     await page.locator('#GameCanvas').focus();
     for(const [key,hero,id] of [['2','scout','deadeye'],['3','medic','triage'],['1','vanguard','arsenal']]){
       await page.keyboard.press(key);
       await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
       const focus=await page.evaluate(()=>{const cc=System.get(System.resolve('cc'));const h=cc.director.getScene().getChildByName('Game').getComponent('Emberline');return {hero:h.talentHero,id:h.talentFocus,detail:h.overlay.children.find(n=>n.name.startsWith('TalentDetail:')).name};});
       assert.deepEqual(focus,{hero,id,detail:'TalentDetail:'+id});
     }
   }
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:path.join(out,`${tag}-talent-tree.png`),fullPage:false});
   const snapshot=await page.evaluate(()=>({text:window.render_game_to_text(),nodes:[...document.querySelectorAll('canvas')].length}));
   fs.writeFileSync(path.join(out,`${tag}-state.json`),JSON.stringify({...snapshot,imported,result:'passed'},null,2));
   await page.close();
 }
 }finally{await browser.close();}
 console.log(out);
})().catch(error=>{console.error(error);process.exit(1)});
