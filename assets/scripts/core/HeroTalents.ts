import { type HeroId } from './Characters.ts';

export interface HeroTalentEntry {
  id:string;name:string;detail:string;icon:number;branch:0|1;tier:0|1|2;
  max:number;base:number;step:number;requires?:string;requiredRank?:number;upgrade?:string;
}
export const TALENT_BRANCHES:Record<HeroId,readonly string[]>={vanguard:['炽火压制','前线壁垒'],scout:['猎隼狙击','游击雷区'],medic:['生命支援','净化屏障']};
export const HERO_TALENTS:Record<HeroId,HeroTalentEntry[]>={
  vanguard:[
    {id:'arsenal',name:'重火专精',detail:'每阶子弹伤害 +5%',icon:19,branch:0,tier:0,max:3,base:80,step:60},
    {id:'overdrive',name:'过载协议',detail:'每阶射击间隔缩短 3%',icon:1,branch:0,tier:1,max:3,base:180,step:90,requires:'arsenal',requiredRank:2},
    {id:'blastKit',name:'爆破先锋',detail:'开局获得 1 阶爆破弹',icon:16,branch:0,tier:2,max:1,base:420,step:0,requires:'overdrive',requiredRank:2,upgrade:'blast'},
    {id:'bulwark',name:'前线体能',detail:'每阶最大生命 +10',icon:12,branch:1,tier:0,max:3,base:80,step:60},
    {id:'reserve',name:'战术备弹',detail:'每阶弹匣容量 +2',icon:21,branch:1,tier:1,max:3,base:180,step:90,requires:'bulwark',requiredRank:2},
    {id:'breachKit',name:'破围装填',detail:'开局获得 1 阶换弹震爆',icon:10,branch:1,tier:2,max:1,base:420,step:0,requires:'reserve',requiredRank:2,upgrade:'reloadBurst'},
  ],
  scout:[
    {id:'deadeye',name:'猎隼瞄具',detail:'每阶暴击率 +3 个百分点',icon:13,branch:0,tier:0,max:3,base:80,step:60},
    {id:'quickdraw',name:'快拔枪套',detail:'每阶换弹耗时缩短 5%',icon:10,branch:0,tier:1,max:3,base:180,step:90,requires:'deadeye',requiredRank:2},
    {id:'pierceKit',name:'穿云首发',detail:'开局获得 1 阶穿甲弹头',icon:3,branch:0,tier:2,max:1,base:420,step:0,requires:'quickdraw',requiredRank:2,upgrade:'pierce'},
    {id:'featherstep',name:'轻羽步',detail:'每阶移动速度 +4%',icon:20,branch:1,tier:0,max:3,base:80,step:60},
    {id:'evasion',name:'连续闪避',detail:'每阶冲刺冷却缩短 0.2 秒',icon:4,branch:1,tier:1,max:3,base:180,step:90,requires:'featherstep',requiredRank:2},
    {id:'mineKit',name:'游击布雷',detail:'开局获得 1 阶闪避布雷',icon:16,branch:1,tier:2,max:1,base:420,step:0,requires:'evasion',requiredRank:2,upgrade:'mines'},
  ],
  medic:[
    {id:'triage',name:'快速分诊',detail:'每阶最大生命 +10',icon:23,branch:0,tier:0,max:3,base:80,step:60},
    {id:'regenerator',name:'再生协议',detail:'每阶每秒恢复 +0.2 生命',icon:8,branch:0,tier:1,max:3,base:180,step:90,requires:'triage',requiredRank:2},
    {id:'pulseKit',name:'净化准备',detail:'开局获得 1 阶电磁脉冲',icon:7,branch:0,tier:2,max:1,base:420,step:0,requires:'regenerator',requiredRank:2,upgrade:'pulse'},
    {id:'secondWind',name:'急救防护',detail:'每阶受到伤害降低 3%',icon:12,branch:1,tier:0,max:3,base:80,step:60},
    {id:'fieldAmmo',name:'支援弹仓',detail:'每阶弹匣容量 +2',icon:21,branch:1,tier:1,max:3,base:180,step:90,requires:'secondWind',requiredRank:2},
    {id:'shieldKit',name:'救援屏障',detail:'开局获得 1 阶再充能护盾',icon:12,branch:1,tier:2,max:1,base:420,step:0,requires:'fieldAmmo',requiredRank:2,upgrade:'shield'},
  ],
};
/** Only this hero's known, bounded ranks with valid ancestors enter a run or save. */
export function sanitizeHeroTalents(hero:HeroId,raw:unknown):Record<string,number>{
  const result:Record<string,number>={};if(!raw||typeof raw!=='object')return result;
  for(const t of HERO_TALENTS[hero]){
    const n=(raw as Record<string,unknown>)[t.id];
    if(typeof n!=='number'||!Number.isFinite(n)||(t.requires&&(result[t.requires]||0)<t.requiredRank!))continue;
    const rank=Math.max(0,Math.min(t.max,Math.floor(n)));if(rank)result[t.id]=rank;
  }
  return result;
}
