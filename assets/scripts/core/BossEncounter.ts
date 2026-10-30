import type { Point } from './SceneMap.ts';
import type { MapId } from './Campaign.ts';

export type BossId='warden'|'furnace'|'hive';
export type BossTier='elite'|'final';
export type BossSkill='hunt'|'slam'|'rush'|'volley'|'eruption'|'summon'|'nova';
export interface BossSpec {id:BossId;name:string;accent:string;hp:number;speed:number;phaseNames:string[];patterns:BossSkill[][]}
export const BOSSES:Record<BossId,BossSpec>={
  warden:{id:'warden',name:'铁狱暴君',accent:'#e9b465',hp:2520,speed:72,phaseNames:['铁甲镇压','破阵追猎','暴君狂怒'],patterns:[['hunt','volley','slam'],['hunt','nova','rush','slam'],['hunt','nova','rush','volley','slam']]},
  furnace:{id:'furnace',name:'熔炉屠夫',accent:'#f68c43',hp:2880,speed:68,phaseNames:['余火','炉心过热','熔毁'],patterns:[['volley','hunt'],['hunt','volley','eruption','nova'],['hunt','eruption','nova','volley']]},
  hive:{id:'hive',name:'零号母巢',accent:'#b6d478',hp:3120,speed:70,phaseNames:['孢子播散','虫群孵化','母巢觉醒'],patterns:[['volley','hunt'],['hunt','summon','volley','nova'],['hunt','summon','eruption','nova','volley']]},
};
export const ELITE_NAMES:Record<BossId,string>={warden:'铁甲先锋',furnace:'炉火督军',hive:'孢群卫士'};
export const bossName=(b:BossState):string=>b.tier==='elite'?ELITE_NAMES[b.id]:BOSSES[b.id].name;
export const pursuitTopSpeed=(b:BossState):number=>b.tier==='elite'?300:350+b.phase*40;
export const bossForMap=(id:MapId):BossId=>id==='foundry'?'furnace':id==='laboratory'?'hive':'warden';
export function bossSkillName(id:BossId,skill:BossSkill):string {
  return {hunt:'疾速追猎',slam:'震地重锤',rush:'锁向冲锋',volley:id==='hive'?'孢子连射':id==='warden'?'碎甲连射':'炉火连射',eruption:id==='hive'?'毒池侵袭':'落火轰击',summon:'孵化虫群',nova:id==='warden'?'碎甲弹幕':id==='furnace'?'熔火环射':'孢子风暴'}[skill];
}
export interface Barrage {skill:'volley'|'nova';wave:number;total:number;timer:number;angle:number}
export interface BossState {id:BossId;tier:BossTier;arrival:number;pursuitRemaining:number;pursuitSpeed:number;huntCooldown:number;recovery:number;phase:number;transition:number;cooldown:number;sequence:number;skill:BossSkill|null;castRemaining:number;castTotal:number;angle:number;originX:number;originY:number;targetX:number;targetY:number;chargeRemaining:number;casts:number;barrage:Barrage|null}
/** Shared by damage and telegraphs; every ring keeps the same open escape sector. */
export function barrageAngles(skill:'volley'|'nova',phase:number,tier:BossTier,angle:number,wave=0):number[] {
  const count=tier==='elite'?(skill==='volley'?3:10):skill==='volley'?3+phase*2:10+phase*2;
  if(skill==='volley')return Array.from({length:count},(_,i)=>angle+(i-(count-1)/2)*.20+(wave%2===0?-.07:.07));
  return Array.from({length:count},(_,i)=>angle+i*Math.PI*2/count+(wave%2)*.10)
    .filter(a=>Math.abs(Math.atan2(Math.sin(a-angle-Math.PI/2),Math.cos(a-angle-Math.PI/2)))>.58);
}
export interface BossActor extends Point {id:number;hp:number;maxHp:number;radius:number;boss?:BossState}
export interface BossZone extends Point {id:number;owner:number;kind:'slam'|'fire'|'acid';radius:number;warning:number;warningTotal:number;life:number;damage:number;activated:boolean}
export interface BossHooks {
  move:(p:Point,dx:number,dy:number,radius:number)=>Point;
  wall:(a:Point,b:Point,radius?:number)=>unknown;
  seek:(e:BossActor,p:Point)=>Point;
  hit:(damage:number,angle?:number)=>void;
  projectile:(owner:number,p:Point,angle:number,speed:number,damage:number,ink:string,style:BossId)=>void;
  summon:(p:Point)=>void;
  cue:(type:'bossPhase'|'bossCast'|'bossSlam'|'bossFire'|'bossAcid'|'bossSummon',e:BossActor,amount?:number)=>void;
  phaseChanged:(e:BossActor)=>void;
  clearProjectiles:(owner:number)=>void;
}
export const initialBossState=(id:BossId,tier:BossTier='final'):BossState=>({id,tier,arrival:0,pursuitRemaining:0,pursuitSpeed:0,huntCooldown:0,recovery:0,phase:1,transition:0,cooldown:1.8,sequence:0,skill:null,castRemaining:0,castTotal:0,angle:0,originX:0,originY:0,targetX:0,targetY:0,chargeRemaining:0,casts:0,barrage:null});

