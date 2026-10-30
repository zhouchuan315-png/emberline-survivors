import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,UPGRADES,SYNERGIES} from '../assets/scripts/core/Simulation.ts';

const arena=()=>{const s=new Simulation(704);s.start();s.spawnTimer=1e6;s.fireTimer=1e6;s.xpNext=1e9;s.invulnerable=999;return s;};
const tick=(s,t)=>{for(let i=0;i<Math.ceil(t*60);i++)s.update(1/60);};
const target=(s,x=100,y=0,hp=1e5)=>{const e=s.spawn('brute',{x,y});e.hp=e.maxHp=hp;e.speed=0;return e;};
const select=(s,id)=>{s.phase='upgrade';s.choices=[UPGRADES.find(u=>u.id===id)];assert(s.selectUpgrade(0));};
const bullet=(s,e,extra={})=>s.bullets.push({id:900+s.shotEvents++,x:e.x,y:e.y,vx:0,vy:0,life:1,damage:1,pierce:0,hit:new Set(),...extra});

test('reload burst requires half a magazine and its synergy removes only nearby visible enemy bullets',()=>{
  const s=arena();s.upgrades={reloadBurst:2,reload:2};const e=target(s,100);
  s.ammo=17;s.reload();tick(s,1.1);assert.equal(e.hp,e.maxHp);
  s.ammo=9;s.reload();s.enemyProjectiles=[{id:700,x:80,y:0,vx:0,vy:0,life:8,damage:1},{id:701,x:250,y:0,vx:0,vy:0,life:8,damage:1}];
  tick(s,1.1);assert(Math.abs(e.maxHp-e.hp-s.damage*2.7)<1e-6);assert.deepEqual(s.enemyProjectiles.map(b=>b.id),[701]);
  assert.equal(s.drainCombatEvents().filter(e=>e.type==='blast').length,1);
});

test('dash mines arm late, explode once, scale with their synergy and expire with bounded storage',()=>{
  for(const combo of [false,true]){
    const s=arena();s.upgrades={mines:2,...combo?{blast:2}:{}};const e=target(s,60,0);s.dash();assert.equal(s.mines.length,2);
    tick(s,.4);assert.equal(e.hp,e.maxHp);tick(s,.15);assert.equal(s.mines.length,0);
    assert(Math.abs((e.maxHp-e.hp)-s.damage*2.2*(combo?1.4:1)*2)<1e-6);
    const hp=e.hp;tick(s,.5);assert.equal(e.hp,hp);
  }
  const s=arena();s.upgrades.mines=3;
  for(let i=0;i<8;i++){s.dashCooldown=0;s.dash();}assert.equal(s.mines.length,9);tick(s,6.1);assert.equal(s.mines.length,0);
});

test('shatter works alone and winter spreads slow without recursively exploding area kills',()=>{
  const s=arena();s.upgrades={shatter:2,frost:2};const a=target(s,100,0,1),b=target(s,165,0,1),c=target(s,180,50);
  bullet(s,a,{slow:.3});s.update(.001);
  assert(a.hp<=0&&b.hp<=0&&c.hp<c.maxHp);assert.equal(c.slowFactor,.45);assert.equal(c.slowTime,2.5);
  assert.equal(s.drainCombatEvents().filter(e=>e.type==='shatter').length,1);
  const alone=arena();alone.upgrades.shatter=1;target(alone);alone.fireTimer=0;alone.update(.001);assert.equal(alone.bullets[0].slow,.2);
});

test('ricochet redirects to new targets, has bounded hops and never inherits explosion/chain/marks',()=>{
  for(const combo of [false,true]){
    const s=arena();s.upgrades={ricochet:2,...combo?{chain:2}:{}};const a=target(s,100),b=target(s,180,60),c=target(s,200,-40);
    bullet(s,a,{damage:100,ricochets:2,primary:true});s.update(.001);
    const bounce=s.bullets[0];assert.equal(bounce.damage,combo?90:72);assert.equal(bounce.primary,undefined);assert.equal(bounce.chain,undefined);assert.equal(bounce.blast,undefined);
    tick(s,.8);assert.equal(a.maxHp-a.hp,100);assert(b.hp<b.maxHp&&c.hp<c.maxHp);
    assert.equal(s.drainCombatEvents().filter(e=>e.type==='ricochet').length,2);
  }
});

test('shield absorbs first, overflow hurts, break retaliation fires once and recharges after a quiet window',()=>{
  const s=arena();s.upgrades={pulse:2};select(s,'shield');select(s,'shield');assert.equal(s.shield,40);assert(s.hasSynergy('bastion'));
  s.invulnerable=0;s.damagePlayer(10);assert.equal(s.hp,100);assert.equal(s.shield,30);assert.equal(s.shieldDelay,4);
  const e=target(s);s.invulnerable=0;s.damagePlayer(45);assert.equal(s.hp,85);assert.equal(s.shield,0);assert(Math.abs(e.maxHp-e.hp-52.8)<1e-6);
  const before=e.hp;s.damagePlayer(20);assert.equal(e.hp,before);
  s.enemies=[];s.pulseTimer=1e6;tick(s,3.8);assert.equal(s.shield,0);tick(s,2.3);assert.equal(s.shield,40);
});

