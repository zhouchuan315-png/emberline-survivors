import test from 'node:test';
import assert from 'node:assert/strict';
import {HERO_TALENTS,sanitizeHeroTalents} from '../assets/scripts/core/HeroTalents.ts';
import {freshProfile,parseProfile,beginRun,purchase,purchaseHeroTalent,ProfileStore,PROFILE_KEY,LEGACY_PROFILE_KEY,creditRun,talentState} from '../assets/scripts/core/Progression.ts';
import {Simulation} from '../assets/scripts/core/Simulation.ts';
import {ARENAS,COIN_REWARD_SCALE} from '../assets/scripts/core/Campaign.ts';

const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const full=hero=>Object.fromEntries(HERO_TALENTS[hero].map(t=>[t.id,t.max]));
const make=(hero='vanguard',ranks={},item=null)=>{const s=new Simulation(929,'yard',{hero,heroTalents:ranks,item});s.start();s.spawnTimer=999;s.fireTimer=999;s.xpNext=1e9;return s;};
const tick=(s,seconds)=>{for(let i=0;i<Math.round(seconds*60);i++)s.update(1/60);};

test('three independent trees have two real branches, valid gates and capped prices',()=>{
  for(const hero of Object.keys(HERO_TALENTS)){
    const p=freshProfile();p.coins=10000;const entries=HERO_TALENTS[hero];assert.equal(entries.length,6);
    assert.equal(new Set(entries.map(t=>t.id)).size,6);
    for(const branch of [0,1]){
      const chain=entries.filter(t=>t.branch===branch);assert.deepEqual(chain.map(t=>t.tier),[0,1,2]);
      const [a,b,c]=chain;
      assert.equal(purchaseHeroTalent(p,hero,b.id).ok,false);assert.equal(purchaseHeroTalent(p,hero,c.id).ok,false);
      assert(purchaseHeroTalent(p,hero,a.id).ok);assert(!purchaseHeroTalent(p,hero,b.id).ok);
      assert(purchaseHeroTalent(p,hero,a.id).ok);assert(purchaseHeroTalent(p,hero,b.id).ok);
      assert(!purchaseHeroTalent(p,hero,c.id).ok);assert(purchaseHeroTalent(p,hero,b.id).ok);assert(purchaseHeroTalent(p,hero,c.id).ok);
      assert(purchaseHeroTalent(p,hero,a.id).ok);assert(purchaseHeroTalent(p,hero,b.id).ok);
      for(const entry of chain){const before=JSON.stringify(p);assert(!purchaseHeroTalent(p,hero,entry.id).ok);assert.equal(JSON.stringify(p),before);}
    }
    assert.equal(p.coins,6700);assert.deepEqual(p.heroTalents[hero],full(hero));
    for(const other of Object.keys(HERO_TALENTS).filter(id=>id!==hero))assert.deepEqual(p.heroTalents[other],{});
  }
});

test('unaffordable and foreign nodes do not deduct, exact balances buy once',()=>{
  const p=freshProfile(),a=HERO_TALENTS.vanguard[0];p.coins=79;
  const before=JSON.stringify(p);assert(!purchaseHeroTalent(p,'vanguard',a.id).ok);assert(!purchaseHeroTalent(p,'vanguard','deadeye').ok);assert.equal(JSON.stringify(p),before);
  assert.equal(talentState(p,'vanguard',a).reason,'还差 1 金币');p.coins=80;
  assert(purchaseHeroTalent(p,'vanguard',a.id).ok);assert.equal(p.coins,0);assert(!purchaseHeroTalent(p,'vanguard',a.id).ok);
});

test('legacy migration refunds actual rank costs once, retaining wallet, inventory and receipts',async()=>{
  const old={version:1,coins:111,totalEarned:1200,talents:{vitality:2,firepower:1,fortune:1},items:{cryo:3},equipped:'cryo',selectedHero:'scout',selectedMap:'foundry',runs:4,wins:1,activeRuns:{prior:8}};
  const data=new Map([[LEGACY_PROFILE_KEY,JSON.stringify(old)]]),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  const store=new ProfileStore(storage),read=store.read();assert.equal(read.coins,451);assert.equal(read.legacyRefund,340);assert.equal(read.totalEarned,1200);assert.equal(read.talents,undefined);
  await store.transact(()=>{});const again=store.read();assert.equal(again.coins,451);assert.equal(again.version,2);assert.equal(again.items.cryo,3);assert.equal(again.activeRuns.prior,8);
  await store.transact(()=>{});assert.equal(store.read().coins,451);assert.equal(data.get(LEGACY_PROFILE_KEY),JSON.stringify(old));
  // An already-open legacy build writes the old key; it must not overwrite the migrated tree/wallet.
  data.set(LEGACY_PROFILE_KEY,JSON.stringify({...old,coins:99999}));assert.equal(store.read().coins,451);
  const run=await store.transact(p=>beginRun(p,'new'));assert.deepEqual(run.value.heroTalents,{});assert.equal(run.profile.items.cryo,2);assert.equal(run.value.hero,'scout');assert.equal(run.value.talents,undefined);
});

