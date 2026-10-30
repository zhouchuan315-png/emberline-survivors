/** All reward sources retain fractions; only the cumulative wallet display is floored. */
export const COIN_REWARD_SCALE=.68;
export type MapId = 'yard' | 'foundry' | 'laboratory';
export type EnemyKind = 'walker' | 'runner' | 'brute' | 'boss' | 'spitter' | 'bomber' | 'charger' | 'summoner';
export interface ArenaConfig {
  id:MapId; name:string; difficulty:string; description:string; waves:number; waveSeconds:number;
  health:number; damage:number; speed:number; density:number; reward:number; texture:string; accent:string; eliteWaves:number[];
}
export const ARENAS:ArenaConfig[]=[
  {id:'yard',name:'隔离仓储区',difficulty:'普通',description:'第 4 / 8 波精英拦截\n最终首领会加速追击',waves:12,waveSeconds:25,eliteWaves:[4,8],health:1.1,damage:1,speed:1,density:1,reward:1,texture:'scene/ground',accent:'#98bd79'},
  {id:'foundry',name:'余烬熔铸厂',difficulty:'困难',description:'第 4 / 8 / 12 波精英拦截\n周期热区，金币奖励 ×1.5',waves:16,waveSeconds:25,eliteWaves:[4,8,12],health:1.35,damage:1.2,speed:1.08,density:1.3,reward:1.5,texture:'expansion/foundry',accent:'#edaa4a'},
  {id:'laboratory',name:'零号研究所',difficulty:'噩梦',description:'每 4 波精英拦截，共 4 场\n毒液通道，金币奖励 ×2',waves:20,waveSeconds:25,eliteWaves:[4,8,12,16],health:1.6,damage:1.4,speed:1.13,density:1.6,reward:2,texture:'expansion/laboratory',accent:'#89c9ce'},
];
export const arenaById=(id?:string):ArenaConfig=>ARENAS.find(a=>a.id===id)||ARENAS[0];
export const ENEMY_NAMES:Record<EnemyKind,string>={walker:'感染者',runner:'疾行者',brute:'重装感染者',boss:'感染源',spitter:'腐蚀喷吐者',bomber:'膨胀自爆者',charger:'裂爪冲锋者',summoner:'疫群召唤者'};
export const ENEMY_COINS:Record<EnemyKind,number>={walker:1,runner:2,brute:4,boss:60,spitter:3,bomber:3,charger:4,summoner:5};
export const ENEMY_UNLOCK:Partial<Record<number,EnemyKind>>={2:'bomber',3:'spitter',4:'charger',5:'summoner'};
export function waveRoster(wave:number):EnemyKind[]{
  const pool:EnemyKind[]=['walker','walker','walker'];
  if(wave>=2)pool.push('runner','bomber');if(wave>=3)pool.push('spitter');
  if(wave>=4)pool.push('charger','brute');if(wave>=5)pool.push('summoner');
  if(wave>=8)pool.push('runner','brute','spitter');if(wave>=12)pool.push('charger','summoner');
  return pool;
}
