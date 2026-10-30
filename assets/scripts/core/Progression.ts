import { heroById, type HeroId } from './Characters.ts';
import { arenaById, type MapId } from './Campaign.ts';
import { HERO_TALENTS, sanitizeHeroTalents, type HeroTalentEntry } from './HeroTalents.ts';
export { HERO_TALENTS } from './HeroTalents.ts';
export const PROFILE_KEY='emberline-profile-v2';
export const LEGACY_PROFILE_KEY='emberline-profile-v1';
export interface ShopEntry {id:string;name:string;detail:string;icon:number;max:number;base:number;step:number;upgrade?:string}
// Retired prices are only retained to refund previously purchased ranks.
const LEGACY_TALENTS=[['vitality',60,40],['firepower',80,50],['mobility',70,45],['logistics',90,55],['recovery',100,60],['fortune',100,60]] as const;
export const START_ITEMS:ShopEntry[]=[
  {id:'medkit',name:'医疗储备',detail:'开局生命上限 +30 并补满\n每局消耗 1 件',icon:23,max:99,base:35,step:0},
  {id:'cryo',name:'冷凝弹药箱',detail:'开局获得 1 层冷凝弹头\n每局消耗 1 件',icon:24,max:99,base:45,step:0,upgrade:'frost'},
  {id:'battery',name:'脉冲电池',detail:'开局获得 1 层电磁脉冲\n每局消耗 1 件',icon:25,max:99,base:55,step:0,upgrade:'pulse'},
  {id:'supply',name:'扩容组件',detail:'开局获得 1 层扩容弹匣\n每局消耗 1 件',icon:21,max:99,base:40,step:0,upgrade:'magazine'},
];
export interface Loadout {item:string|null;hero?:HeroId;heroTalents?:Record<string,number>}
export interface Profile {version:2;coins:number;totalEarned:number;heroTalents:Record<HeroId,Record<string,number>>;legacyRefund:number;items:Record<string,number>;equipped:string|null;selectedMap:MapId;selectedHero:HeroId;runs:number;wins:number;activeRuns:Record<string,number>;lastRun:{id:string;earned:number;won:boolean}|null}
const integer=(n:unknown,max=1e9):number=>typeof n==='number'&&Number.isFinite(n)?Math.max(0,Math.min(max,Math.floor(n))):0;
const emptyHeroTalents=():Record<HeroId,Record<string,number>>=>({vanguard:{},scout:{},medic:{}});
export function freshProfile():Profile{return {version:2,coins:0,totalEarned:0,legacyRefund:0,heroTalents:emptyHeroTalents(),items:{},equipped:null,selectedMap:'yard',selectedHero:'vanguard',runs:0,wins:0,activeRuns:{},lastRun:null};}
export function parseProfile(raw:string|null):Profile {
  const p=freshProfile();if(!raw)return p;
  try{const d=JSON.parse(raw);if(!d||![1,2].includes(d.version))return p;
    for(const key of ['coins','totalEarned','runs','wins'] as const)p[key]=integer(d[key]);
    if(d.version===1){
      p.legacyRefund=LEGACY_TALENTS.reduce((sum,[id,base,step])=>{const n=integer(d.talents?.[id],5);return sum+n*base+step*n*(n-1)/2;},0);
      p.coins+=p.legacyRefund;
    }else{
      p.legacyRefund=integer(d.legacyRefund);
      for(const hero of Object.keys(HERO_TALENTS) as HeroId[])p.heroTalents[hero]=sanitizeHeroTalents(hero,d.heroTalents?.[hero]);
    }
    for(const t of START_ITEMS)p.items[t.id]=integer(d.items?.[t.id],t.max);
    p.equipped=START_ITEMS.some(i=>i.id===d.equipped)?d.equipped:null;p.selectedMap=arenaById(d.selectedMap).id;p.selectedHero=heroById(d.selectedHero).id;
    // Separate receipts let two browser tabs earn coins without replacing each other's run.
    if(d.activeRuns&&typeof d.activeRuns==='object')for(const id of Object.keys(d.activeRuns).slice(-128))if(/^[\w-]{1,100}$/.test(id)&&id!=='__proto__')p.activeRuns[id]=integer(d.activeRuns[id]);
    if(typeof d.activeRun?.id==='string'&&/^[\w-]{1,100}$/.test(d.activeRun.id)&&d.activeRun.id!=='__proto__')p.activeRuns[d.activeRun.id]=integer(d.activeRun.credited);
    if(typeof d.lastRun?.id==='string')p.lastRun={id:d.lastRun.id.slice(0,100),earned:integer(d.lastRun.earned),won:d.lastRun.won===true};
  }catch{/* Invalid storage starts a clean local profile, never crashes gameplay. */}return p;
}
export function purchase(p:Profile,id:string):{ok:boolean;message:string}{
  const entry=START_ITEMS.find(t=>t.id===id);if(!entry)return {ok:false,message:'商品不存在'};
  const owned=p.items[id]||0;if(owned>=entry.max)return {ok:false,message:'库存已满'};
  if(p.coins<entry.base)return {ok:false,message:`金币不足，还差 ${entry.base-p.coins}`};
  p.coins-=entry.base;p.items[id]=owned+1;
  return {ok:true,message:`已购买${entry.name}，可在下方装备`};
}
export function talentState(p:Profile,hero:HeroId,entry:HeroTalentEntry){
  const rank=p.heroTalents[hero][entry.id]||0,cost=heroTalentPrice(p,hero,entry);
  const prerequisite=entry.requires?HERO_TALENTS[hero].find(t=>t.id===entry.requires):undefined;
  const locked=!!prerequisite&&(p.heroTalents[hero][prerequisite.id]||0)<entry.requiredRank!;
  const maxed=rank>=entry.max;
  const reason=maxed?'已满阶':locked?`需${prerequisite!.name} ${entry.requiredRank} 阶`:p.coins<cost?`还差 ${cost-p.coins} 金币`:'';
  return {rank,cost,locked,maxed,canBuy:!reason,reason};
}
export function heroTalentPrice(p:Profile,hero:HeroId,t:HeroTalentEntry):number{return t.base+t.step*(p.heroTalents[hero]?.[t.id]||0);}
export function purchaseHeroTalent(p:Profile,hero:HeroId,id:string):{ok:boolean;message:string}{
  const entry=HERO_TALENTS[hero]?.find(t=>t.id===id);if(!entry)return {ok:false,message:'角色天赋不存在'};
  const state=talentState(p,hero,entry);if(!state.canBuy)return {ok:false,message:state.reason};
  p.coins-=state.cost;p.heroTalents[hero][id]=state.rank+1;return {ok:true,message:`${entry.name} · ${state.rank+1} 阶已解锁，下局生效`};
}
export function equipItem(p:Profile,id:string|null):boolean {
  if(id===null){p.equipped=null;return true;}if(!START_ITEMS.some(i=>i.id===id)||!p.items[id])return false;p.equipped=id;return true;
}
export function beginRun(p:Profile,id:string):Loadout {
  if(Object.prototype.hasOwnProperty.call(p.activeRuns,id)||p.lastRun?.id===id)throw new Error('Run already started');
  let item=p.equipped;if(item&&p.items[item]>0)p.items[item]--;else item=null;
  p.runs++;p.activeRuns[id]=0;return {heroTalents:sanitizeHeroTalents(p.selectedHero,p.heroTalents[p.selectedHero]),item,hero:p.selectedHero};
}
/** Cumulative checkpoints credit only their delta; repeated settlement cannot duplicate coins. */
export function creditRun(p:Profile,id:string,earned:number,finished=false,won=false):number {
  if(!Object.prototype.hasOwnProperty.call(p.activeRuns,id))return 0;const total=integer(earned),delta=Math.max(0,total-p.activeRuns[id]);
  p.coins+=delta;p.totalEarned+=delta;p.activeRuns[id]+=delta;
  if(finished){p.lastRun={id,earned:p.activeRuns[id],won};if(won)p.wins++;delete p.activeRuns[id];}return delta;
}

export interface ProfileStorage {getItem(key:string):string|null;setItem(key:string,value:string):void}
export type ProfileLock=<T>(task:()=>T)=>Promise<T>;
/** Read-modify-write under the browser's origin-wide lock, with a per-page queue. */
export class ProfileStore {
  private storage:ProfileStorage;private lock:ProfileLock;private queue:Promise<unknown>=Promise.resolve();
  constructor(storage:ProfileStorage,lock:ProfileLock=task=>Promise.resolve().then(task)){this.storage=storage;this.lock=lock;}
  // A separate v2 key keeps already-open legacy builds from overwriting new trees.
  // The first successful locked transaction commits migration and its refund once.
  read():Profile {return parseProfile(this.storage.getItem(PROFILE_KEY)??this.storage.getItem(LEGACY_PROFILE_KEY));}
  transact<T>(mutate:(profile:Profile)=>T):Promise<{profile:Profile;value:T}>{
    const operation=this.queue.then(()=>this.lock(()=>{
      const profile=this.read(),value=mutate(profile);
      this.storage.setItem(PROFILE_KEY,JSON.stringify(profile));return {profile,value};
    }));
    this.queue=operation.catch(()=>{});return operation;
  }
}