test('hunter marks use only the main bullet, expire, and deal a larger bounded burst to bosses',()=>{
  for(const boss of [false,true]){
    const s=arena();s.upgrades.hunter=2;const e=boss?s.spawn('boss',{x:130,y:0}):target(s,130);
    e.hp=e.maxHp=1e5;e.speed=0;if(e.boss)e.boss.arrival=999;
    bullet(s,e);s.update(.001);assert.equal(e.markHits,0);
    for(let i=0;i<3;i++){bullet(s,e,{primary:true});s.update(.001);}
    assert(Math.abs(e.maxHp-e.hp-4-s.damage*2*(boss?1.5:1))<1e-6);assert.equal(e.markHits,0);
    bullet(s,e,{primary:true});s.update(.001);assert.equal(e.markHits,1);tick(s,2.1);assert.equal(e.markHits,0);
    assert.equal(s.drainCombatEvents().filter(e=>e.type==='markBurst').length,1);
  }
});

test('all new area attacks and ricochets respect the same solid cover',()=>{
  const s=arena();let pair;
  for(let x=-1000;x<1000&&!pair;x+=40)for(let y=-550;y<550&&!pair;y+=40){const a={x,y},b={x:x+140,y};if(s.free(a,30)&&s.free(b,30)&&s.wall(a,b,3))pair=[a,b];}
  assert(pair);const [a,b]=pair;s.x=a.x;s.y=a.y;s.upgrades={reloadBurst:3,reload:3,mines:3,blast:2,shatter:3,frost:2,ricochet:3,chain:2};
  const hidden=target(s,b.x,b.y),source=target(s,a.x,a.y,1);
  bullet(s,source,{slow:.3,ricochets:3});s.update(.001);assert.equal(hidden.hp,hidden.maxHp);assert.equal(s.bullets.length,0);
  s.ammo=0;s.reload();tick(s,.9);assert.equal(hidden.hp,hidden.maxHp);
  target(s,a.x,a.y);s.mines=[{id:800,...a,rank:3,age:.5,life:1}];s.update(.001);assert.equal(s.mines.length,0);assert.equal(hidden.hp,hidden.maxHp);
});

test('choices guide owned builds; two rerolls preserve level, XP and ranks, exclude previous offers, and reset per run',()=>{
  for(let seed=1;seed<=40;seed++){
    const s=new Simulation(seed);s.start();s.upgrades={mines:1};s.level=4;s.xp=s.xpNext;s.update(.001);
    assert(s.choices.some(u=>u.id==='mines'));assert(s.choices.some(u=>u.id==='blast'));
    const progression=JSON.stringify([s.level,s.xp,s.upgrades]);
    for(let i=0;i<2;i++){
      const old=s.choices.map(u=>u.id);assert(s.rerollUpgrades());assert(s.choices.every(u=>!old.includes(u.id)));assert.equal(new Set(s.choices.map(u=>u.id)).size,3);
      assert.equal(JSON.stringify([s.level,s.xp,s.upgrades]),progression);
    }
    assert.equal(s.rerollUpgrades(),false);assert.equal(s.rerolls,0);
  }
  const fresh=arena();assert.equal(fresh.rerolls,2);assert.equal(fresh.rerollUpgrades(),false);
});

test('near exhaustion rerolls never waste a charge on the same set and maxed choices are refused',()=>{
  const s=arena();s.upgrades=Object.fromEntries(UPGRADES.map(u=>[u.id,u.max]));s.upgrades.hunter=2;s.upgrades.shield=2;s.upgrades.mines=2;s.upgrades.frost=2;
  s.phase='upgrade';s.choices=UPGRADES.filter(u=>['hunter','shield','mines'].includes(u.id));assert(s.rerollUpgrades());assert(s.choices.some(u=>u.id==='frost'));
  s.upgrades.frost=3;s.choices=UPGRADES.filter(u=>['hunter','shield','mines'].includes(u.id));const n=s.rerolls;assert.equal(s.rerollUpgrades(),false);assert.equal(s.rerolls,n);
  s.choices=[UPGRADES.find(u=>u.id==='frost')];assert.equal(s.selectUpgrade(0),false);assert.equal(s.upgrades.frost,3);
});

test('synergy requirements and UI preview agree; paused/upgrade states freeze new mechanics and new runs clear them',()=>{
  const s=arena();s.upgrades={reloadBurst:2,reload:1};assert.match(s.synergyHint('reload'),/本次激活/);select(s,'reload');assert.match(s.banner,/装填清场/);
  for(const recipe of SYNERGIES)for(const [id,rank] of recipe.needs)s.upgrades[id]=rank;
  assert(s.buildRecipes.every(r=>r.active));assert.equal(s.snapshot().build.synergies.length,5);
  assert.match(s.previewUpgrade(UPGRADES.find(u=>u.id==='shield')).detail,/4 秒未受击/);
  assert.match(s.previewUpgrade(UPGRADES.find(u=>u.id==='ricochet')).detail,/90%/);
  assert.match(s.previewUpgrade(UPGRADES.find(u=>u.id==='mines')).detail,/364%/);
  s.shield=20;s.shieldDelay=2;s.dash();const enemy=target(s);enemy.markHits=2;enemy.markTime=1;
  for(const phase of ['paused','upgrade']){s.phase=phase;const before=JSON.stringify([s.snapshot(),s.enemies]);tick(s,5);assert.equal(JSON.stringify([s.snapshot(),s.enemies]),before);}
  const fresh=arena();assert.equal(fresh.shield,0);assert.deepEqual(fresh.mines,[]);assert.deepEqual(fresh.snapshot().build.synergies,[]);
});
