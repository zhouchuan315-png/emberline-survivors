import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../assets/scripts/core/Simulation.ts';
import {isFree,MAP,moveCircle} from '../assets/scripts/core/SceneMap.ts';
import {ARENAS} from '../assets/scripts/core/Campaign.ts';

const run=(map='yard')=>{const s=new Simulation(928,map,{item:null});s.start();s.spawnTimer=999;s.fireTimer=999;s.invulnerable=999;s.xpNext=1e9;return s;};
const tick=(s,seconds)=>{for(let i=0;i<Math.ceil(seconds*60);i++)s.update(1/60);};

test('bosses scatter larger guaranteed loot bundles and pay scaled gold only once',()=>{
  for(const arena of ARENAS)for(const tier of ['elite','final']){
    const s=run(arena.id),e=s.spawn('boss',{x:250,y:0},{id:'warden',tier});
    s.hurtEnemy(e,1e9,0,0);
    const xp=s.drops.filter(d=>d.kind==='xp'),heal=s.drops.filter(d=>d.kind==='heal');
    assert.equal(xp.length,tier==='elite'?8:18);assert.equal(heal.length,tier==='elite'?2:4);
    assert.equal(xp.reduce((n,d)=>n+d.value,0),tier==='elite'?64:180);
    assert.equal(s.coins,Math.floor((tier==='elite'?50:200)*arena.reward*.68));
    assert.equal(new Set(s.drops.map(d=>d.id)).size,s.drops.length);assert(new Set(s.drops.map(d=>`${d.x},${d.y}`)).size>6);
    const before=JSON.stringify({coins:s.coins,drops:s.drops});s.hurtEnemy(e,1e9,0,0);
    assert.equal(JSON.stringify({coins:s.coins,drops:s.drops}),before);
  }
});

test('loot stays within player-reachable ground next to props and world boundaries',()=>{
  for(const arena of ARENAS){
    const s=run(arena.id),points=[{x:1180,y:0},{x:0,y:700},...s.map.obstacles.map(o=>({x:o.x,y:o.y}))];
    for(const point of points){
      const position=moveCircle(point,0,0,45,s.map.obstacles),e=s.spawn('boss',position);s.drops=[];
      s.hurtEnemy(e,1e9,0,0);assert.equal(s.drops.length,22);
      for(const d of s.drops){assert(isFree(d,MAP.playerRadius,s.map.obstacles));assert(Math.hypot(d.x-e.x,d.y-e.y)<114);}
    }
  }
});

test('drop reveal and pickup freeze on pause, then grant experience and healing',()=>{
  const s=run(),e=s.spawn('boss',{x:250,y:0},{id:'furnace',tier:'elite'});s.hurtEnemy(e,1e9,0,0);
  s.hp=10;tick(s,.1);s.pause();const before=JSON.stringify(s.drops);tick(s,1);assert.equal(JSON.stringify(s.drops),before);s.pause();
  const xp=s.drops.find(d=>d.kind==='xp');s.x=xp.x;s.y=xp.y;tick(s,.1);assert.equal(s.xp,0);
  tick(s,.3);assert(s.xp>0);assert(s.drops.length<10);
  while(s.drops.length){const d=s.drops[0];s.x=d.x;s.y=d.y;tick(s,.3);}
  assert.equal(s.xp,64);assert.equal(s.hp,54);assert.equal(s.coins,34);
});

test('final victory keeps guaranteed boss gold even when loot is not collected',()=>{
  const s=run();s.time=s.duration;s.update(.01);const e=s.enemies.find(e=>e.finalBoss);assert(e);
  const coins=s.coins;s.hurtEnemy(e,1e9,0,0);assert.equal(s.coins-coins,136);assert.equal(s.drops.length,22);
  s.update(.01);assert.equal(s.phase,'won');assert.equal(s.coins-coins,204);
});