test('failed migration writes retry without losing legacy data or duplicating refunds',async()=>{
  const legacy=JSON.stringify({version:1,coins:10,talents:{vitality:1}}),data=new Map([[LEGACY_PROFILE_KEY,legacy]]);let fail=true;
  const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(fail)throw Error('quota');data.set(k,v);}},store=new ProfileStore(storage);
  await assert.rejects(store.transact(()=>{}));assert.equal(data.has(PROFILE_KEY),false);assert.equal(data.get(LEGACY_PROFILE_KEY),legacy);
  fail=false;await store.transact(()=>{});assert.equal(store.read().coins,70);await store.transact(()=>{});assert.equal(store.read().coins,70);
});

test('two pages serialize talent buys and migration, preserve other heroes and rewards',async()=>{
  const data=new Map([[LEGACY_PROFILE_KEY,JSON.stringify({version:1,coins:50,talents:{vitality:1}})]]);
  const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};let queue=Promise.resolve();
  const lock=fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next;};
  const a=new ProfileStore(storage,lock),b=new ProfileStore(storage,lock);
  const result=await Promise.all([a.transact(p=>purchaseHeroTalent(p,'vanguard','arsenal')),b.transact(p=>purchaseHeroTalent(p,'scout','deadeye'))]);
  assert.equal(result.filter(r=>r.value.ok).length,1);assert.equal(a.read().coins,30);assert.equal(a.read().legacyRefund,60);
  await a.transact(p=>beginRun(p,'reward'));await b.transact(p=>creditRun(p,'reward',100,true));assert.equal(a.read().coins,130);
  await b.transact(p=>purchaseHeroTalent(p,'scout','featherstep'));assert.equal(a.read().coins,50);assert.equal(a.read().heroTalents.vanguard.arsenal,1);assert.equal(a.read().heroTalents.scout.featherstep,1);
});

test('invalid ranks and cross-hero or orphaned nodes cannot grant effects',()=>{
  assert.deepEqual(sanitizeHeroTalents('vanguard',{arsenal:Infinity,overdrive:3,blastKit:1,deadeye:99,bulwark:3.8}),{bulwark:3});
  const p=parseProfile(JSON.stringify({...freshProfile(),heroTalents:{vanguard:{arsenal:99,overdrive:2,blastKit:99},scout:{arsenal:3},medic:{shieldKit:1}}}));
  assert.deepEqual(p.heroTalents.vanguard,{arsenal:3,overdrive:2,blastKit:1});assert.deepEqual(p.heroTalents.scout,{});assert.deepEqual(p.heroTalents.medic,{});
  const s=make('scout',{...full('vanguard'),shieldKit:1});near(s.damage,24*.9);assert.equal(s.upgrades.blast,undefined);assert.equal(s.shieldMax,0);
});

test('all eighteen nodes affect the intended hero and capstone start skills work',()=>{
  const v=make('vanguard',full('vanguard'));assert.equal(v.maxHp,130);near(v.damage,24*1.15);assert.equal(v.ammo,24);near(v.fireInterval,.43*.97**3);assert.equal(v.upgrades.blast,1);assert.equal(v.upgrades.reloadBurst,1);
  const s=make('scout',full('scout'));near(s.speed,215*1.18*1.12);near(s.criticalChance,.09);near(s.reloadDuration,1.55*.85*.95**3);near(s.dashDuration,3.2);assert.equal(s.upgrades.pierce,1);assert(s.dash());assert.equal(s.mines.length,1);
  const m=make('medic',full('medic'));assert.equal(m.maxHp,145);assert.equal(m.ammo,24);assert.equal(m.upgrades.pulse,1);assert.equal(m.shield,28);
  m.hp=100;tick(m,1);near(m.hp,101.2);m.shield=0;m.damagePlayer(20);near(m.hp,101.2-18.2);
  // Talent capstone and identical consumable never double-stack a starting upgrade.
  const combined=make('medic',full('medic'),'battery');assert.equal(combined.upgrades.pulse,1);
  const p=freshProfile();p.heroTalents.vanguard=full('vanguard');p.selectedHero='scout';const loadout=beginRun(p,'switch');assert.deepEqual(loadout.heroTalents,{});
  p.selectedHero='vanguard';const snap=beginRun(p,'snapshot');p.heroTalents.vanguard.arsenal=1;assert.equal(snap.heroTalents.arsenal,3);
});

test('all gold sources are 32 percent scarcer without per-kill truncation or RNG changes',()=>{
  assert.equal(COIN_REWARD_SCALE,.68);
  for(const arena of ARENAS){
    const s=new Simulation(929,arena.id);s.start();s.spawnTimer=999;s.fireTimer=999;s.invulnerable=999;s.xpNext=1e9;
    for(let i=0;i<100;i++){const e=s.spawn('walker',{x:300,y:0});s.hurtEnemy(e,1e6,0,0);s.enemies=[];}
    assert.equal(s.coins,Math.floor(100*arena.reward*.68));
    const before=s.earnedCoins,e=s.spawn('boss',{x:250,y:0},{id:'warden',tier:'elite'});s.hurtEnemy(e,1e9,0,0);near(s.earnedCoins-before,50*arena.reward*.68);
    const seed=s.seed;s.reward(10);assert.equal(s.seed,seed); // Reward calculation consumes no gameplay RNG.
  }
  const s=make();s.time=24.99;s.update(.02);near(s.earnedCoins,14*.68);s.pause();const before=s.coins;tick(s,2);assert.equal(s.coins,before);
});
