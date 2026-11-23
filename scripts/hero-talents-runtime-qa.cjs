const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const pw=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const out=path.resolve(process.env.QA_OUT||'evidence/runtime-hero-talents-20260929');fs.mkdirSync(out,{recursive:true});
const url=process.env.GAME_URL||'http://127.0.0.1:8765/__preview/18df2026092903/?v=hero-talents-20260929';
const report={result:'pending',url,scope:'Real Cocos export; isolated browser profiles, real pointer/touch purchases; controlled wallet and combat fixtures.',checks:{}};
(async()=>{
 const browser=await pw.chromium.launch({channel:'chrome',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
 try{for(const [tag,viewport] of [['desktop',{width:1440,height:900}],['compact',{width:1068,height:842}],['mobile',{width:390,height:844}]]){
  const mobile=tag==='mobile',context=await browser.newContext({viewport,hasTouch:mobile,isMobile:mobile,deviceScaleFactor:1});
  await context.addInitScript(()=>{if(!localStorage.getItem('emberline-profile-v2'))localStorage.setItem('emberline-profile-v1',JSON.stringify({version:1,coins:123,totalEarned:900,talents:{vitality:2,firepower:1},selectedHero:'vanguard',items:{cryo:2},equipped:null}));});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const open=async()=>{await page.goto(url);await page.waitForFunction(()=>window.emberlineReady===true);};
  const fixture=src=>page.evaluate(async src=>{const cc=System.get(System.resolve('cc')),h=cc.director.getScene().getChildByName('Game').getComponent('Emberline'),p=System.get('chunks:///_virtual/Progression.ts');return new(Object.getPrototypeOf(async function(){}).constructor)('h','cc','p',src)(h,cc,p);},src);
  const snapshot=()=>fixture('return h.profile;');
  const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const shot=async name=>{await frames();await page.screenshot({path:path.join(out,tag+'-'+name+'.png')});};
  const boxes=()=>fixture(`const all=[],visit=n=>{if(n.activeInHierarchy){if(n.hasEventListener(cc.Node.EventType.TOUCH_END))all.push(n);n.children.forEach(visit);}};visit(h.overlay);const c=h.canvas.worldPosition;return all.map(n=>{const b=n.getComponent(cc.UITransform).getBoundingBoxToWorld();return {name:n.name,x:b.x-c.x,y:b.y-c.y,cx:n.worldPosition.x-c.x,cy:n.worldPosition.y-c.y,w:b.width,h:b.height,W:h.W,H:h.H};});`);
  const checkLayout=async()=>{
   const list=await boxes(),canvas=await page.locator('#GameCanvas').boundingBox(),scale=Math.min(canvas.width/list[0].W,canvas.height/list[0].H);
   for(const b of list){assert(b.x>=-b.W/2&&b.x+b.w<=b.W/2&&b.y>=-b.H/2&&b.y+b.h<=b.H/2,b.name+' clipped');if(mobile)assert(b.w*scale>=44&&b.h*scale>=44,b.name+' small touch target');}
   for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){const a=list[i],b=list[j];assert(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y),a.name+' overlaps '+b.name);}
   return {count:list.length,minTouch:mobile?Math.min(...list.map(b=>Math.min(b.w,b.h)*scale)):null};
  };
  const click=async name=>{
   const b=(await boxes()).find(b=>b.name===name);assert(b,'Missing '+name);const r=await page.locator('#GameCanvas').boundingBox(),scale=Math.min(r.width/b.W,r.height/b.H),x=r.x+r.width/2+b.cx*scale,y=r.y+r.height/2-b.cy*scale;
   if(mobile)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
   await fixture('await h.profileStore.queue;');await frames();
  };
  const buy=async(hero,id,rank)=>{await click('TalentNode:'+id);await click('BuyTalent:'+id);assert.equal((await snapshot()).heroTalents[hero][id],rank);};
  await open();let profile=await snapshot();assert.equal(profile.version,2);assert.equal(profile.coins,363);assert.equal(profile.legacyRefund,240);assert.equal(profile.totalEarned,900);assert.equal(profile.talents,undefined);
  await click('OpenShop');report.checks[tag+'Layout']=await checkLayout();await shot('locked-tree');
  const visible=await fixture(`return h.overlay.children.filter(n=>n.name.startsWith('TalentNode:')).map(n=>n.name);`);assert.equal(visible.length,6);
  assert.equal(await fixture(`return h.overlay.children.some(n=>n.name==='ShopCard:vitality'||n.name==='Buy:vitality');`),false);
  await click('TalentNode:overdrive');await click('BuyTalent:overdrive');assert.equal((await snapshot()).coins,363);assert.match(await fixture('return h.shopNotice;'),/需重火专精 2 阶/);
  await buy('vanguard','arsenal',1);await buy('vanguard','arsenal',2);assert.equal((await snapshot()).coins,143);
  await click('TalentNode:overdrive');await click('BuyTalent:overdrive');assert.equal((await snapshot()).coins,143);assert.match(await fixture('return h.shopNotice;'),/还差 37/);await shot('insufficient');
  await fixture(`h.profile=(await h.profileStore.transact(p=>{p.coins=8000;})).profile;h.showPhase();`);
  await buy('vanguard','arsenal',3);const beforeCap=(await snapshot()).coins;await click('BuyTalent:arsenal');assert.equal((await snapshot()).coins,beforeCap);
  await buy('vanguard','overdrive',1);await buy('vanguard','overdrive',2);await buy('vanguard','blastKit',1);
  await checkLayout();
  await buy('vanguard','bulwark',1);await buy('vanguard','bulwark',2);await buy('vanguard','reserve',1);await buy('vanguard','reserve',2);await buy('vanguard','breachKit',1);await shot('vanguard-built');
  await click('TalentHero:scout');assert.deepEqual((await snapshot()).heroTalents.scout,{});await shot('scout-tree');
  await buy('scout','deadeye',1);await buy('scout','deadeye',2);await buy('scout','quickdraw',1);await buy('scout','quickdraw',2);await buy('scout','pierceKit',1);
  await buy('scout','featherstep',1);await buy('scout','featherstep',2);await buy('scout','evasion',1);await buy('scout','evasion',2);await buy('scout','mineKit',1);
  await shot('scout-built');await click('TalentHero:medic');await checkLayout();await shot('medic-tree');
  await buy('medic','triage',1);await buy('medic','triage',2);await buy('medic','regenerator',1);await buy('medic','regenerator',2);await buy('medic','pulseKit',1);
  await buy('medic','secondWind',1);await buy('medic','secondWind',2);await buy('medic','fieldAmmo',1);await buy('medic','fieldAmmo',2);await buy('medic','shieldKit',1);await shot('medic-built');
  const earned=await snapshot();await page.reload();await page.waitForFunction(()=>window.emberlineReady===true);assert.deepEqual(await snapshot(),earned);
  await click('OpenShop');await click('TabItems');await checkLayout();assert.equal(await fixture(`return h.overlay.children.some(n=>n.name==='ShopCard:vitality');`),false);
  await click('Buy:cryo');await click('Equip:cryo');assert.equal((await snapshot()).items.cryo,3);await shot('supply-shop');await click('BackCamp');
  for(const hero of ['vanguard','scout','medic']){
   await click('OpenHeroes');await click('Hero:'+hero);await click('StartRun');await page.waitForFunction(()=>JSON.parse(render_game_to_text()).phase==='playing');
   await fixture('h.enabled=false;h.sim.spawnTimer=999;h.sim.fireTimer=999;h.sim.invulnerable=999;h.sim.xpNext=1e9;');
   const combat=await fixture(`const s=h.sim;return {hero:s.hero.id,hp:s.maxHp,ammo:s.magazineSize,damage:s.damage,critical:s.criticalChance,shield:s.shield,upgrades:s.upgrades,ranks:s.heroTalents};`);
   assert.equal(combat.hero,hero);assert.equal(combat.upgrades.frost,1);assert.equal(combat.ranks.arsenal,hero==='vanguard'?3:undefined);
   if(hero==='vanguard'){assert.equal(combat.hp,120);assert.equal(combat.ammo,22);assert.equal(combat.upgrades.blast,1);assert.equal(combat.upgrades.reloadBurst,1);}
   if(hero==='scout'){assert.equal(combat.hp,80);assert.equal(combat.upgrades.mines,1);assert.equal(combat.upgrades.pierce,1);await fixture('h.sim.dash();for(let i=0;i<32;i++)h.update(1/60);');assert.equal(await fixture('return h.mineView.snapshot().active;'),1);}
   if(hero==='medic'){assert.equal(combat.hp,135);assert.equal(combat.upgrades.pulse,1);assert.equal(combat.shield,28);}
   await shot(hero+'-combat');report.checks[tag+'-'+hero]=combat;
   const income=await fixture(`const s=h.sim,base=s.earnedCoins;s.enemies=[];for(let i=0;i<100;i++){const e=s.spawn('walker',{x:300,y:0});s.hurtEnemy(e,1e6,0,0);s.enemies=[];}return s.earnedCoins-base;`);assert(Math.abs(income-68)<1e-7);
   await fixture('await h.returnMenu();h.update(0);');
  }
  assert.equal((await snapshot()).items.cryo,0);assert.deepEqual(errors,[]);report.checks[tag+'Migration']={refund:240,persisted:true,oldKeyRetained:true};report.checks[tag+'Errors']=errors;await context.close();
 }
 // Two actual pages share Web Locks; the first refund and simultaneous buys must serialize.
 const ctx=await browser.newContext(),a=await ctx.newPage();await a.goto(url);await a.waitForFunction(()=>window.emberlineReady);
 await a.evaluate(()=>{localStorage.removeItem('emberline-profile-v2');localStorage.setItem('emberline-profile-v1',JSON.stringify({version:1,coins:50,talents:{vitality:1}}));});
 const b=await ctx.newPage();await Promise.all([a.reload(),b.goto(url)]);await Promise.all([a.waitForFunction(()=>window.emberlineReady),b.waitForFunction(()=>window.emberlineReady)]);
 const purchaseInPage=(page,hero,id)=>page.evaluate(async ({hero,id})=>{const cc=System.get(System.resolve('cc')),h=cc.director.getScene().getChildByName('Game').getComponent('Emberline');await h.buyHeroTalent(hero,id);return h.shopNotice;},{hero,id});
 const receipts=await Promise.all([purchaseInPage(a,'vanguard','arsenal'),purchaseInPage(b,'scout','deadeye')]);
 const saved=await a.evaluate(()=>JSON.parse(localStorage.getItem('emberline-profile-v2')));assert.equal(saved.coins,30);assert.equal(saved.legacyRefund,60);assert.equal((saved.heroTalents.vanguard.arsenal||0)+(saved.heroTalents.scout.deadeye||0),1);
 report.checks.crossPage={receipts,coins:saved.coins,refund:saved.legacyRefund};await ctx.close();report.result='passed';
 }catch(e){report.result='failed';report.error=e.stack;throw e;}
 finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify({result:report.result,checks:Object.keys(report.checks)}));
})().catch(e=>{console.error(e);process.exitCode=1;});
