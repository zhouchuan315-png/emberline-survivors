import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, UPGRADES } from '../assets/scripts/core/Simulation.ts';
import { MAP } from '../assets/scripts/core/SceneMap.ts';
import { RunCycle } from '../assets/scripts/core/RunCycle.ts';

const step=(s,seconds,x=0,y=0)=>{for(let i=0;i<seconds*60;i++)s.update(1/60,x,y);};
test('movement is normalized and stays inside the arena',()=>{
  const a=new Simulation(1);a.start();const b=new Simulation(1);b.start();
  step(a,.5,1,0);step(b,.5,1,1);
  assert.ok(Math.abs(Math.hypot(b.x,b.y)-a.x)<.01);
  step(a,4,1,1);assert.ok(a.x<=MAP.width/2-MAP.playerRadius&&a.y<=MAP.height/2-MAP.playerRadius);
});
test('pause freezes the complete combat clock and dash is gated',()=>{
  const s=new Simulation(2);s.start();assert.ok(s.dash());assert.equal(s.dash(),false);
  s.pause();const before=JSON.stringify(s.snapshot());step(s,2,1,1);assert.equal(JSON.stringify(s.snapshot()),before);
  assert.equal(s.dash(),false);s.pause();step(s,4);assert.equal(s.dashCooldown,0);
});
test('automatic fire kills and creates collectible experience',()=>{
  const s=new Simulation(3);s.start();const e=s.spawn('walker',{x:70,y:0});
  step(s,1);assert.ok(!s.enemies.some(x=>x.id===e.id));assert.ok(s.kills>=1);assert.ok(s.xp>0||s.drops.length>0);
});
test('manual reload preserves remaining rounds until the completion event',()=>{
  const s=new Simulation(33);s.start();s.spawnTimer=999;s.fireTimer=999;
  assert.equal(s.ammo,18);assert.equal(s.magazineSize,18);s.ammo=3;
  assert.equal(s.reload(),true);assert.equal(s.reloading,true);assert.equal(s.reload(),false);
  const before=s.ammo;step(s,s.reloadDuration*.5);assert.equal(s.ammo,before);assert.ok(s.reloadProgress>0&&s.reloadProgress<1);
  step(s,s.reloadDuration*.6);assert.equal(s.ammo,s.magazineSize);assert.equal(s.reloading,false);assert.equal(s.reloadsCompleted,1);
  assert.ok(s.drainCombatEvents().some(e=>e.type==='reloadComplete'));
});
test('ammo and combat upgrade pool exposes distinct modifiers',()=>{
  for(const id of ['magazine','reload','velocity','armor','critical','frost','leech','finisher'])assert.ok(UPGRADES.some(u=>u.id===id),id);
  const s=new Simulation(34);s.start();s.upgrades={magazine:2,reload:2,velocity:2,armor:2,critical:2,finisher:1};
  assert.equal(s.magazineSize,30);assert.ok(s.reloadDuration<1.55);assert.equal(s.bulletSpeed,1190);assert.equal(s.criticalChance,.24);
  s.ammo=2;s.reload();assert.ok(s.reloading);s.pause();const t=s.reloadTimer;step(s,1);assert.equal(s.reloadTimer,t);
});
test('fast projectiles use swept collision instead of tunneling',()=>{
  const s=new Simulation(4);s.start();const e=s.spawn('walker',{x:42,y:0});
  s.bullets.push({id:999,x:0,y:0,vx:3000,vy:0,life:1,damage:500,pierce:0,hit:new Set()});
  s.update(.05);assert.ok(!s.enemies.some(x=>x.id===e.id));
});
test('level-up offers distinct choices, freezes combat, and applies selected upgrade',()=>{
  const s=new Simulation(5);s.start();s.xp=s.xpNext;s.update(.01);assert.equal(s.phase,'upgrade');
  assert.equal(new Set(s.choices.map(c=>c.id)).size,3);assert.equal(s.level,2);
  const t=s.time;step(s,1);assert.equal(s.time,t);const id=s.choices[0].id;
  assert.equal(s.selectUpgrade(9),false);assert.ok(s.selectUpgrade(0));assert.equal(s.upgrades[id],1);assert.equal(s.phase,'playing');
});
test('contact damage honors invincibility and death is terminal',()=>{
  const s=new Simulation(6);s.start();s.spawn('brute',{x:0,y:0});s.update(.01);const hp=s.hp;
  s.update(.01);assert.equal(s.hp,hp);s.hp=1;s.invulnerable=0;s.spawn('brute',{x:s.x,y:s.y});s.update(.01);
  assert.equal(s.phase,'dead');const t=s.time;step(s,1);assert.equal(s.time,t);
});
test('boss appears once and victory requires both time and a boss kill',()=>{
  const s=new Simulation(7);s.start();s.time=s.duration-s.arena.waveSeconds-.01;s.update(.02);assert.equal(s.enemies.filter(e=>e.kind==='boss').length,1);
  s.time=s.duration;s.update(.01);assert.equal(s.phase,'playing');s.hurtEnemy(s.enemies.find(e=>e.finalBoss),1e9,0,0);s.update(.01);assert.equal(s.phase,'won');
});
test('seeded runs produce reproducible spawns and upgrades',()=>{
  const a=new Simulation(123),b=new Simulation(123);a.start();b.start();step(a,8,.5,.2);step(b,8,.5,.2);
  assert.deepEqual(a.snapshot(),b.snapshot());assert.deepEqual(a.enemies,b.enemies);
});
test('combat feedback is consumed once and preserves dash events across update',()=>{
  const s=new Simulation(9);s.start();s.dash();s.update(.01);
  assert.equal(s.drainCombatEvents().filter(e=>e.type==='dash').length,1);
  assert.deepEqual(s.drainCombatEvents(),[]);
  const enemy=s.spawn('walker',{x:s.x+42,y:s.y});
  s.bullets.push({id:999,x:s.x,y:s.y,vx:3000,vy:0,life:1,damage:500,pierce:0,hit:new Set()});
  s.update(.02);const events=s.drainCombatEvents();
  assert.equal(events.filter(e=>e.type==='death'&&e.actorId===enemy.id).length,1);
  assert.ok(events.some(e=>e.type==='impact'&&e.amount===500));
  s.pause();step(s,1);assert.deepEqual(s.drainCombatEvents(),[]);
});
test('draining presentation feedback does not change deterministic gameplay',()=>{
  const a=new Simulation(31),b=new Simulation(31);a.start();b.start();
  for(let i=0;i<600;i++){a.update(1/60,.6,.1);a.drainCombatEvents();b.update(1/60,.6,.1);}
  assert.deepEqual(a.snapshot(),b.snapshot());assert.deepEqual(a.enemies,b.enemies);
  assert.deepEqual(a.effects,b.effects);
});
test('running cadence follows travelled distance across frame rates and speed boosts',()=>{
  const a=new RunCycle(),b=new RunCycle();
  for(let i=1;i<=60;i++)a.advance(i*52/60,0,1/60,1,false);
  for(let i=1;i<=30;i++)b.advance(i*52/30,0,1/30,1,false);
  assert.ok(Math.abs(a.phase-.5)<1e-9);assert.ok(Math.abs(a.phase-b.phase)<1e-9);
  a.advance(104,0,.2,1,false);assert.ok(Math.abs(a.phase-1)<1e-9);
});
test('run cycle stops on actual blockage, freezes on pause and holds a dash pose',()=>{
  const a=new RunCycle();a.advance(30,0,.1,1,false);const phase=a.phase;
  a.advance(30,0,0,1,false);assert.equal(a.moving,true);assert.equal(a.phase,phase);
  a.advance(30,0,.1,1,false);assert.equal(a.moving,false);assert.equal(a.phase,phase);
  a.advance(100,0,.1,1,true);assert.equal(a.dashing,true);assert.equal(a.phase,phase);assert.equal(a.frame,4);
});
test('dedicated movement atlas traverses 16 frames once over 104 world units',()=>{
  const cycle=new RunCycle(),frames=[cycle.frame];
  // Sample frame centers using actual movement, including the old modulo seam.
  for(let i=1;i<16;i++){
    cycle.advance((i+.25)*104/16,0,1/30,1,false);
    frames.push(cycle.frame);
  }
  assert.deepEqual(frames,Array.from({length:16},(_,i)=>i));
  cycle.advance(104.1,0,1/30,1,false);assert.equal(cycle.frame,0);
  cycle.reset();
  const reverse=[];
  for(let i=0;i<16;i++){
    cycle.advance(-(i+.25)*104/16,0,1/30,1,false);reverse.push(cycle.frame);
  }
  assert.deepEqual(reverse,Array.from({length:16},(_,i)=>15-i));
});
test('backpedal reverses leg timing while preserving facing and valid frame indices',()=>{
  const a=new RunCycle();
  for(let i=1;i<=80;i++){a.advance(-i*2,0,1/60,1,false);assert.ok(a.frame>=0&&a.frame<16);}
  assert.equal(a.backwards,true);assert.ok(a.phase<0);
  a.reset();assert.equal(a.frame,0);assert.equal(a.moving,false);
});
