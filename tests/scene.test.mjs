import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP, OBSTACLES, CHUNKS, SPAWN_GATES, Navigation, moveCircle, wallHit, isFree } from '../assets/scripts/core/SceneMap.ts';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
const box={id:'fixture',kind:'crates',x:0,y:0,width:100,height:100,lift:0,hull:[{x:-50,y:-50},{x:50,y:-50},{x:50,y:50},{x:-50,y:50}]};
const tick=(s,n,x=0,y=0)=>{for(let i=0;i<n;i++)s.update(1/60,x,y);};
test('swept circle blocks a dash, slides against walls and resolves initial overlap',()=>{
 const hit=moveCircle({x:-100,y:0},300,0,16,[box]);assert.ok(hit.x<=-65.99);assert.ok(isFree(hit,16,[box]));
 const slide=moveCircle({x:-70,y:-25},50,60,16,[box]);assert.ok(slide.y>25);assert.ok(isFree(slide,16,[box]));
 const inside=moveCircle({x:0,y:0},0,0,16,[box]);assert.ok(isFree(inside,16,[box]));
 for(let i=0;i<80;i++){const p=moveCircle({x:-100,y:0},20+i*7,i-40,16,[box]);assert.ok(isFree(p,16,[box]));}
});
test('bullet sweep chooses the first wall and detects both travel directions',()=>{
 assert.equal(wallHit({x:-100,y:0},{x:100,y:0},0,[box]).t,.25);
 assert.equal(wallHit({x:100,y:0},{x:-100,y:0},0,[box]).t,.25);
 assert.equal(wallHit({x:-100,y:80},{x:100,y:80},3,[box]),null);
 assert.equal(wallHit({x:0,y:0},{x:100,y:0},0,[box]).t,0);
});
test('stitched modules, player spawn and gates are valid for the largest enemy',()=>{
 assert.equal(CHUNKS.length,12);assert.equal(OBSTACLES.length,24);assert.ok(isFree({x:0,y:0},48));
 for(const p of SPAWN_GATES)assert.ok(isFree(p,48));
 for(const o of OBSTACLES){let area=0;o.hull.forEach((p,i)=>{const q=o.hull[(i+1)%o.hull.length];area+=p.x*q.y-p.y*q.x;});assert.ok(area>0,o.id);assert.ok(!isFree({x:o.hull.reduce((s,p)=>s+p.x,0)/4,y:o.hull.reduce((s,p)=>s+p.y,0)/4},16));}
});
test('radius-aware navigation routes around every prop from opposite sides',()=>{
 const nav=new Navigation();
 for(const radius of [18,45])for(const o of OBSTACLES){
  let p=moveCircle({x:o.x-o.width*.65-radius,y:o.y},0,0,radius);const target=moveCircle({x:o.x+o.width*.65+radius,y:o.y},0,0,radius);
  for(let i=0;i<900&&Math.hypot(p.x-target.x,p.y-target.y)>12;i++){
   const q=nav.direction(p,target,radius),d=Math.hypot(q.x-p.x,q.y-p.y)||1;
   p=moveCircle(p,(q.x-p.x)/d*3,(q.y-p.y)/d*3,radius);assert.ok(isFree(p,radius),o.id);
  }
  assert.ok(Math.hypot(p.x-target.x,p.y-target.y)<15,`${o.id}, r=${radius}, stuck at ${JSON.stringify(p)}`);
 }
});
test('player dash and enemy separation stay outside solid footprints',()=>{
 const s=new Simulation(72);s.start();s.spawnTimer=999;s.fireTimer=999;s.invulnerable=999;
 const o=OBSTACLES[10];s.x=o.x;s.y=o.y-115;s.lastMoveX=0;s.lastMoveY=1;s.dash();
 for(let i=0;i<15;i++){s.update(1/60,0,1);assert.ok(isFree(s,MAP.playerRadius));}
 assert.ok(s.blockedMoves>0);
 for(let i=0;i<12;i++)s.spawn('brute',{x:o.x-140,y:o.y+i*.2});
 tick(s,120);for(const e of s.enemies)assert.ok(isFree(e,e.radius));
});
test('cover blocks penetrating bullets and targeting but preserves clear shots',()=>{
 const o=OBSTACLES[10],s=new Simulation(73);s.start();s.spawnTimer=999;s.fireTimer=999;
 s.x=o.x;s.y=o.y-160;const enemy=s.spawn('brute',{x:o.x,y:o.y+160});enemy.speed=0;
 const hp=enemy.hp;s.bullets.push({id:999,x:s.x,y:s.y,vx:0,vy:10000,life:1,damage:999,pierce:6,hit:new Set()});
 s.update(.05);assert.equal(enemy.hp,hp);assert.equal(s.bullets.length,0);assert.equal(s.wallsHit,1);
 s.fireTimer=0;s.update(.01);assert.equal(s.shotEvents,0);
 s.spawn('walker',{x:s.x+70,y:s.y});s.update(.01);assert.equal(s.shotEvents,1);
});