/** Boss telegraphs and damage share fixed world geometry. No renderer or wall-clock timers. */
export class BossEncounter {
  zones:BossZone[]=[];private nextZone=1;private hooks:BossHooks;private difficulty:number;
  constructor(hooks:BossHooks,difficulty:number){this.hooks=hooks;this.difficulty=difficulty;}
  clearOwner(id:number):void {this.zones=this.zones.filter(z=>z.owner!==id);this.hooks.clearProjectiles(id);}
  private zone(e:BossActor,p:Point,kind:BossZone['kind'],radius:number,warning:number):void {
    if(this.zones.length>=24)return;
    const pos=this.hooks.move(p,0,0,18);
    this.zones.push({id:this.nextZone++,owner:e.id,...pos,kind,radius,warning,warningTotal:warning,life:kind==='slam'?.3:2.1,damage:(kind==='slam'?40:24)*this.difficulty*(e.boss?.tier==='elite'?.65:1),activated:false});
  }
  private start(e:BossActor,player:Point,forced?:BossSkill):void {
    const b=e.boss!,spec=BOSSES[b.id],pattern=spec.patterns[b.phase-1];
    b.skill=forced||pattern[b.sequence++%pattern.length];b.angle=Math.atan2(player.y-e.y,player.x-e.x);
    b.originX=e.x;b.originY=e.y;b.targetX=player.x;b.targetY=player.y;
    b.castTotal=b.skill==='hunt'?.85:b.skill==='summon'?1.2:b.skill==='eruption'?1.1:b.skill==='rush'?.95:.95;
    if(b.phase===3)b.castTotal-=.1;
    if(forced==='slam')b.castTotal=.65;
    if(b.tier==='elite')b.castTotal+=.15;
    if(b.skill==='hunt')b.huntCooldown=6-b.phase*.6;
    b.castRemaining=b.castTotal;
    if(b.skill==='slam')this.zone(e,e,'slam',b.tier==='elite'?100:b.phase===3?165:135,b.castTotal);
    if(b.skill==='eruption'){
      const count=b.tier==='elite'?2:b.phase===3?5:3;
      for(let i=0;i<count;i++){
        const a=b.angle+Math.PI/2+(i-1)*Math.PI*2/(count-1),r=i===0?0:128;
        this.zone(e,{x:player.x+Math.cos(a)*r,y:player.y+Math.sin(a)*r},b.id==='hive'?'acid':'fire',b.phase===3?65:58,b.castTotal);
      }
    }
  }
  private fireWave(e:BossActor):void {
    const b=e.boss!,burst=b.barrage!;
    for(const a of barrageAngles(burst.skill,b.phase,b.tier,burst.angle,burst.wave))
      this.hooks.projectile(e.id,e,a,(burst.skill==='nova'?205:235)+b.phase*20,
        (burst.skill==='nova'?24:22)*this.difficulty*(b.tier==='elite'?.65:1),BOSSES[b.id].accent,b.id);
    burst.wave++;burst.timer=burst.skill==='nova'?.42:.3;
    if(burst.wave>=burst.total){b.barrage=null;b.recovery=.45;}
  }
  update(e:BossActor,dt:number,player:Point):boolean {
    const b=e.boss!;if(e.hp<=0){b.barrage=null;this.clearOwner(e.id);return true;}
    if(b.arrival>0){b.arrival=Math.max(0,b.arrival-dt);return true;}
    b.huntCooldown=Math.max(0,b.huntCooldown-dt);
    const next=b.tier==='elite'?(e.hp/e.maxHp<=.5?2:1):e.hp/e.maxHp<=.33?3:e.hp/e.maxHp<=.66?2:1;
    if(next>b.phase){
      b.phase=next;b.transition=1.25;b.cooldown=1;b.sequence=0;b.skill=null;b.castRemaining=0;b.chargeRemaining=0;b.pursuitRemaining=0;b.pursuitSpeed=0;b.recovery=0;b.huntCooldown=0;b.barrage=null;
      this.clearOwner(e.id);this.hooks.cue('bossPhase',e,next);this.hooks.phaseChanged(e);return true;
    }
    if(b.transition>0){b.transition=Math.max(0,b.transition-dt);return true;}
    if(b.barrage){b.barrage.timer-=dt;if(b.barrage.timer<=0)this.fireWave(e);return true;}
    if(b.recovery>0){b.recovery=Math.max(0,b.recovery-dt);return true;}
    if(b.pursuitRemaining>0){
      const distance=Math.hypot(player.x-e.x,player.y-e.y);
      if(distance<(b.tier==='elite'?85:108)&&!this.hooks.wall(e,player)){
        b.pursuitRemaining=0;b.pursuitSpeed=0;this.start(e,player,'slam');return true;
      }
      b.pursuitSpeed=Math.min(pursuitTopSpeed(b),b.pursuitSpeed+520*dt);
      const goal=this.hooks.seek(e,player),dx=goal.x-e.x,dy=goal.y-e.y,d=Math.hypot(dx,dy);
      if(d>.01){b.angle=Math.atan2(dy,dx);const step=Math.min(d,b.pursuitSpeed*dt),p=this.hooks.move(e,dx/d*step,dy/d*step,e.radius);e.x=p.x;e.y=p.y;}
      b.pursuitRemaining=Math.max(0,b.pursuitRemaining-dt);
      if(b.pursuitRemaining===0){b.pursuitSpeed=0;b.recovery=.65;b.cooldown=.7;}
      return true;
    }
    if(b.chargeRemaining>0){
      const dx=Math.cos(b.angle)*460*dt,dy=Math.sin(b.angle)*460*dt,p=this.hooks.move(e,dx,dy,e.radius);
      if(Math.hypot(p.x-e.x-dx,p.y-e.y-dy)>.5)b.chargeRemaining=0;
      else b.chargeRemaining=Math.max(0,b.chargeRemaining-dt);
      e.x=p.x;e.y=p.y;return true;
    }
    if(b.castRemaining>0){
      b.castRemaining=Math.max(0,b.castRemaining-dt);if(b.castRemaining>0)return true;
      b.casts++;this.hooks.cue('bossCast',e);
      if(b.skill==='hunt'){b.pursuitRemaining=b.tier==='elite'?1.8:2.2+b.phase*.3;b.pursuitSpeed=160;}
      else if(b.skill==='rush')b.chargeRemaining=b.phase===3?.82:.68;
      else if(b.skill==='volley'||b.skill==='nova'){
        b.barrage={skill:b.skill,wave:0,total:b.tier==='elite'?2:b.skill==='volley'?b.phase+1:b.phase===3?3:2,timer:0,angle:b.angle};
        this.fireWave(e);
      }else if(b.skill==='summon'){
        for(let i=0;i<(b.tier==='elite'?2:b.phase===3?5:3);i++){
          const a=i*2.39996;this.hooks.summon({x:e.x+Math.cos(a)*95,y:e.y+Math.sin(a)*95});
        }
        this.hooks.cue('bossSummon',e);
      }
      b.cooldown=(b.phase===1?1.7:b.phase===2?1.15:.7)*(b.tier==='elite'?1.5:1);
      if(b.skill==='slam')b.recovery=b.tier==='elite'?.9:.7;return true;
    }
    b.cooldown=Math.max(0,b.cooldown-dt);
    const distance=Math.hypot(player.x-e.x,player.y-e.y);
    if(b.cooldown===0&&distance<720){
      // Close the kiting gap even if the next scripted melee skill is out of range.
      if(distance>250&&b.huntCooldown===0){this.start(e,player,'hunt');return true;}
      const pattern=BOSSES[b.id].patterns[b.phase-1],skill=pattern[b.sequence%pattern.length];
      if(skill==='slam'&&distance>190)return false;
      if(skill==='hunt'&&distance<115){b.sequence++;this.start(e,player,'slam');return true;}
      if((skill==='rush'||skill==='volley')&&this.hooks.wall(e,player,skill==='rush'?e.radius:6))return false;
      this.start(e,player);return true;
    }
    return b.id!=='warden'&&distance<230&&!this.hooks.wall(e,player,6);
  }
  updateZones(dt:number,player:Point,enemies:BossActor[]):void {
    const owners=new Map(enemies.filter(e=>e.hp>0).map(e=>[e.id,e]));
    for(const z of this.zones){
      const e=owners.get(z.owner);if(!e){z.life=0;continue;}
      if(z.warning>0){z.warning=Math.max(0,z.warning-dt);if(z.warning>0)continue;}
      if(!z.activated){z.activated=true;this.hooks.cue(z.kind==='slam'?'bossSlam':z.kind==='fire'?'bossFire':'bossAcid',{...e,x:z.x,y:z.y},z.radius);}
      if(z.life>0&&Math.hypot(player.x-z.x,player.y-z.y)<z.radius+16&&!this.hooks.wall(z,player))this.hooks.hit(z.damage);
      z.life=Math.max(0,z.life-dt);
    }
    this.zones=this.zones.filter(z=>z.life>0);
  }
}
