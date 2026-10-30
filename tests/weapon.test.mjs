import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, UPGRADES } from '../assets/scripts/core/Simulation.ts';

const tick=(s,n,x=0,y=0)=>{for(let i=0;i<n;i++)s.update(1/60,x,y);};
function arena(seed=200){const s=new Simulation(seed);s.start();s.spawnTimer=999;s.invulnerable=999;return s;}
function target(s,x=200){const e=s.spawn('brute',{x,y:0});e.speed=0;e.hp=e.maxHp=10000;return e;}
function choose(s,id){s.phase='upgrade';s.choices=[UPGRADES.find(u=>u.id===id)];assert.equal(s.selectUpgrade(0),true);}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('empty magazine auto-reloads once, blocks volleys, then resumes fire',()=>{
  const s=arena();target(s);s.ammo=1;s.upgrades.multi=2;s.update(.01);
  assert.equal(s.ammo,0);assert.equal(s.shotEvents,1);assert.equal(s.bullets.length,3);
  assert.equal(s.reloading,true);assert.equal(s.drainCombatEvents().filter(e=>e.type==='reload').length,1);
  tick(s,60);assert.equal(s.shotEvents,1);assert.equal(s.ammo,0);assert.equal(s.reload(),false);
  tick(s,34);assert.equal(s.reloadsCompleted,1);assert.equal(s.shotEvents,2);assert.equal(s.ammo,17);
  const events=s.drainCombatEvents();assert.equal(events.filter(e=>e.type==='reloadComplete').length,1);
  assert.equal(events.filter(e=>e.type==='reload').length,0);
});

test('manual reload respects phases, freezes in upgrades, and permits movement and dash',()=>{
  const s=arena();assert.equal(s.reload(),false);tick(s,20);assert.equal(s.ammo,18);
  s.ammo=5;assert.equal(s.reload(),true);assert.equal(s.reload(),false);
  tick(s,6,1,0);assert.ok(s.x>0);assert.equal(s.dash(),true);
  s.xp=s.xpNext;s.update(.01);assert.equal(s.phase,'upgrade');
  const snapshot=s.snapshot();tick(s,90);assert.deepEqual(s.snapshot(),snapshot);assert.equal(s.reload(),false);
  s.selectUpgrade(0);s.enemies=[];tick(s,110);assert.equal(s.reloading,false);assert.equal(s.ammo,s.magazineSize);
  for(const phase of ['menu','paused','upgrade','dead','won']){s.phase=phase;s.ammo=2;assert.equal(s.reload(),false);}
});

test('capacity and reload upgrades preserve in-progress reload without free firing',()=>{
  const s=arena();s.ammo=4;choose(s,'magazine');assert.equal(s.ammo,10);assert.equal(s.magazineSize,24);
  s.reload();tick(s,30);const progress=s.reloadProgress,remaining=s.reloadTimer;
  choose(s,'reload');near(s.reloadProgress,progress);near(s.reloadTimer,remaining*.78);
  choose(s,'magazine');assert.equal(s.ammo,10);assert.equal(s.magazineSize,30);assert.equal(s.reloading,true);
  tick(s,60);assert.equal(s.ammo,30);assert.equal(s.reloadsCompleted,1);
});

test('critical tail rounds combine with scatter, velocity and armor piercing on actual hits',()=>{
  const s=arena();const e=target(s,80);s.upgrades={critical:1,finisher:2,multi:1,velocity:2,pierce:1};
  s.random=()=>.1;s.ammo=3;s.update(.001);
  assert.equal(s.bullets.length,2);assert.equal(s.ammo,2);
  for(const b of s.bullets){near(Math.hypot(b.vx,b.vy),1190);near(b.damage,24*2*1.7);assert.equal(b.critical,true);assert.equal(b.pierce,1);}
  tick(s,6);near(e.hp,10000-2*24*2*1.7);
  const hits=s.drainCombatEvents().filter(e=>e.type==='impact'&&e.critical);assert.equal(hits.length,2);
  s.bullets=[];s.ammo=4;s.fireTimer=0;s.update(.001);near(s.bullets[0].damage,48);
});

test('frost slows actual pursuit, refreshes instead of stacking, and expires',()=>{
  const cold=arena(201),normal=arena(201);const a=target(cold,110),b=target(normal,110);
  cold.upgrades.frost=2;cold.update(.001);cold.fireTimer=999;normal.fireTimer=999;
  tick(cold,8);assert.equal(a.slowTime>0,true);near(a.slowFactor,.7);
  a.x=b.x=160;a.y=b.y=0;a.pushX=b.pushX=0;a.pushY=b.pushY=0;a.speed=b.speed=60;
  tick(cold,10);tick(normal,10);near((160-a.x)/(160-b.x),.7);
  cold.fireTimer=0;cold.update(.001);cold.fireTimer=999;tick(cold,10);
  near(a.slowFactor,.7);assert.ok(a.slowTime>1.3);
  tick(cold,100);assert.equal(a.slowTime,0);assert.equal(a.slowFactor,1);
});

test('armor reduces contact damage and kill recovery heals once without exceeding max HP',()=>{
  const s=arena();s.invulnerable=0;s.fireTimer=999;s.upgrades.armor=2;
  s.spawn('brute',{x:0,y:0});s.update(.01);near(s.hp,100-18*.76);
  const hurt=s.drainCombatEvents().find(e=>e.type==='hurt');near(hurt.amount,18*.76);
  s.enemies=[];s.invulnerable=999;s.upgrades.leech=2;s.hp=70;
  const e=s.spawn('walker',{x:70,y:0});e.speed=0;
  for(let i=0;i<2;i++)s.bullets.push({id:900+i,x:0,y:0,vx:3000,vy:0,life:1,damage:500,pierce:0,hit:new Set()});
  s.update(.025);assert.equal(s.kills,1);near(s.hp,71.6);
  s.hp=99.5;const next=s.spawn('walker',{x:100,y:0});next.speed=0;
  s.bullets=[{id:999,x:0,y:0,vx:5000,vy:0,life:1,damage:500,pierce:0,hit:new Set()}];s.update(.025);near(s.hp,100);
});

test('new upgrades obey tier caps and remain reachable in distinct level-up offers',()=>{
  const s=arena();for(const u of UPGRADES)s.upgrades[u.id]=u.max;
  for(const id of ['magazine','critical','frost'])s.upgrades[id]=0;
  s.xp=s.xpNext;s.update(.01);assert.deepEqual(s.choices.map(u=>u.id).sort(),['critical','frost','magazine']);
  const fresh=new Simulation();fresh.start();assert.deepEqual(fresh.upgrades,{});assert.equal(fresh.ammo,18);assert.equal(fresh.reloading,false);
});
