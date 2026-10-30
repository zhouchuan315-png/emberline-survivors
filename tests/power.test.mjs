import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, UPGRADES } from '../assets/scripts/core/Simulation.ts';
import { wallHit } from '../assets/scripts/core/SceneMap.ts';

const tick=(s,seconds)=>{for(let i=0;i<seconds*60;i++)s.update(1/60);};
const arena=(hero='vanguard',seed=901)=>{const s=new Simulation(seed,'yard',{talents:{},item:null,hero});s.start();s.spawnTimer=999;s.invulnerable=999;return s;};
const choose=(s,id)=>{s.phase='upgrade';s.choices=[UPGRADES.find(u=>u.id===id)];assert(s.selectUpgrade(0));};
const target=(s,x=100,y=0)=>{const e=s.spawn('brute',{x,y});e.speed=0;e.hp=e.maxHp=10000;return e;};

test('hero awakening advances at levels 3/6/9, once per milestone, and resets on a fresh run',()=>{
  for(const hero of ['vanguard','scout','medic']){
    const s=arena(hero);s.level=2;choose(s,'armor');assert.equal(s.awakeningTier,0);
    for(const [level,tier] of [[3,1],[4,1],[6,2],[8,2],[9,3],[12,3]]){
      const before=s.awakeningTier;s.drainCombatEvents();s.level=level;choose(s,'damage');
      assert.equal(s.awakeningTier,tier);
      assert.equal(s.drainCombatEvents().filter(e=>e.type==='awakening').length,tier>before?1:0);
    }
    const fresh=arena(hero);assert.equal(fresh.awakeningTier,0);assert.equal(fresh.empoweredShots,0);assert.equal(fresh.frenzyTime,0);
  }
});

test('vanguard consumes one charged volley, not one charge per pellet, and only refills after reload',()=>{
  const s=arena();s.level=3;choose(s,'damage');s.upgrades.multi=3;target(s,180);
  assert.equal(s.empoweredShots,3);s.update(.001);
  assert.equal(s.empoweredShots,2);assert.equal(s.bullets.length,6);assert.equal(s.bullets.filter(b=>b.blast).length,1);assert.equal(s.ammo,17);
  s.reload();assert.equal(s.empoweredShots,2);s.enemies=[];
  tick(s,.5);assert.equal(s.empoweredShots,2);s.pause();tick(s,2);assert.equal(s.empoweredShots,2);
  s.pause();tick(s,1.1);assert.equal(s.empoweredShots,3);assert.equal(s.ammo,s.magazineSize);
});

test('scout dash has a radial piercing volley without spending or refilling ammunition',()=>{
  const s=arena('scout');s.level=6;choose(s,'damage');s.ammo=4;s.reload();const reload=s.reloadTimer;
  assert(s.dash());assert.equal(s.bullets.length,16);assert(s.bullets.every(b=>b.pierce===2&&b.empowered));
  assert.equal(s.ammo,4);assert.equal(s.reloadTimer,reload);assert(s.dashDuration<3.8);
  assert.equal(s.dash(),false);assert.equal(s.bullets.length,16);
  s.pause();const before=s.snapshot();tick(s,2);assert.deepEqual(s.snapshot(),before);
});

test('medic nova heals, hits nearby enemies, removes nearby hostile bullets, and freezes while paused',()=>{
  const s=arena('medic');s.level=3;choose(s,'damage');s.hp=50;s.heroTimer=0;s.fireTimer=999;
  const e=target(s,80);s.enemyProjectiles=[{id:801,x:80,y:0,vx:0,vy:0,life:10,damage:10},{id:802,x:400,y:0,vx:0,vy:0,life:10,damage:10}];
  s.update(.001);assert(s.hp>54);assert(e.hp<10000);assert.deepEqual(s.enemyProjectiles.map(b=>b.id),[802]);assert.equal(s.heroTimer,5);
  s.pause();const before=s.snapshot();tick(s,8);assert.deepEqual(s.snapshot(),before);
  assert.equal(s.drainCombatEvents().filter(e=>e.type==='heroPower').length,1);
});

