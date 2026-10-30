import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
import { ARENAS, waveRoster } from '../assets/scripts/core/Campaign.ts';
import { createLevelMap, Navigation, isFree, moveCircle, hazardPhase } from '../assets/scripts/core/SceneMap.ts';
import { freshProfile, parseProfile, purchase, equipItem, beginRun, creditRun, ProfileStore, START_ITEMS, PROFILE_KEY } from '../assets/scripts/core/Progression.ts';
import { BOSSES, bossForMap } from '../assets/scripts/core/BossEncounter.ts';
import { HEROES } from '../assets/scripts/core/Characters.ts';

const tick=(s,n)=>{for(let i=0;i<n;i++)s.update(1/60);};
const arena=(map='yard')=>{const s=new Simulation(240924,map);s.start();s.spawnTimer=999;s.fireTimer=999;return s;};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('shop only sells start items and rejects the retired shared talents',()=>{
  const p=freshProfile();assert.equal(purchase(p,'medkit').ok,false);assert.equal(p.coins,0);
  p.coins=2000;for(const id of ['vitality','firepower','mobility','logistics','recovery','fortune','unknown']){
    const before=JSON.stringify(p);assert.equal(purchase(p,id).ok,false);assert.equal(JSON.stringify(p),before);
  }
  for(const entry of START_ITEMS)assert(purchase(p,entry.id).ok);
  p.items.medkit=99;const before=JSON.stringify(p);assert(!purchase(p,'medkit').ok);assert.equal(JSON.stringify(p),before);
});
test('equipped stock is consumed exactly once per new run, exhausted items give no bonus',()=>{
  const p=freshProfile();p.coins=90;assert.ok(purchase(p,'cryo').ok);assert.ok(equipItem(p,'cryo'));
  assert.equal(beginRun(p,'run-1').item,'cryo');assert.equal(p.items.cryo,0);
  assert.throws(()=>beginRun(p,'run-1'));assert.equal(p.items.cryo,0);
  assert.equal(beginRun(p,'run-2').item,null);assert.equal(equipItem(p,'battery'),false);
  assert.equal(p.runs,2);
});
test('kill checkpoints and death/victory settlement credit cumulative deltas once per tab',()=>{
  const p=freshProfile();beginRun(p,'tab-a');beginRun(p,'tab-b');
  assert.equal(creditRun(p,'tab-a',9),9);assert.equal(creditRun(p,'tab-a',9),0);assert.equal(creditRun(p,'tab-a',3),0);
  assert.equal(creditRun(p,'tab-b',11,true,false),11);assert.equal(creditRun(p,'tab-b',11,true,false),0);
  assert.equal(creditRun(p,'tab-a',20,true,true),11);assert.equal(creditRun(p,'tab-a',20,true,true),0);
  assert.equal(p.coins,31);assert.equal(p.totalEarned,31);assert.equal(p.wins,1);assert.deepEqual(p.activeRuns,{});
});
test('profile parsing validates corrupt and unknown storage and preserves receipts',()=>{
  assert.deepEqual(parseProfile('bad json'),freshProfile());
  const p=parseProfile(JSON.stringify({version:1,coins:-20,talents:{vitality:999,unknown:99},items:{cryo:2.9},selectedMap:'bad',equipped:'bad'}));
  assert.equal(p.coins,700);assert.equal(p.legacyRefund,700);assert.equal(p.talents,undefined);assert.equal(p.items.cryo,2);assert.equal(p.selectedMap,'yard');assert.equal(p.equipped,null);
  const valid=freshProfile();valid.coins=75;valid.selectedMap='foundry';beginRun(valid,'saved');creditRun(valid,'saved',6);
  assert.equal(parseProfile(JSON.stringify(valid)).activeRuns.saved,6);
  assert.equal(parseProfile(JSON.stringify({...valid,activeRun:{id:'legacy',credited:15}})).activeRuns.legacy,15);
});
test('two stores serialize purchases and payouts against fresh storage; failed writes deduct nothing',async()=>{
  let stored=JSON.stringify({...freshProfile(),coins:100});const storage={getItem:()=>stored,setItem:(key,value)=>{assert.equal(key,PROFILE_KEY);stored=value;}};
  let serial=Promise.resolve();const lock=fn=>{const task=serial.then(fn);serial=task.catch(()=>{});return task;};
  const a=new ProfileStore(storage,lock),b=new ProfileStore(storage,lock);
  const buys=await Promise.all([a.transact(p=>purchase(p,'battery')),b.transact(p=>purchase(p,'battery'))]);
  assert.equal(buys.filter(r=>r.value.ok).length,1);assert.equal(parseProfile(stored).coins,45);
  await Promise.all([a.transact(p=>beginRun(p,'a')),b.transact(p=>beginRun(p,'b'))]);
  await Promise.all([a.transact(p=>creditRun(p,'a',50,true)),b.transact(p=>creditRun(p,'b',50,true))]);
  assert.equal(parseProfile(stored).coins,145);
  const before=stored;storage.setItem=()=>{throw new Error('quota');};await assert.rejects(a.transact(p=>purchase(p,'battery')));assert.equal(stored,before);
  storage.setItem=(key,value)=>{stored=value;};await a.transact(p=>purchase(p,'battery'));assert.equal(parseProfile(stored).coins,90);
});
test('start items apply combat effects and retired talent bonuses are ignored',()=>{
  const s=new Simulation(7,'foundry',{talents:{vitality:5,firepower:5,mobility:5,logistics:5,recovery:5,fortune:5},item:'supply'});s.start();
  assert.equal(s.maxHp,100);near(s.damage,24);near(s.speed,215);assert.equal(s.ammo,24);
  s.spawnTimer=999;s.fireTimer=999;s.hp=90;tick(s,60);near(s.hp,90);
  s.time=24.99;s.update(.02);assert.equal(s.coins,Math.floor(14*1.5*.68));
  for(const [item,upgrade] of [['cryo','frost'],['battery','pulse']])assert.equal(new Simulation(7,'yard',{item}).upgrades[upgrade],1);
  assert.equal(new Simulation(7,'yard',{item:'medkit'}).maxHp,130);
});

