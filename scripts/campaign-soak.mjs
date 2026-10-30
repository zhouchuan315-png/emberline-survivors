/** Deterministic exploratory bots; never imported by the game. */
import fs from 'node:fs';
import {Simulation} from '../assets/scripts/core/Simulation.ts';
import {ARENAS} from '../assets/scripts/core/Campaign.ts';
import {isFree, moveCircle} from '../assets/scripts/core/SceneMap.ts';
const result=[];
for(const arena of ARENAS){
 for(const seed of [924,2026]){
  const s=new Simulation(seed,arena.id);s.start();let blocked=0,peak=0,updates=0,worst=0,sum=0;const priority=['multi','pierce','damage','pulse','rate','magnet','leech','regen','speed','armor','critical','vital','reload','magazine','frost','finisher','velocity'];
  while(s.time<s.duration+100&&s.phase!=='dead'&&s.phase!=='won'){
   if(s.phase==='upgrade'){s.selectUpgrade(s.choices.map((u,i)=>({i,score:priority.indexOf(u.id)})).sort((a,b)=>a.score-b.score)[0].i);continue;}
   let goal=s.drops.filter(d=>d.kind==='xp').sort((a,b)=>Math.hypot(a.x-s.x,a.y-s.y)-Math.hypot(b.x-s.x,b.y-s.y))[0]||{x:650*Math.cos(s.time*.025),y:430*Math.sin(s.time*.025)};
   let best=-Infinity,mx=0,my=0;
   for(let n=0;n<24;n++){
    const angle=n*Math.PI/12,x=Math.cos(angle),y=Math.sin(angle),p=moveCircle(s,x*52,y*52,16,s.map.obstacles);let score=-Math.hypot(p.x-goal.x,p.y-goal.y)*.09;
    score-=Math.max(0,47-Math.hypot(p.x-s.x,p.y-s.y))*10;
    for(const e of s.enemies){const d=Math.hypot(p.x-e.x,p.y-e.y);score-=Math.max(0,155+e.radius-d)**2*.022;if(e.kind==='bomber'&&e.warning>0&&d<120)score-=400;}
    for(const h of s.map.hazards)if((s.time+h.offset)%10>5&&Math.hypot(p.x-h.x,p.y-h.y)<h.radius+20)score-=300;
    if(score>best){best=score;mx=x;my=y;}
   }
   if(s.enemies.some(e=>Math.hypot(e.x-s.x,e.y-s.y)<e.radius+60))s.dash();
   const t=performance.now();s.update(.05,mx,my);const elapsed=performance.now()-t;sum+=elapsed;worst=Math.max(worst,elapsed);updates++;peak=Math.max(peak,s.enemies.length);
   if(!isFree(s,16,s.map.obstacles))blocked++;
   s.drainCombatEvents();
  }
  result.push({map:arena.id,seed,phase:s.phase,time:Math.round(s.time),wave:s.wave,level:s.level,kills:s.kills,coins:s.coins,peakEnemies:peak,collisionViolations:blocked,meanRuleMs:+(sum/updates).toFixed(3),worstRuleMs:+worst.toFixed(3),upgrades:s.upgrades});
 }
}
fs.writeFileSync('evidence/runtime-expansion-20260924/campaign-soak.json',JSON.stringify({purpose:'Exploratory evasion/loot bot with ordinary starting stats and no invincibility; not a human balance rating',runs:result},null,2));console.log(JSON.stringify(result));