test('explosion and chain procs are bounded per volley, damage a group, and do not repeat on pierce',()=>{
  const s=arena();s.upgrades={multi:3,blast:3,chain:2,pierce:3};s.shotEvents=1;
  const a=target(s,100),b=target(s,130,60),c=target(s,160,-60);s.update(.001);
  assert.equal(s.bullets.filter(b=>b.blast).length,1);assert.equal(s.bullets.filter(b=>b.chain).length,1);
  s.fireTimer=999;tick(s,.7);assert(b.hp<10000&&c.hp<10000&&a.hp<10000);
  const events=s.drainCombatEvents();assert.equal(events.filter(e=>e.type==='blast').length,1);
  const arcs=events.filter(e=>e.type==='chain');assert.equal(arcs.length,1);assert(arcs[0].points.length<=5);
  assert.equal(new Set(arcs[0].points.map(p=>`${p.x},${p.y}`)).size,arcs[0].points.length);
});

test('new area damage and lightning cannot pass through solid cover',()=>{
  const s=arena();s.fireTimer=999;
  // Find free points across the same collision geometry used by bullets and navigation.
  let pair;
  for(let x=-1000;x<1000&&!pair;x+=40)for(let y=-550;y<550&&!pair;y+=40){
    const a={x,y},b={x:x+140,y};
    if(s.free(a,30)&&s.free(b,30)&&wallHit(a,b,2,s.map.obstacles))pair=[a,b];
  }
  assert(pair);const [a,b]=pair,e=target(s,b.x,b.y);
  s.areaStrike(a,180,100);assert.equal(e.hp,10000);
  const source=target(s,a.x,a.y);s.arcStrike(source,3,100);assert.equal(e.hp,10000);
});

test('frenzy needs eight actual kills, expires without infinite kill extensions, and freezes on upgrade',()=>{
  const s=arena();s.upgrades.frenzy=1;s.fireTimer=999;
  for(let i=0;i<7;i++)s.hurtEnemy(target(s,250),20000,0,0);
  assert.equal(s.frenzyTime,0);s.hurtEnemy(target(s,250),20000,0,0);
  assert.equal(s.frenzyTime,6);assert.equal(s.damage,30);assert.equal(s.criticalChance,.2);assert(s.fireInterval<.3);
  tick(s,1);const remaining=s.frenzyTime;s.hurtEnemy(target(s,250),20000,0,0);assert.equal(s.frenzyTime,remaining);
  s.phase='upgrade';const before=s.snapshot();tick(s,10);assert.deepEqual(s.snapshot(),before);
  s.phase='playing';tick(s,6);assert.equal(s.frenzyTime,0);assert.equal(s.damage,24);assert.equal(s.frenzyKills,0);
});

test('third-rank evolutions change the volley and pulse behavior, with accurate upgrade previews',()=>{
  const s=arena();s.upgrades.multi=2;assert.equal(s.volleyCount,3);
  assert.equal(s.previewUpgrade(UPGRADES.find(u=>u.id==='multi')).name,'毁灭弹幕');
  choose(s,'multi');assert.equal(s.volleyCount,6);assert(s.banner.includes('毁灭弹幕'));
  s.upgrades.pulse=2;choose(s,'pulse');s.fireTimer=999;const e=target(s,190);
  tick(s,.25);assert(e.hp<10000);assert(s.pulseTimer>2&&s.pulseTimer<=2.4);
  assert.equal(s.snapshot().power.evolutions.length,2);
});

test('early offers include a build-changing power, keep owned build options, and never duplicate or exceed caps',()=>{
  for(let seed=1;seed<=60;seed++){
    const s=arena('vanguard',seed);s.upgrades.magnet=1;s.xp=s.xpNext;s.update(.001);
    assert(s.choices.some(u=>['multi','pulse','blast','chain'].includes(u.id)));
    assert(s.choices.some(u=>u.id==='magnet'));
    assert.equal(new Set(s.choices.map(u=>u.id)).size,3);
    assert(s.choices.every(u=>(s.upgrades[u.id]||0)<u.max));
  }
});