test('selectable heroes apply distinct combat profiles and persist through a loadout',()=>{
  assert.deepEqual(HEROES.map(h=>h.id),['vanguard','scout','medic']);
  const base=new Simulation(240924,'yard',{talents:{},item:null,hero:'vanguard'});
  const scout=new Simulation(240924,'yard',{talents:{},item:null,hero:'scout'});
  const medic=new Simulation(240924,'yard',{talents:{},item:null,hero:'medic'});
  assert.equal(base.hero.id,'vanguard');assert.equal(scout.hero.id,'scout');assert.equal(medic.hero.id,'medic');
  assert.ok(scout.speed>base.speed);assert.ok(scout.reloadDuration<base.reloadDuration);assert.ok(scout.maxHp<base.maxHp);
  assert.ok(medic.maxHp>base.maxHp);assert.ok(medic.hero.regen>base.hero.regen);assert.ok(medic.damage<base.damage);
});

test('each map selects a distinct three-phase boss with readable telegraphs and owned projectiles',()=>{
  for(const [map,id] of [['yard','warden'],['foundry','furnace'],['laboratory','hive']]){
    assert.equal(bossForMap(map),id);assert.equal(BOSSES[id].patterns.length,3);
    const s=arena(map);s.spawnTimer=999;s.fireTimer=999;s.time=s.duration-s.arena.waveSeconds-.01;s.update(.02);
    const boss=s.enemies.find(e=>e.finalBoss);assert.ok(boss?.boss);assert.equal(boss.boss.id,id);
    tick(s,186);s.x=boss.x-100;s.y=boss.y;s.bosses.zones.length=0;boss.boss.cooldown=0;s.update(.01);
    assert.ok(boss.boss.castRemaining>0||s.bosses.zones.length>0,`${map} boss started a wind-up`);
    const firstHp=boss.hp;s.hurtEnemy(boss,firstHp*.36,0,0);s.update(.01);assert.equal(boss.boss.phase,2);assert.equal(s.bosses.zones.length,0);
    s.hurtEnemy(boss,boss.maxHp*.36,0,0);s.update(.01);assert.equal(boss.boss.phase,3);
    boss.boss.cooldown=0;boss.boss.skill='volley';boss.boss.castRemaining=.01;s.update(.02);
    assert.ok(s.enemyProjectiles.every(p=>p.owner===boss.id),'boss projectiles carry their owner');
  }
});
test('all campaigns have longer waves, harder stats and a unique final boss gate',()=>{
  let hp=0,speed=0;
  for(const [i,a] of ARENAS.entries()){
    const s=arena(a.id);assert.equal(s.duration,[300,400,500][i]);assert.equal(s.arena.waves,[12,16,20][i]);
    const e=s.spawn('walker',{x:500,y:0});assert.ok(e.hp>hp&&e.speed>=speed);hp=e.hp;speed=e.speed;s.enemies=[];
    s.invulnerable=999;s.time=s.duration-a.waveSeconds-.01;s.update(.02);assert.equal(s.wave,a.waves);
    const boss=s.enemies.find(e=>e.finalBoss);assert.ok(boss);s.update(.01);assert.equal(s.enemies.filter(e=>e.finalBoss).length,1);
    s.time=s.duration;s.update(.01);assert.equal(s.phase,'playing');const coins=s.coins;
    s.hurtEnemy(boss,1e9,0,0);s.update(.01);assert.equal(s.phase,'won');assert.ok(s.coins>coins);const earned=s.coins;tick(s,60);assert.equal(s.coins,earned);
  }
  assert.deepEqual(new Set(waveRoster(20)),new Set(['walker','runner','brute','spitter','bomber','charger','summoner']));
});
test('new layouts connect every prop and spawn gate for small and boss sized enemies',()=>{
  for(const [i,a] of ARENAS.entries()){
    const map=createLevelMap(a.id),nav=new Navigation(map.obstacles);assert.equal(map.obstacles.length,[24,30,36][i]);
    for(const gate of [{x:0,y:0},...map.gates])assert.ok(isFree(gate,48,map.obstacles),`${a.id} gate`);
    for(const radius of [18,45])for(const obstacle of map.obstacles){
      let p=moveCircle({x:obstacle.x-obstacle.width*.65-radius,y:obstacle.y},0,0,radius,map.obstacles);
      const target=moveCircle({x:obstacle.x+obstacle.width*.65+radius,y:obstacle.y},0,0,radius,map.obstacles);
      for(let n=0;n<1100&&Math.hypot(p.x-target.x,p.y-target.y)>12;n++){
        const q=nav.direction(p,target,radius),d=Math.hypot(q.x-p.x,q.y-p.y)||1;
        p=moveCircle(p,(q.x-p.x)/d*3,(q.y-p.y)/d*3,radius,map.obstacles);assert.ok(isFree(p,radius,map.obstacles),`${a.id} ${obstacle.id} r=${radius} p=${JSON.stringify(p)}`);
      }
      assert.ok(Math.hypot(p.x-target.x,p.y-target.y)<15,`${a.id} ${obstacle.id} radius ${radius}`);
    }
  }
});
test('spitter telegraphs with locked aim, fires a damaging projectile, and cover stops acid',()=>{
  const s=arena();const e=s.spawn('spitter',{x:220,y:0});e.abilityCooldown=0;s.update(.01);assert.ok(e.warning>0);assert.equal(s.enemyProjectiles.length,0);
  tick(s,47);assert.equal(s.enemyProjectiles.length,0);tick(s,3);assert.equal(s.enemyProjectiles.length,1);tick(s,50);assert.ok(s.hp<100);
  const covered=arena();const o=covered.map.obstacles[10];covered.x=o.x;covered.y=o.y+100;
  covered.enemyProjectiles=[{id:1,x:o.x,y:o.y-140,vx:0,vy:10000,life:1,damage:50}];covered.update(.05);
  assert.equal(covered.hp,100);assert.equal(covered.enemyProjectiles.length,0);
  const dodge=arena();const spitter=dodge.spawn('spitter',{x:220,y:0});spitter.abilityCooldown=0;dodge.update(.01);dodge.y=150;tick(dodge,110);assert.equal(dodge.hp,100);
});
test('bomber has a dodge window, self-destruction has no reward, and early kills pay once',()=>{
  const s=arena();const e=s.spawn('bomber',{x:75,y:0});e.abilityCooldown=0;s.update(.01);assert.ok(e.warning>1);
  s.x=-130;tick(s,70);assert.equal(s.hp,100);assert.equal(s.kills,0);assert.equal(s.coins,0);assert.equal(s.enemies.length,0);
  const events=s.drainCombatEvents();assert.equal(events.filter(v=>v.type==='explosion').length,1);
  assert.equal(events.find(v=>v.type==='explosion').actorId,e.id);
  assert.equal(events.find(v=>v.type==='death').detonated,true);
  assert.equal(events.filter(v=>v.type==='attack').length,0);
  const killed=s.spawn('bomber',{x:s.x+75,y:s.y});s.hurtEnemy(killed,999,0,0);s.hurtEnemy(killed,999,0,0);assert.equal(s.kills,1);assert.equal(s.coins,2);
  const killedEvents=s.drainCombatEvents();assert.equal(killedEvents.filter(v=>v.type==='explosion').length,0);
  assert.equal(killedEvents.filter(v=>v.type==='death').length,1);assert.equal(killedEvents.find(v=>v.type==='death').detonated,undefined);
});
test('charger commits to its telegraphed direction and collides with cover',()=>{
  const s=arena();const e=s.spawn('charger',{x:250,y:0});e.abilityCooldown=0;s.update(.01);assert.ok(e.warning>0);assert.equal(e.chargeX,-1);
  s.y=170;tick(s,50);assert.ok(e.chargeTime>0);const x=e.x;tick(s,20);assert.ok(e.x<x-120);near(e.y,0);assert.equal(s.hp,100);
  const o=s.map.obstacles[10];e.x=o.x;e.y=o.y-130;e.chargeTime=.6;e.chargeX=0;e.chargeY=1;
  tick(s,35);assert.ok(isFree(e,e.radius,s.map.obstacles));assert.ok(e.y<o.y+70);
});
test('summoner creates two runners after a wind-up with a cooldown and crowd cap',()=>{
  const s=arena();const e=s.spawn('summoner',{x:300,y:0});e.abilityCooldown=0;s.update(.01);assert.equal(s.enemies.length,1);tick(s,74);
  assert.equal(s.enemies.filter(e=>e.kind==='runner').length,2);assert.ok(e.abilityCooldown>6);tick(s,60);assert.equal(s.enemies.length,3);
  while(s.enemies.length<130)s.spawn('walker',{x:1000,y:0});e.warning=.01;s.invulnerable=999;s.update(.02);assert.equal(s.enemies.length,130);
});
test('heat and toxic areas telegraph before damage; pause freezes hazards, attacks and projectiles',()=>{
  for(const id of ['foundry','laboratory']){
    const s=arena(id),h=s.map.hazards[0];s.x=h.x;s.y=h.y;s.time=5.1;assert.equal(hazardPhase(s.time,h),'warning');s.update(.01);assert.equal(s.hp,100);
    s.time=7.1;s.update(.01);assert.ok(s.hp<100);s.enemyProjectiles=[{id:1,x:0,y:0,vx:200,vy:0,life:2,damage:20}];
    const e=s.spawn('spitter',{x:s.x+200,y:s.y});e.warning=.4;s.pause();const before=JSON.stringify({snapshot:s.snapshot(),e,b:s.enemyProjectiles});tick(s,100);
    assert.equal(JSON.stringify({snapshot:s.snapshot(),e,b:s.enemyProjectiles}),before);
  }
});
