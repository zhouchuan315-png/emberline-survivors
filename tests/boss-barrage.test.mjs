import test from 'node:test';
import assert from 'node:assert/strict';
import {BossEncounter,BOSSES,initialBossState} from '../assets/scripts/core/BossEncounter.ts';
import {Simulation} from '../assets/scripts/core/Simulation.ts';

function fixture(id,phase=1,tier='final',skill='volley'){
  let time=0;const shots=[];
  const actor={id:1,x:0,y:0,hp:phase===3?30:phase===2?60:100,maxHp:100,radius:45,boss:initialBossState(id,tier)};
  Object.assign(actor.boss,{phase,cooldown:0,huntCooldown:999,sequence:BOSSES[id].patterns[phase-1].indexOf(skill)});
  const hooks={move:(p,dx,dy)=>({x:p.x+dx,y:p.y+dy}),wall:()=>null,seek:(e,p)=>p,hit:()=>{},summon:()=>{},cue:()=>{},phaseChanged:()=>{},clearProjectiles:()=>{shots.length=0},
    projectile:(owner,p,angle,speed,damage,ink,style)=>shots.push({time,angle,speed,damage,style,x:p.x,y:p.y})};
  const boss=new BossEncounter(hooks,1),player={x:200,y:0};
  const step=(seconds)=>{for(let i=0;i<Math.round(seconds*100);i++){time+=.01;boss.update(actor,.01,player);}};
  return {actor,boss,player,shots,step};
}

test('boss volleys wind up, lock aim, and release 2/3/4 timed waves with recovery',()=>{
  for(const id of ['warden','furnace','hive'])for(const phase of [1,2,3]){
    // Warden phase 2 leads with rings; use the normal cast state to exercise its shared volley.
    const f=fixture(id,phase);Object.assign(f.actor.boss,{skill:'volley',castRemaining:.95,castTotal:.95,angle:0,cooldown:999});
    f.step(.7);assert.equal(f.shots.length,0);f.player.y=100;f.player.x=-100;
    f.step(.25);assert.equal(f.shots.length,3+phase*2);
    f.step((phase)*.31);
    assert.equal(f.shots.length,(3+phase*2)*(phase+1));
    const times=[...new Set(f.shots.map(b=>b.time))];assert.equal(times.length,phase+1);
    for(let i=1;i<times.length;i++)assert(times[i]-times[i-1]>=.29);
    assert(f.shots.every(b=>Math.abs(b.angle)<1&&b.style===id));
    assert(f.shots.every(b=>b.speed===f.shots[0].speed),'later waves must not overtake earlier ones');
    assert.equal(f.actor.boss.barrage,null);assert(f.actor.boss.recovery>0);
  }
});

test('every ring wave leaves a common escape corridor through the complete phase-three sequence',()=>{
  for(const id of ['warden','furnace','hive']){
    const f=fixture(id,3,'final','nova');f.step(.01);assert.equal(f.actor.boss.skill,'nova');
    f.step(.7);assert.equal(f.shots.length,0);f.step(.15);const first=f.shots.length;assert(first>=10);
    f.step(.85);assert(f.shots.length>first*2);assert.equal(new Set(f.shots.map(b=>b.time)).size,3);
    assert(f.shots.every(b=>Math.abs(Math.atan2(Math.sin(b.angle-Math.PI/2),Math.cos(b.angle-Math.PI/2)))>.58));
    assert(f.shots.some(b=>Math.abs(b.angle)<.01),'standing in the original aim direction is not the escape route');
    assert.equal(f.actor.boss.barrage,null);assert(f.actor.boss.recovery>0);
  }
});

test('phase transition and death cancel pending waves and remove owned projectiles',()=>{
  for(const death of [false,true]){
    const f=fixture('furnace');f.step(1);assert(f.shots.length>0&&f.actor.boss.barrage);
    f.actor.hp=death?0:60;f.step(.01);assert.equal(f.actor.boss.barrage,null);assert.equal(f.shots.length,0);
    f.step(.8);assert.equal(f.shots.length,0);
  }
});

test('mini bosses have fewer shots and lower damage than final bosses',()=>{
  const elite=fixture('furnace',1,'elite'),final=fixture('furnace');elite.step(1.5);final.step(1.5);
  assert.equal(elite.shots.length,6);assert.equal(final.shots.length,10);
  assert(elite.shots[0].damage<final.shots[0].damage);
});

test('simulation pauses the pending barrage and enforces the projectile cap',()=>{
  const s=new Simulation(928);s.start();s.spawnTimer=999;s.fireTimer=999;s.invulnerable=999;
  const e=s.spawn('boss',{x:200,y:0},{id:'furnace',tier:'final'});
  Object.assign(e.boss,{skill:'volley',angle:Math.PI,castRemaining:.01,castTotal:.95});s.update(.02);
  assert(s.enemyProjectiles.length>0&&e.boss.barrage);assert(s.enemyProjectiles.every(p=>p.style==='furnace'&&p.owner===e.id));
  s.pause();const before=JSON.stringify({b:e.boss,p:s.enemyProjectiles,time:s.time});
  for(let i=0;i<120;i++)s.update(1/60);
  assert.equal(JSON.stringify({b:e.boss,p:s.enemyProjectiles,time:s.time}),before);s.pause();
  const sample=s.enemyProjectiles[0];s.enemyProjectiles=Array.from({length:139},(_,id)=>({...sample,id:1000+id}));
  e.boss.barrage.timer=0;s.bosses.update(e,.01,s);assert.equal(s.enemyProjectiles.length,140);
  s.hurtEnemy(e,e.maxHp*.4,0,0);s.update(.01);assert.equal(e.boss.barrage,null);assert.equal(s.enemyProjectiles.length,0);
});
