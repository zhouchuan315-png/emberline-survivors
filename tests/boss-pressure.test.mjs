import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../assets/scripts/core/Simulation.ts';
import {ARENAS} from '../assets/scripts/core/Campaign.ts';
import {bossForMap,pursuitTopSpeed} from '../assets/scripts/core/BossEncounter.ts';
import {isFree,moveCircle} from '../assets/scripts/core/SceneMap.ts';
const run=(map='yard')=>{const s=new Simulation(928,map);s.start();s.spawnTimer=999;s.fireTimer=999;s.invulnerable=999;s.xpNext=1e9;return s};
const tick=(s,seconds,mx=0,my=0)=>{for(let i=0;i<Math.ceil(seconds*60);i++)s.update(1/60,mx,my)};

test('every map schedules unique rotating mini bosses, pays once, and reserves the final victory gate',()=>{
 for(const arena of ARENAS){
  const s=run(arena.id),seen=[];
  for(const wave of arena.eliteWaves){
   s.time=(wave-1)*arena.waveSeconds-.01;s.update(.02);
   const elite=s.enemies.find(e=>e.boss?.tier==='elite'&&e.hp>0);assert(elite);seen.push(elite.boss.id);
   assert.equal(elite.finalBoss,false);assert.equal(elite.radius,32);assert.equal(s.bossSpawned,false);
   assert.equal(s.bossWarning.tier,'elite');assert.equal(s.bossWarning.total,2.2);
   const frozen=JSON.stringify(s.snapshot());s.pause();tick(s,1);s.pause();assert.equal(JSON.stringify(s.snapshot()),frozen);
   tick(s,.2);assert.equal(s.enemies.filter(e=>e.boss?.tier==='elite').length,1);
   const coins=s.coins;s.hurtEnemy(elite,1e9,0,0);const paid=s.coins;s.hurtEnemy(elite,1e9,0,0);
   assert(paid-coins>=24);assert.equal(s.coins,paid);assert(s.drops.some(d=>d.kind==='heal'));assert.equal(s.bossDefeated,false);
   s.update(.01);tick(s,.1);assert(!s.enemies.some(e=>e.boss));
  }
  assert.deepEqual(s.eliteWavesSpawned,arena.eliteWaves);assert(new Set(seen).size>=2);
  s.time=s.duration-arena.waveSeconds;s.update(.01);
  const final=s.enemies.find(e=>e.finalBoss);assert(final);assert.equal(final.boss.id,bossForMap(arena.id));assert.equal(s.bossWarning.tier,'final');
  tick(s,.1);assert.equal(s.enemies.filter(e=>e.finalBoss).length,1);s.time=s.duration;s.update(.01);assert.equal(s.phase,'playing');
  s.hurtEnemy(final,1e9,0,0);s.update(.01);assert.equal(s.phase,'won');
 }
});

test('uncleared mini bosses queue instead of stacking, and surviving elites must be cleared before escape',()=>{
 const s=run();s.time=75;s.update(.01);const elite=s.enemies.find(e=>e.boss);
 s.time=175;s.update(.01);assert.deepEqual(s.eliteWavesSpawned,[4]);assert.equal(s.enemies.filter(e=>e.boss).length,1);
 s.hurtEnemy(elite,1e9,0,0);s.update(.01);assert.deepEqual(s.eliteWavesSpawned,[4,8]);
 const second=s.enemies.find(e=>e.boss);s.time=275;s.update(.01);const final=s.enemies.find(e=>e.finalBoss);
 assert.equal(s.enemies.filter(e=>e.boss).length,2);s.hurtEnemy(final,1e9,0,0);s.time=300;s.update(.01);assert.equal(s.phase,'playing');
 s.hurtEnemy(second,1e9,0,0);s.update(.01);assert.equal(s.phase,'won');
});

test('arrival grace freezes boss behavior, then warning expires with simulation time',()=>{
 const s=run();s.time=275;s.update(.01);const e=s.enemies.find(e=>e.finalBoss),p={x:e.x,y:e.y};
 assert.equal(s.drainCombatEvents().filter(e=>e.type==='bossArrival').length,1);
 tick(s,2.8);assert.equal(e.x,p.x);assert.equal(e.y,p.y);assert.equal(e.boss.casts,0);assert(s.bossWarning);
 s.pause();const before=JSON.stringify(s.snapshot());tick(s,3);assert.equal(JSON.stringify(s.snapshot()),before);s.pause();
 tick(s,.3);assert.equal(s.bossWarning,null);assert.equal(e.boss.arrival,0);assert.equal(s.drainCombatEvents().filter(e=>e.type==='bossArrival').length,0);
});

test('all final bosses telegraph, accelerate toward the player, then lock a damaging stomp with recovery',()=>{
 for(const id of ['warden','furnace','hive']){
  const s=run(),e=s.spawn('boss',{x:360,y:0},{id,tier:'final'});e.boss.cooldown=0;
  const hp=s.hp;s.update(.01);assert.equal(e.boss.skill,'hunt');assert(e.boss.castRemaining>=.7);
  const x=e.x;tick(s,.65);assert.equal(e.x,x);assert.equal(s.hp,hp);
  while(e.boss.pursuitRemaining===0)s.update(1/60);
  const speed=e.boss.pursuitSpeed;tick(s,.2);assert(e.boss.pursuitSpeed>speed);assert(e.x<x);
  // The locked stomp should let a dash escape, but hit an unmoving player.
  for(let i=0;i<180&&e.boss.skill!=='slam';i++)s.update(1/60);
  assert.equal(e.boss.skill,'slam');assert(e.boss.castRemaining>.5);assert.equal(e.boss.pursuitRemaining,0);
  const zone=s.bosses.zones.find(z=>z.owner===e.id);assert(zone&&!zone.activated);
  s.invulnerable=0;tick(s,.45);assert.equal(s.hp,hp);tick(s,.3);assert(s.hp<hp);assert(e.boss.recovery>0);
  const after={x:e.x,y:e.y};tick(s,.2);assert.equal(e.x,after.x);assert.equal(e.y,after.y);
  assert(pursuitTopSpeed({...e.boss,phase:3})>pursuitTopSpeed({...e.boss,phase:1}));
 }
});

test('pursuit closes the distance on a running player and can be dodged after its stomp locks',()=>{
 const s=run(),e=s.spawn('boss',{x:400,y:0});e.boss.cooldown=0;
 // Wait for the wind-up, then run away during the chase.
 s.update(.01);while(e.boss.pursuitRemaining===0)s.update(1/60);
 const gap=Math.hypot(e.x-s.x,e.y-s.y);tick(s,1,-1,0);assert(Math.hypot(e.x-s.x,e.y-s.y)<gap-60);
 s.x=0;s.y=0;e.x=100;e.y=0;e.boss.pursuitRemaining=1;e.boss.recovery=0;s.update(.01);
 assert.equal(e.boss.skill,'slam');s.invulnerable=0;s.lastMoveX=-1;s.lastMoveY=0;s.dash();const hp=s.hp;
 tick(s,.8,-1,0);assert.equal(s.hp,hp);
});

test('pursuit stays outside solid footprints and clears on phase change and death',()=>{
 for(const arena of ARENAS){
  const s=run(arena.id),obstacle=s.map.obstacles[0];
  const a=moveCircle({x:obstacle.x-obstacle.width*.7-80,y:obstacle.y},0,0,45,s.map.obstacles);
  const p=moveCircle({x:obstacle.x+obstacle.width*.7+80,y:obstacle.y},0,0,16,s.map.obstacles);s.x=p.x;s.y=p.y;
  const e=s.spawn('boss',a);e.boss.cooldown=0;e.boss.skill='hunt';e.boss.pursuitRemaining=3;e.boss.pursuitSpeed=470;
  for(let i=0;i<150;i++){s.update(1/60);assert(isFree(e,45,s.map.obstacles));}
  e.boss.pursuitRemaining=2;e.boss.pursuitSpeed=400;s.hurtEnemy(e,e.maxHp*.4,0,0);s.update(.01);
  assert.equal(e.boss.phase,2);assert.equal(e.boss.pursuitRemaining,0);assert.equal(e.boss.pursuitSpeed,0);
  s.bosses.zones.push({id:999,owner:e.id,x:e.x,y:e.y,kind:'slam',radius:100,warning:1,warningTotal:1,life:1,damage:40,activated:false});
  s.hurtEnemy(e,1e9,0,0);s.update(.01);assert(!s.enemies.includes(e));assert(!s.bosses.zones.some(z=>z.owner===e.id));
 }
});
