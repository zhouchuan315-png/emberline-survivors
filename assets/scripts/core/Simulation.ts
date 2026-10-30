import { heroById, type HeroConfig } from './Characters.ts';
import { BossEncounter, bossName, bossForMap, BOSSES, initialBossState, type BossState, type BossId, type BossTier } from './BossEncounter.ts';
import { MAP, Navigation, moveCircle, wallHit, isFree, createLevelMap, hazardPhase, type Point, type LevelMap } from './SceneMap.ts';
import { arenaById, waveRoster, ENEMY_UNLOCK, ENEMY_NAMES, ENEMY_COINS, COIN_REWARD_SCALE, type ArenaConfig, type MapId, type EnemyKind } from './Campaign.ts';
import { START_ITEMS, type Loadout } from './Progression.ts';
import { HERO_TALENTS, sanitizeHeroTalents } from './HeroTalents.ts';
export type { EnemyKind } from './Campaign.ts';
export type Phase = 'menu' | 'playing' | 'upgrade' | 'paused' | 'dead' | 'won';
export interface Enemy {
  id: number; kind: EnemyKind; x: number; y: number; hp: number; maxHp: number;
  speed: number; radius: number; damage: number; flash: number; pushX: number; pushY: number;
  slowTime: number; slowFactor: number; markHits?:number; markTime?:number;
  abilityCooldown:number;warning:number;chargeTime:number;chargeX:number;chargeY:number;finalBoss:boolean;boss?:BossState;
}
export interface EnemyProjectile {id:number;x:number;y:number;vx:number;vy:number;life:number;damage:number;owner?:number;ink?:string;style?:BossId}
export interface Bullet { id: number; x: number; y: number; vx: number; vy: number; life: number; damage: number; pierce: number; hit: Set<number>; critical?: boolean; slow?: number; blast?:number; blastDamage?:number; chain?:number; empowered?:boolean; primary?:boolean; ricochets?:number }
export interface Mine extends Point {id:number;age:number;life:number;rank:number}
export interface Drop { id: number; x: number; y: number; value: number; kind: 'xp' | 'heal'; bossLoot?:boolean;age?:number }
export const BOSS_LOOT:Record<BossTier,{xpCount:number;xpValue:number;heals:number;coins:number;radius:number}>={
  elite:{xpCount:8,xpValue:8,heals:2,coins:50,radius:72},
  final:{xpCount:18,xpValue:10,heals:4,coins:200,radius:112},
};
export interface Effect { id: number; x: number; y: number; vx: number; vy: number; life: number; maxLife: number; kind: 'spark' | 'blood' | 'xp' | 'damage' | 'pulse'; text?: string }
export interface Upgrade { id: string; name: string; detail: string; tag: string; icon: string; max: number; art?:number;evolution?:{tier:number;name:string;detail:string} }
/** One-shot presentation events. They never consume RNG or change combat rules. */
export interface CombatEvent {
  type: 'fire' | 'impact' | 'death' | 'attack' | 'hurt' | 'dash' | 'upgrade' | 'pulse' | 'reload' | 'reloadComplete' | 'explosion' | 'heal' | 'frost' | 'summon' | 'bossArrival' | 'bossPhase' | 'bossCast' | 'bossSlam' | 'bossFire' | 'bossAcid' | 'bossSummon' | 'blast' | 'chain' | 'frenzy' | 'awakening' | 'heroPower' | 'shatter' | 'ricochet' | 'shieldHit' | 'markBurst';
  x: number; y: number; angle: number; actorId?: number; kind?: EnemyKind; amount?: number; critical?: boolean; bossId?: BossState['id']; bossTier?:BossTier;points?:Point[];ink?:string;detonated?:boolean;
}
export const UPGRADES: Upgrade[] = [
  { id: 'damage', name: '高压弹药', detail: '子弹伤害 +30%\n更快击穿尸潮', tag: '火力', icon: '↗', max: 6 },
  { id: 'rate', name: '极速扳机', detail: '射击间隔缩短 18%\n让火力持续倾泻', tag: '射速', icon: '»', max: 5 },
  { id: 'multi', name: '散射改装', detail: '每次额外发射 1 枚子弹\n齐射仍只消耗 1 发弹药', tag: '稀有 · 火力', icon: '⋔', max: 4, evolution:{tier:3,name:'毁灭弹幕',detail:'额外再增加 2 条弹道\n更密集的扇形齐射，只耗 1 发'} },
  { id: 'pierce', name: '穿甲弹头', detail: '子弹额外贯穿 1 个目标\n直面成群的感染者', tag: '稀有 · 穿透', icon: '➜', max: 3 },
  { id: 'speed', name: '轻量战靴', detail: '移动速度 +15%\n冲刺冷却缩短 0.35 秒', tag: '机动', icon: 'ϟ', max: 4 },
  { id: 'vital', name: '应急强化', detail: '最大生命 +25\n立即恢复 40 点生命', tag: '生存', icon: '+', max: 5 },
  { id: 'magnet', name: '回收磁场', detail: '拾取范围 +55%\n经验值获取 +15%', tag: '成长', icon: '◇', max: 3 },
  { id: 'pulse', name: '电磁脉冲', detail: '每 4 秒释放范围冲击\n重复选择增加伤害与半径', tag: '稀有 · 技能', icon: '◎', max: 5, evolution:{tier:3,name:'雷霆领域',detail:'间隔 4秒 → 2.4秒，半径 +40\n脉冲伤害随高压弹药成长'} },
  { id: 'regen', name: '再生血清', detail: '每秒恢复 1.2 点生命\n生命越长，机会越多', tag: '生存', icon: '♥', max: 3 },
  { id: 'magazine', name: '扩容弹匣', detail: '弹匣容量 +6\n未换弹时立即补充 6 发', tag: '弹药', icon: '▣', max: 5 },
  { id: 'reload', name: '快手换弹', detail: '换弹耗时缩短 22%\n更快回到火线', tag: '弹药', icon: '↻', max: 5 },
  { id: 'velocity', name: '高速弹头', detail: '子弹速度 +20%\n缩短远距离命中时间', tag: '火力', icon: '➤', max: 4 },
  { id: 'armor', name: '防爆护甲', detail: '受到伤害 -12%\n穿过尸潮更安全', tag: '生存', icon: '⬢', max: 4 },
  { id: 'critical', name: '弱点识别', detail: '暴击率 +12 个百分点\n暴击造成双倍子弹伤害', tag: '稀有 · 暴击', icon: '✦', max: 5 },
  { id: 'frost', name: '冷凝弹头', detail: '命中减速 +15%，持续 1.5 秒\n重复命中刷新持续时间', tag: '控制', icon: '❄', max: 3 },
  { id: 'leech', name: '生命回收', detail: '每次击杀恢复 0.8 点生命\n持续作战维持生命', tag: '生存', icon: '♥', max: 4 },
  { id: 'finisher', name: '尾弹过载', detail: '弹匣最后 3 发伤害 +35%\n可与散射、暴击叠加', tag: '稀有 · 弹药', icon: 'Ⅲ', max: 3 },
  { id:'blast',name:'爆破弹',detail:'每 4 次齐射追加范围爆炸\n再次强化扩大半径和伤害',tag:'稀有 · 爆破',icon:'◎',max:3,art:16,evolution:{tier:3,name:'集束爆破',detail:'每 2 次齐射触发一次爆炸\n135 范围，追加 115% 子弹伤害'} },
  { id:'chain',name:'连锁电弧',detail:'主弹命中跳跃至 3 个敌人\n电弧继承伤害、暴击与尾弹增伤',tag:'稀有 · 连锁',icon:'ϟ',max:3,art:7 },
  { id:'frenzy',name:'连杀狂热',detail:'击杀 8 敌进入 6 秒狂热\n射速 +54% · 伤害 +25%',tag:'稀有 · 爆发',icon:'✦',max:3,art:1 },
  { id:'reloadBurst',name:'换弹震爆',detail:'完成换弹释放近身震爆\n消耗至少半匣弹药才会触发',tag:'战术 · 装填',icon:'◎',max:3,art:16 },
  { id:'mines',name:'闪避布雷',detail:'冲刺起点留下感应雷\n引诱追兵踩雷，逐阶增加数量',tag:'战术 · 机动',icon:'✦',max:3,art:16 },
  { id:'shatter',name:'冰霜碎裂',detail:'子弹减速 20%\n击碎减速敌人，造成范围冰爆',tag:'控制 · 冰霜',icon:'❄',max:3,art:14 },
  { id:'ricochet',name:'寻敌跳弹',detail:'主弹命中后弹向附近新目标\n弹射不穿墙，伤害逐跳衰减',tag:'火力 · 跳弹',icon:'➜',max:3,art:3 },
  { id:'shield',name:'再充能护盾',detail:'获得可吸收伤害的护盾\n6 秒未受击后自动充能',tag:'生存 · 护盾',icon:'⬢',max:3,art:12 },
  { id:'hunter',name:'猎首标记',detail:'主弹连续命中同一敌人 3 次\n引爆标记，对 Boss 额外增伤',tag:'猎首 · 单体',icon:'✦',max:3,art:13 },
];
export const SYNERGIES = [
  {id:'breach',name:'装填清场',needs:[['reloadBurst',2],['reload',2]] as const,detail:'换弹震爆同时清除范围内敌弹'},
  {id:'minefield',name:'爆裂雷区',needs:[['mines',2],['blast',2]] as const,detail:'地雷范围 +35，伤害 +40%'},
  {id:'winter',name:'凛冬蔓延',needs:[['shatter',2],['frost',2]] as const,detail:'冰爆使周围敌人减速 55%，持续 2.5 秒'},
  {id:'conductor',name:'超导跳弹',needs:[['ricochet',2],['chain',2]] as const,detail:'跳弹每跳保留 90% 伤害（原 72%）'},
  {id:'bastion',name:'雷盾反击',needs:[['shield',2],['pulse',2]] as const,detail:'破盾释放反击脉冲，充能等待缩短为 4 秒'},
];
export const WORLD = { width: MAP.width, height: MAP.height, duration: 300 };
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const distance = (a: {x:number;y:number}, b: {x:number;y:number}) => Math.hypot(a.x-b.x, a.y-b.y);

/** Deterministic rules; no engine, DOM, timers, or rendering dependencies. */
export class Simulation {
  readonly hero:HeroConfig;readonly bosses:BossEncounter;readonly arena:ArenaConfig;readonly map:LevelMap;readonly heroTalents:Record<string,number>;
  earnedCoins=0;clearedWaves=0;enemyProjectiles:EnemyProjectile[]=[];
  phase: Phase = 'menu';
  time = 0; kills = 0; level = 1; xp = 0; xpNext = 12; wave = 1;
  hp = 100; maxHp = 100; x = 0; y = 0; aim = 0; facing = 1;
  ammo = 18; reloadTimer = 0; private reloadTotal = 0; reloadsCompleted = 0;
  invulnerable = 0; dashCooldown = 0; dashTime = 0; dashX = 1; dashY = 0;
  lastMoveX = 1; lastMoveY = 0; moving = false;
  enemies: Enemy[] = []; bullets: Bullet[] = []; drops: Drop[] = []; effects: Effect[] = [];
  choices: Upgrade[] = []; upgrades: Record<string, number> = {};
  awakeningTier=0;empoweredShots=0;heroTimer=0;frenzyTime=0;frenzyKills=0;
  rerolls=2;shield=0;shieldDelay=0;mines:Mine[]=[];
  private reloadSpent=0;
  shotEvents = 0; hitEvents = 0; killEvents = 0; pickupEvents = 0;
  trauma = 0; banner = ''; bannerTime = 0; bossSpawned = false; bossDefeated = false;
  eliteWavesSpawned:number[]=[];
  bossWarning:{id:BossId;tier:BossTier;name:string;remaining:number;total:number}|null=null;
  private combatEvents: CombatEvent[] = [];
  private navigation:Navigation;
  wallsHit=0; blockedMoves=0;
  drainCombatEvents(): CombatEvent[] { const events=this.combatEvents;this.combatEvents=[];return events; }
  private emit(event: CombatEvent): void { this.combatEvents.push(event);if(this.combatEvents.length>512)this.combatEvents.shift(); }
  private seed: number; private nextId = 1; private spawnTimer = 0; private fireTimer = 0; private pulseTimer = 2;
  constructor(seed = Date.now(),mapId:MapId='yard',loadout:Loadout={item:null}) {
    this.seed = seed >>> 0 || 1;this.arena=arenaById(mapId);this.map=createLevelMap(this.arena.id);this.navigation=new Navigation(this.map.obstacles);
    this.hero=heroById(loadout.hero);this.heroTalents=sanitizeHeroTalents(this.hero.id,loadout.heroTalents);
    this.bosses=new BossEncounter({move:(p,dx,dy,r)=>this.move(p,dx,dy,r),wall:(a,b,r)=>this.wall(a,b,r),seek:(e,p)=>this.navigation.direction(e,p,e.radius),hit:(n,a)=>this.damagePlayer(n,a),
      projectile:(owner,p,angle,speed,damage,ink,style)=>{if(this.enemyProjectiles.length<140)this.enemyProjectiles.push({id:this.nextId++,x:p.x,y:p.y,owner,ink,style,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:4,damage});},
      summon:p=>{if(this.enemies.length<130)this.spawn('runner',p);},
      cue:(type,e,amount)=>this.emit({type,x:e.x,y:e.y,angle:e.boss?.angle||0,actorId:e.id,kind:'boss',bossId:e.boss?.id,bossTier:e.boss?.tier,amount}),
      phaseChanged:e=>{this.banner=`${bossName(e.boss!)} · 第 ${e.boss!.phase} 阶段`;this.bannerTime=3;},
      clearProjectiles:owner=>{this.enemyProjectiles=this.enemyProjectiles.filter(b=>b.owner!==owner);}},this.arena.damage);
    this.maxHp=this.hero.hp+this.talent('bulwark')*10+this.talent('triage')*10+(loadout.item==='medkit'?30:0);this.hp=this.maxHp;
    const item=START_ITEMS.find(i=>i.id===loadout.item);if(item?.upgrade)this.upgrades[item.upgrade]=1;
    for(const t of HERO_TALENTS[this.hero.id])if(t.upgrade&&(this.heroTalents[t.id]||0)>0)this.upgrades[t.upgrade]=Math.max(this.upgrades[t.upgrade]||0,1);
  }
  get duration():number{return this.arena.waves*this.arena.waveSeconds;}
  get coins():number{return Math.floor(this.earnedCoins+1e-8);}
  private talent(id:string):number{return this.heroTalents[id]||0;}
  private reward(amount:number):void{this.earnedCoins+=amount*this.arena.reward*COIN_REWARD_SCALE;}
  private move(p:Point,dx:number,dy:number,r:number):Point{return moveCircle(p,dx,dy,r,this.map.obstacles);}
  private wall(a:Point,b:Point,r=0){return wallHit(a,b,r,this.map.obstacles);}
  private free(p:Point,r:number):boolean{return isFree(p,r,this.map.obstacles);}
  private damagePlayer(amount:number,angle=0):void {
    if(this.invulnerable>0||this.phase!=='playing')return;
    const incoming=amount*(1-(this.upgrades.armor||0)*.12-this.talent('secondWind')*.03),absorbed=Math.min(this.shield,incoming),damage=incoming-absorbed;
    this.shield-=absorbed;this.shieldDelay=this.hasSynergy('bastion')?4:6;
    if(absorbed>0){
      this.emit({type:'shieldHit',x:this.x,y:this.y,angle,amount:absorbed});
      if(this.shield===0&&this.hasSynergy('bastion')){
        this.areaStrike(this,170,this.damage*2.2);this.emit({type:'pulse',x:this.x,y:this.y,angle:0,amount:170});
      }
    }
    this.hp=Math.max(0,this.hp-damage);this.invulnerable=.8;this.trauma=.7;this.hitEvents++;
    if(damage>0){this.emit({type:'hurt',x:this.x,y:this.y,angle,amount:damage});this.effect(this.x,this.y+28,'damage',`−${Math.ceil(damage)}`);}
    if(this.hp<=0)this.phase='dead';
  }
  /** Visible wind-ups lock aim before a special attack; cover and dash remain useful. */
  private enemyAbility(e:Enemy,dt:number):boolean {
    const d=distance(e,this);e.abilityCooldown=Math.max(0,e.abilityCooldown-dt);
    if(e.chargeTime>0){e.chargeTime=Math.max(0,e.chargeTime-dt);const p=this.move(e,e.chargeX*420*dt,e.chargeY*420*dt,e.radius);e.x=p.x;e.y=p.y;return true;}
    if(e.warning>0){
      e.warning=Math.max(0,e.warning-dt);if(e.warning>0)return true;
      const angle=Math.atan2(e.chargeY,e.chargeX);
      if(e.kind!=='bomber')this.emit({type:'attack',x:e.x,y:e.y,angle,actorId:e.id,kind:e.kind});
      if(e.kind==='spitter'){
        if(this.enemyProjectiles.length<90)this.enemyProjectiles.push({id:this.nextId++,x:e.x,y:e.y,vx:e.chargeX*250,vy:e.chargeY*250,life:3,damage:14*this.arena.damage});e.abilityCooldown=3.4;
      }else if(e.kind==='bomber'){
        this.emit({type:'explosion',x:e.x,y:e.y,angle:0,amount:100,actorId:e.id,kind:e.kind});
        if(d<100+MAP.playerRadius&&!this.wall(e,this))this.damagePlayer(28*this.arena.damage,angle);
        // Self-detonation gives no kill/XP/coins; shooting it before detonation does.
        e.hp=0;this.emit({type:'death',x:e.x,y:e.y,angle,actorId:e.id,kind:e.kind,detonated:true});
      }else if(e.kind==='charger'){e.chargeTime=.6;e.abilityCooldown=4;}
      else if(e.kind==='summoner'){
        this.emit({type:'summon',x:e.x,y:e.y,angle:0});e.abilityCooldown=7;
        for(let i=0;i<2&&this.enemies.length<130;i++)this.spawn('runner',{x:e.x+(i===0?-50:50),y:e.y-25});
      }
      return true;
    }
    if(e.abilityCooldown===0){
      const can=e.kind==='spitter'?d<360&&!this.wall(e,this,5):e.kind==='bomber'?d<85:e.kind==='charger'?d<340&&d>90&&!this.wall(e,this,e.radius):e.kind==='summoner'?d<500:false;
      if(can){e.warning=e.kind==='bomber'?1.1:e.kind==='summoner'?1.2:.8;e.chargeX=(this.x-e.x)/(d||1);e.chargeY=(this.y-e.y)/(d||1);return true;}
    }
    return e.kind==='spitter'&&d<240&&!this.wall(e,this,5);
  }
  random(): number { this.seed ^= this.seed << 13; this.seed ^= this.seed >>> 17; this.seed ^= this.seed << 5; return (this.seed >>> 0) / 4294967296; }
  start(): void { this.phase = 'playing'; this.ammo = this.magazineSize; this.shield=this.shieldMax; this.reloadTimer = 0; this.banner = `${this.arena.name} · ${this.arena.difficulty} · 坚守 ${this.arena.waves} 波`; this.bannerTime = 3; this.spawnTimer = 0.8; }
  get damage(): number { return 24 * this.hero.damage * (1 + (this.upgrades.damage || 0) * .3) * (1+this.talent('arsenal')*.05) * (this.frenzyTime>0?1.25:1); }
  get speed(): number { return 215 * this.hero.speed * (1 + (this.upgrades.speed || 0) * .15) * (1+this.talent('featherstep')*.04); }
  get fireInterval(): number { return .43 * Math.pow(.82, this.upgrades.rate || 0) * Math.pow(.97,this.talent('overdrive')) * (this.frenzyTime>0?.65:1); }
  get magazineSize(): number { return 18 + (this.upgrades.magazine || 0) * 6+this.talent('reserve')*2+this.talent('fieldAmmo')*2; }
  get reloadDuration(): number { return 1.55 * this.hero.reload * Math.pow(.78, this.upgrades.reload || 0) * Math.pow(.95,this.talent('quickdraw')); }
  get bulletSpeed(): number { return 850 * (1 + (this.upgrades.velocity || 0) * .2); }
  get reloading(): boolean { return this.reloadTimer > 0; }
  get reloadProgress(): number { return this.reloading ? clamp(1-this.reloadTimer/this.reloadTotal,0,1) : 1; }
  get criticalChance(): number { return Math.min(.8, (this.upgrades.critical || 0) * .12+this.talent('deadeye')*.03+(this.frenzyTime>0?.2:0)); }
  get pickupRadius(): number { return 85 * (1 + (this.upgrades.magnet || 0) * .55); }
  get dashDuration(): number { return Math.max(1.4, 3.8 - (this.upgrades.speed || 0) * .35-this.talent('evasion')*.2-(this.hero.id==='scout'?this.awakeningTier*.25:0)); }
  get volleyCount():number {const n=this.upgrades.multi||0;return 1+n+(n>=3?2:0);}
  get shieldMax():number{return this.upgrades.shield?16+12*this.upgrades.shield:0;}
  hasSynergy(id:string,ranks=this.upgrades):boolean {return !!SYNERGIES.find(s=>s.id===id)?.needs.every(([key,rank])=>(ranks[key]||0)>=rank);}
  get buildRecipes(){return SYNERGIES.map(s=>({...s,active:this.hasSynergy(s.id),requirement:s.needs.map(([id,rank])=>`${UPGRADES.find(u=>u.id===id)!.name} ${Math.min(rank,this.upgrades[id]||0)}/${rank}`).join(' + ')}));}
  synergyHint(id:string):string {
    const related=this.buildRecipes.filter(s=>s.needs.some(([key])=>key===id));
    const unlocked=related.find(s=>!s.active&&this.hasSynergy(s.id,{...this.upgrades,[id]:(this.upgrades[id]||0)+1}));
    if(unlocked)return `本次激活 · ${unlocked.name}`;
    const recipe=related[0];if(!recipe)return '';
    if(recipe.active)return `联动生效 · ${recipe.name}`;
    const [partner,rank]=recipe.needs.find(([key])=>key!==id)!;
    return `联动：${UPGRADES.find(u=>u.id===partner)!.name} ${rank}阶`;
  }
  get powerStatus():string {
    if(this.frenzyTime>0)return `狂热 ${this.frenzyTime.toFixed(1)} 秒`;
    if(!this.awakeningTier)return 'LV.3 解锁英雄觉醒';
    if(this.hero.id==='vanguard')return `爆裂齐射 ${this.empoweredShots} 发`;
    if(this.hero.id==='scout')return this.dashCooldown>0?`闪袭 ${this.dashCooldown.toFixed(1)} 秒`:'闪袭就绪';
    return `新星 ${this.heroTimer.toFixed(1)} 秒`;
  }
  previewUpgrade(u:Upgrade):Upgrade {
    const next=(this.upgrades[u.id]||0)+1,e=u.evolution;
    if(e&&next>=e.tier){
      const detail=next===e.tier?e.detail:u.id==='multi'?`齐射 ${3+next} 枚子弹\n每次齐射只消耗 1 发弹药`:`每 2.4 秒释放 ${150+next*20} 范围脉冲\n提高伤害，继续继承高压弹药加成`;
      return {...u,name:e.name,detail,tag:next===e.tier?'进化 · 质变':'进化 · 强化'};
    }
    if(u.id==='chain')return {...u,detail:`主弹跳跃至 ${2+next} 个敌人\n初始电弧 ${50+15*next}% 伤害，逐跳衰减`};
    if(u.id==='frenzy')return {...u,detail:`击杀 8 敌进入 ${5+next} 秒狂热\n伤害 +25% · 射速 +54% · 暴击 +20%`};
    const after={...this.upgrades,[u.id]:next};
    const details:Record<string,string>={
      reloadBurst:`消耗半匣后换弹，震爆 ${100+next*20} 范围\n造成 ${150+next*60}% 武器伤害`,
      mines:`冲刺留下 ${next} 枚感应雷，持续 6 秒\n每枚 ${Math.round((140+40*next)*(this.hasSynergy('minefield',after)?1.4:1))}% 伤害，0.45 秒后布防`,
      shatter:`子弹减速 20%，击杀减速敌人冰爆\n${70+15*next} 范围 / ${70+35*next}% 武器伤害`,
      ricochet:`主弹最多弹射 ${next} 次，寻找新目标\n每跳保留 ${this.hasSynergy('conductor',after)?90:72}% 伤害，不能穿墙`,
      shield:`护盾上限 ${16+12*next}，立即充满\n${this.hasSynergy('bastion',after)?4:6} 秒未受击后，2 秒内充满`,
      hunter:`同一目标 2 秒内被主弹命中 3 次\n追加 ${80+60*next}% 伤害，Boss ×1.5`,
    };
    if(details[u.id])return {...u,detail:details[u.id]};
    return u;
  }
  private awaken():void {
    const tier=this.level>=9?3:this.level>=6?2:this.level>=3?1:0;
    if(tier<=this.awakeningTier)return;
    this.awakeningTier=tier;this.heroTimer=.35;
    if(this.hero.id==='vanguard')this.empoweredShots=2+tier;
    if(this.hero.id==='scout')this.dashCooldown=0;
    this.banner=`${this.hero.name}觉醒 · ${this.hero.signature} ${tier}阶`;this.bannerTime=3;
    this.emit({type:'awakening',x:this.x,y:this.y,angle:0,ink:this.hero.accent});
  }
  private areaStrike(center:Point,radius:number,damage:number,except?:number):void {
    for(const e of this.enemies){
      if(e.hp<=0||e.id===except||distance(e,center)>radius+e.radius||this.wall(center,e,2))continue;
      const d=distance(e,center)||1;
      this.hurtEnemy(e,damage,(e.x-center.x)/d*150,(e.y-center.y)/d*150);
    }
  }
  private arcStrike(origin:Enemy,rank:number,damage:number):void {
    const visited=new Set([origin.id]),points:Point[]=[{x:origin.x,y:origin.y}];let from:Point=origin;
    for(let hop=0;hop<2+rank;hop++){
      let nearest:Enemy|undefined,best=150;
      for(const e of this.enemies){const d=distance(e,from);if(e.hp>0&&!visited.has(e.id)&&d<best&&!this.wall(from,e,2)){nearest=e;best=d;}}
      if(!nearest)break;
      visited.add(nearest.id);points.push({x:nearest.x,y:nearest.y});
      this.hurtEnemy(nearest,damage*(.5+rank*.15)*Math.pow(.8,hop),0,0);from=nearest;
    }
    if(points.length>1)this.emit({type:'chain',x:origin.x,y:origin.y,angle:0,points});
  }
  reload(): boolean {
    if (this.phase !== 'playing' || this.reloading || this.ammo >= this.magazineSize) return false;
    this.reloadTimer = this.reloadDuration;
    this.reloadTotal = this.reloadDuration;
    this.reloadSpent=(this.magazineSize-this.ammo)/this.magazineSize;
    this.emit({ type: 'reload', x: this.x, y: this.y, angle: 0 });
    return true;
  }
  pause(): void { if(this.phase === 'playing') this.phase = 'paused'; else if(this.phase === 'paused') this.phase = 'playing'; }
  dash(): boolean {
    if(this.phase !== 'playing' || this.dashCooldown > 0) return false;
    this.dashCooldown = this.dashDuration; this.dashTime = .18; this.invulnerable = Math.max(.28, this.invulnerable);
    this.dashX = this.lastMoveX; this.dashY = this.lastMoveY; this.trauma = .18;
    this.emit({type:'dash',x:this.x,y:this.y,angle:Math.atan2(this.dashY,this.dashX)});
    const rank=this.upgrades.mines||0;
    for(let i=0;i<rank;i++){
      const side=(i-(rank-1)/2)*36,p=this.move(this,-this.dashY*side,this.dashX*side,12);
      this.mines.push({id:this.nextId++,x:p.x,y:p.y,age:0,life:6,rank});
    }
    if(this.mines.length>9)this.mines.splice(0,this.mines.length-9);
    if(this.hero.id==='scout'&&this.awakeningTier>0){
      const count=8+this.awakeningTier*4;
      for(let i=0;i<count;i++){const a=this.aim+i*Math.PI*2/count;
        this.bullets.push({id:this.nextId++,x:this.x,y:this.y,vx:Math.cos(a)*this.bulletSpeed,vy:Math.sin(a)*this.bulletSpeed,life:.7,damage:this.damage*(1.2+this.awakeningTier*.15),pierce:2,hit:new Set(),empowered:true});}
      this.emit({type:'heroPower',x:this.x,y:this.y,angle:0,amount:110,ink:this.hero.accent});
    }
    return true;
  }
  selectUpgrade(index: number): boolean {
    if(this.phase !== 'upgrade' || !this.choices[index]) return false;
    const choice=this.choices[index],id=choice.id;if((this.upgrades[id]||0)>=choice.max)return false;
    const before=SYNERGIES.filter(s=>this.hasSynergy(s.id)).map(s=>s.id);
    this.upgrades[id] = (this.upgrades[id] || 0) + 1;
    if(id === 'vital') { this.maxHp += 25; this.hp = Math.min(this.maxHp, this.hp + 40); }
    if(id === 'magazine' && !this.reloading) this.ammo = Math.min(this.magazineSize, this.ammo + 6);
    if(id === 'reload' && this.reloading) {
      this.reloadTimer *= this.reloadDuration / this.reloadTotal;
      this.reloadTotal = this.reloadDuration;
    }
    this.phase = 'playing'; this.choices = []; this.invulnerable = Math.max(this.invulnerable, .6);
    if(id==='pulse')this.pulseTimer=Math.min(this.pulseTimer,.2);
    if(id==='shield'){this.shield=this.shieldMax;this.shieldDelay=0;}
    const evolution=UPGRADES.find(u=>u.id===id)?.evolution;
    if(evolution&&this.upgrades[id]===evolution.tier){this.banner=`武器进化 · ${evolution.name}`;this.bannerTime=3;}
    this.emit({type:'upgrade',x:this.x,y:this.y,angle:0});this.awaken();
    const activated=SYNERGIES.filter(s=>!before.includes(s.id)&&this.hasSynergy(s.id));
    if(activated.length){this.banner=`联动激活 · ${activated.map(s=>s.name).join(' / ')}`;this.bannerTime=3;}
    this.checkLevel(); return true;
  }
  rerollUpgrades():boolean {
    if(this.phase!=='upgrade'||this.rerolls<=0)return false;
    const available=UPGRADES.filter(u=>(this.upgrades[u.id]||0)<u.max);
    if(!available.some(u=>!this.choices.some(c=>c.id===u.id)))return false;
    const old=this.choices.map(u=>u.id);this.rerolls--;this.offerUpgrades(old);return true;
  }
  private checkLevel(): void {
    if(this.xp < this.xpNext || this.phase !== 'playing') return;
    const pool = UPGRADES.filter(u => (this.upgrades[u.id] || 0) < u.max);
    if(pool.length === 0) { this.hp = Math.min(this.maxHp, this.hp + 20); this.xp = 0; return; }
    this.xp -= this.xpNext; this.level++; this.xpNext = Math.floor(this.xpNext * 1.17 + 4);
    this.offerUpgrades();this.phase='upgrade';
  }
  private offerUpgrades(exclude:string[]=[]):void {
    const available=UPGRADES.filter(u=>(this.upgrades[u.id]||0)<u.max),fresh=available.filter(u=>!exclude.includes(u.id));
    const pool=fresh.length>=3?fresh:available;
    for(let i = pool.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i+1)); [pool[i],pool[j]] = [pool[j],pool[i]]; }
    const picks:Upgrade[]=[],add=(u:Upgrade|undefined)=>{if(u&&!picks.includes(u)&&picks.length<3)picks.push(u);};
    add(pool.find(u=>(this.level===2?['multi','pulse','blast','chain']:['damage','rate','multi','pierce','pulse','critical','finisher','blast','chain','frenzy','reloadBurst','mines','shatter','ricochet','hunter']).includes(u.id)));
    add(pool.find(u=>(this.upgrades[u.id]||0)>0&&!picks.includes(u)));
    if(this.level>2)add(pool.find(u=>!picks.includes(u)&&SYNERGIES.some(s=>s.needs.some(([id])=>id===u.id)&&s.needs.some(([id])=>id!==u.id&&(this.upgrades[id]||0)>0)&&!this.hasSynergy(s.id))));
    for(const u of pool)add(u);
    // Near exhaustion a reroll must still change at least one option.
    if(exclude.length&&picks.every(u=>exclude.includes(u.id))&&fresh.length)picks[picks.length-1]=fresh[0];
    this.choices=picks;
  }
  spawn(kind: EnemyKind, position?: {x:number;y:number},bossConfig?:{id:BossId;tier:BossTier}): Enemy {
    const angle=this.random()*Math.PI*2;
    const candidate={x:this.x+Math.cos(angle)*560,y:this.y+Math.sin(angle)*440};
    const p = position || (this.free(candidate,48)?candidate:this.map.gates[Math.floor(this.random()*this.map.gates.length)]);
    const late = (1 + (this.wave-1)*.075)*this.arena.health;
    const stats = { walker:[35,52,18,10], runner:[24,102,15,8], brute:[155,37,29,18], boss:[1700,44,45,25],spitter:[65,46,20,10],bomber:[85,60,25,24],charger:[100,83,22,18],summoner:[145,35,24,12] }[kind];
    const e: Enemy = { id:this.nextId++, kind, ...p, hp:stats[0]*late, maxHp:stats[0]*late,
      speed:stats[1]*(1+(this.wave-1)*.014)*this.arena.speed, radius:stats[2], damage:stats[3]*this.arena.damage, flash:0, pushX:0,pushY:0,slowTime:0,slowFactor:1,abilityCooldown:1.2,warning:0,chargeTime:0,chargeX:0,chargeY:0,finalBoss:false };
    if(kind==='boss'){
      const id=bossConfig?.id||bossForMap(this.arena.id),tier=bossConfig?.tier||'final',spec=BOSSES[id];
      e.boss=initialBossState(id,tier);e.hp=e.maxHp=spec.hp*late*(tier==='elite'?.26:1);
      e.speed=spec.speed*this.arena.speed;e.radius=tier==='elite'?32:45;e.damage=(tier==='elite'?22:34)*this.arena.damage;
    }
    const safe=this.move(e,0,0,e.radius);e.x=safe.x;e.y=safe.y;
    this.enemies.push(e); return e;
  }
  private announceBoss(e:Enemy):void {
    const b=e.boss!,total=b.tier==='elite'?2.2:3;
    b.arrival=total;this.bossWarning={id:b.id,tier:b.tier,name:bossName(b),remaining:total,total};
    this.emit({type:'bossArrival',x:e.x,y:e.y,angle:0,actorId:e.id,kind:'boss',bossId:b.id,bossTier:b.tier});
    this.banner=b.tier==='elite'?`第 ${this.wave} 波 · 精英拦截`:'最终波 · 消灭感染源后撤离';this.bannerTime=total;
  }
  update(dt: number, mx = 0, my = 0): void {
    if(this.phase !== 'playing') return;
    dt = clamp(dt,0,.05); this.time += dt;
    this.frenzyTime=Math.max(0,this.frenzyTime-dt);this.heroTimer=Math.max(0,this.heroTimer-dt);
    this.shieldDelay=Math.max(0,this.shieldDelay-dt);
    if(this.shieldDelay===0)this.shield=Math.min(this.shieldMax,this.shield+this.shieldMax*.5*dt);
    if(this.bossWarning){this.bossWarning.remaining=Math.max(0,this.bossWarning.remaining-dt);if(this.bossWarning.remaining===0)this.bossWarning=null;}
    this.invulnerable = Math.max(0,this.invulnerable-dt); this.dashCooldown = Math.max(0,this.dashCooldown-dt);
    this.trauma = Math.max(0,this.trauma-dt*2); this.bannerTime = Math.max(0,this.bannerTime-dt);
    this.hp = Math.min(this.maxHp, this.hp + dt * (this.hero.regen+1.2 * (this.upgrades.regen || 0)+.2*this.talent('regenerator')));
    if (this.reloading) {
      this.reloadTimer = Math.max(0, this.reloadTimer - dt);
      if (this.reloadTimer === 0) {
        this.ammo = this.magazineSize; this.reloadsCompleted++;
        this.emit({type:'reloadComplete',x:this.x,y:this.y,angle:0});
        const rank=this.upgrades.reloadBurst||0;
        if(rank&&this.reloadSpent>=.5){
          const radius=100+rank*20;this.areaStrike(this,radius,this.damage*(1.5+rank*.6));
          this.emit({type:'blast',x:this.x,y:this.y,angle:0,amount:radius});
          if(this.hasSynergy('breach'))this.enemyProjectiles=this.enemyProjectiles.filter(b=>distance(b,this)>radius||!!this.wall(this,b,2));
        }
        if(this.hero.id==='vanguard'&&this.awakeningTier>0){
          this.empoweredShots=2+this.awakeningTier;
          this.emit({type:'heroPower',x:this.x,y:this.y,angle:0,amount:70,ink:this.hero.accent});
        }
      }
    }
    const cleared=Math.min(this.arena.waves,Math.floor(this.time/this.arena.waveSeconds));
    while(this.clearedWaves<cleared){this.clearedWaves++;this.reward(12+this.clearedWaves*2);}
    const newWave = Math.min(this.arena.waves,cleared+1);
    if(newWave !== this.wave) {
      this.wave = newWave;const kind=ENEMY_UNLOCK[newWave];this.banner = `第 ${this.wave} / ${this.arena.waves} 波 · ${kind?ENEMY_NAMES[kind]+'出现':'尸潮增强'}`;this.bannerTime=3;
      if(kind)this.spawn(kind);
    }
    const eliteWave=this.arena.eliteWaves.find(w=>w<=this.wave&&!this.eliteWavesSpawned.includes(w));
    if(this.wave<this.arena.waves&&eliteWave!==undefined&&!this.enemies.some(e=>e.boss?.tier==='elite'&&e.hp>0)){
      const ids:BossId[]=['warden','furnace','hive'],offset=ids.indexOf(bossForMap(this.arena.id));
      const id=ids[(offset+this.arena.eliteWaves.indexOf(eliteWave))%ids.length];
      this.eliteWavesSpawned.push(eliteWave);this.announceBoss(this.spawn('boss',undefined,{id,tier:'elite'}));
    }
    const len = Math.hypot(mx,my); this.moving = len>.05;
    if(len>0) { mx/=Math.max(1,len); my/=Math.max(1,len); this.lastMoveX=mx; this.lastMoveY=my; }
    if(this.dashTime>0) { this.dashTime-=dt; mx=this.dashX*3.8; my=this.dashY*3.8; }
    const dx=mx*this.speed*dt,dy=my*this.speed*dt,next=this.move(this,dx,dy,MAP.playerRadius);
    if(Math.hypot(next.x-this.x-dx,next.y-this.y-dy)>.05)this.blockedMoves++;
    this.moving=Math.hypot(next.x-this.x,next.y-this.y)>.01;this.x=next.x;this.y=next.y;
    this.spawnTimer-=dt;
    if(this.spawnTimer<=0 && this.enemies.length<130) {
      this.spawnTimer = Math.max(.2,1.05-this.wave*.052)/this.arena.density;
      const pool=waveRoster(this.wave+(this.arena.id==='laboratory'?2:0));
      this.spawn(pool[Math.floor(this.random()*pool.length)]);
    }
    if(this.time>=this.duration-this.arena.waveSeconds && !this.bossSpawned) {
      this.bossSpawned=true;const boss=this.spawn('boss');boss.finalBoss=true;this.announceBoss(boss);
    }
    this.fireTimer-=dt;
    let target: Enemy | undefined; let nearest=Infinity;
    for(const e of this.enemies) { const d=distance(e,this); if(e.hp>0&&d<nearest&&d<360&&!this.wall(this,e,3)) {nearest=d;target=e;} }
    if(target) { this.aim=Math.atan2(target.y-this.y,target.x-this.x); this.facing=target.x>=this.x?1:-1; }
    else if(mx!==0) this.facing=mx>=0?1:-1;
    if(this.fireTimer<=0 && target && nearest<360 && !this.reloading && this.ammo>0) {
      this.fireTimer=this.fireInterval; this.shotEvents++;
      const critical = this.criticalChance > 0 && this.random() < this.criticalChance;
      const damage = this.damage * (critical?2:1) * (this.ammo<=3?1+(this.upgrades.finisher||0)*.35:1);
      this.ammo--;
      this.emit({type:'fire',x:this.x,y:this.y,angle:this.aim});
      const count=this.volleyCount,empowered=this.empoweredShots>0;
      if(empowered)this.empoweredShots--;
      const blast=this.upgrades.blast||0,explosive=blast>0&&this.shotEvents%(blast>=3?2:4)===0;
      for(let i=0;i<count;i++) { const a=this.aim+(i-(count-1)/2)*(count>=6?.12:.16),primary=i===Math.floor(count/2);
        this.bullets.push({id:this.nextId++,x:this.x,y:this.y,
          vx:Math.cos(a)*this.bulletSpeed,vy:Math.sin(a)*this.bulletSpeed,life:.85,damage,pierce:this.upgrades.pierce||0,hit:new Set(),critical,slow:Math.max((this.upgrades.frost||0)*.15,this.upgrades.shatter?.2:0),empowered,primary,ricochets:primary?this.upgrades.ricochet||0:0,
          blast:primary&&(explosive||empowered)?Math.max(explosive?75+blast*20:0,empowered?85+this.awakeningTier*15:0):0,
          blastDamage:damage*Math.max(explosive?.55+blast*.2:0,empowered?.6+this.awakeningTier*.15:0),chain:primary?this.upgrades.chain||0:0}); }
      if (this.ammo === 0) this.reload();
    }
    if (!this.reloading && this.ammo === 0) this.reload();
    this.pulseTimer-=dt;
    if(this.upgrades.pulse && this.pulseTimer<=0) {
      const evolved=this.upgrades.pulse>=3;this.pulseTimer=evolved?2.4:4; const range=110+this.upgrades.pulse*20+(evolved?40:0);
      this.effect(this.x,this.y,'pulse',String(range)); this.trauma=.2;
      this.emit({type:'pulse',x:this.x,y:this.y,angle:0,amount:range});
      this.areaStrike(this,range,(35+this.upgrades.pulse*25)*(evolved?1+(this.upgrades.damage||0)*.15:1));
    }
    if(this.hero.id==='medic'&&this.awakeningTier>0&&this.heroTimer===0){
      this.heroTimer=5;const range=130+30*this.awakeningTier;
      this.hp=Math.min(this.maxHp,this.hp+this.maxHp*(.035+.005*this.awakeningTier));
      this.areaStrike(this,range,this.damage*(1.6+.6*this.awakeningTier));
      this.enemyProjectiles=this.enemyProjectiles.filter(b=>distance(b,this)>range||!!this.wall(this,b,2));
      this.emit({type:'heroPower',x:this.x,y:this.y,angle:0,amount:range,ink:'#93e6bc'});
      this.emit({type:'heal',x:this.x,y:this.y,angle:0});
    }
    for(const mine of this.mines){
      mine.age+=dt;mine.life-=dt;
      if(mine.age<.45||!this.enemies.some(e=>e.hp>0&&distance(e,mine)<65+e.radius&&!this.wall(mine,e,2)))continue;
      const combo=this.hasSynergy('minefield'),radius=90+mine.rank*10+(combo?35:0);
      this.areaStrike(mine,radius,this.damage*(1.4+mine.rank*.4)*(combo?1.4:1));mine.life=0;
      this.emit({type:'blast',x:mine.x,y:mine.y,angle:0,amount:radius});
    }
    this.mines=this.mines.filter(m=>m.life>0);
    for(const e of this.enemies) {
      if(e.hp<=0) continue;
      e.markTime=Math.max(0,(e.markTime||0)-dt);if(e.markTime===0)e.markHits=0;
      e.flash=Math.max(0,e.flash-dt); const dx=this.x-e.x,dy=this.y-e.y,d=Math.hypot(dx,dy)||1;
      e.slowTime=Math.max(0,e.slowTime-dt);if(e.slowTime===0)e.slowFactor=1;
      let speed=e.speed*e.slowFactor;
      if(e.boss)speed*=1+(e.boss.phase-1)*.1;
      const special=e.boss?this.bosses.update(e,dt,this):this.enemyAbility(e,dt);
      if(e.boss&&special){e.pushX=0;e.pushY=0;}if(this.hp<=0)return;if(e.hp<=0)continue;
      const goal=this.navigation.direction(e,this,e.radius),gx=goal.x-e.x,gy=goal.y-e.y,gd=Math.hypot(gx,gy)||1;
      const next=this.move(e,((special?0:gx/gd*speed)+e.pushX)*dt,((special?0:gy/gd*speed)+e.pushY)*dt,e.radius);e.x=next.x;e.y=next.y;
      e.pushX*=Math.exp(-dt*12);e.pushY*=Math.exp(-dt*12);
      if(distance(e,this)<e.radius+15 && this.invulnerable<=0&&!(e.boss&&e.boss.arrival>0)&&!this.wall(e,this)) {
        this.damagePlayer(e.damage,Math.atan2(dy,dx));
        this.emit({type:'attack',x:e.x,y:e.y,angle:Math.atan2(dy,dx),actorId:e.id,kind:e.kind});
        e.pushX=-dx/d*260;e.pushY=-dy/d*260;
        if(this.hp<=0) { this.phase='dead'; return; }
      }
    }
    this.bosses.updateZones(dt,this,this.enemies);if(this.hp<=0)return;
    for(const h of this.map.hazards)if(hazardPhase(this.time,h)==='active'&&distance(h,this)<h.radius)this.damagePlayer((h.kind==='heat'?16:12)*this.arena.damage);
    if(this.hp<=0)return;
    for(const b of this.enemyProjectiles){
      const next={x:b.x+b.vx*dt,y:b.y+b.vy*dt};b.life-=dt;
      const hit=this.wall(b,next,6),travel=hit?hit.t:1,sx=(next.x-b.x)*travel,sy=(next.y-b.y)*travel;
      const t=clamp(((this.x-b.x)*sx+(this.y-b.y)*sy)/(sx*sx+sy*sy||1),0,1);
      if(Math.hypot(this.x-b.x-t*sx,this.y-b.y-t*sy)<MAP.playerRadius+7){this.damagePlayer(b.damage);b.life=0;}
      b.x+=sx;b.y+=sy;if(hit)b.life=0;
    }
    this.enemyProjectiles=this.enemyProjectiles.filter(b=>b.life>0);if(this.hp<=0)return;
    // Spatial hash limits separation work as hordes grow.
    const grid=new Map<string,Enemy[]>();const cell=70;
    for(const e of this.enemies) { const k=`${Math.floor(e.x/cell)},${Math.floor(e.y/cell)}`; const bucket=grid.get(k)||[];bucket.push(e);grid.set(k,bucket); }
    for(const a of this.enemies) {
      const gx=Math.floor(a.x/cell),gy=Math.floor(a.y/cell);
      for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++)for(const b of grid.get(`${gx+ox},${gy+oy}`)||[]) {
        if(b.id<=a.id) continue;let dx=a.x-b.x,dy=a.y-b.y;const d=Math.hypot(dx,dy),min=(a.radius+b.radius)*.8;
        if(d<min&&d>.01){const push=(min-d)*.25;dx=dx/d*push;dy=dy/d*push;const an=this.move(a,dx,dy,a.radius),bn=this.move(b,-dx,-dy,b.radius);a.x=an.x;a.y=an.y;b.x=bn.x;b.y=bn.y;}
      }
    }
    const bounced:Bullet[]=[];
    for(const b of this.bullets) {
      const px=b.x,py=b.y,hit=this.wall(b,{x:b.x+b.vx*dt,y:b.y+b.vy*dt},3);
      const travel=hit?Math.max(0,hit.t-.0001):1;b.x+=b.vx*dt*travel;b.y+=b.vy*dt*travel;b.life-=dt;
      for(const e of this.enemies) {
        if(e.hp<=0||b.hit.has(e.id)||b.life<=0)continue;
        // Segment collision prevents fast projectiles tunneling through small enemies.
        const sx=b.x-px,sy=b.y-py,t=clamp(((e.x-px)*sx+(e.y-py)*sy)/(sx*sx+sy*sy||1),0,1);
        if(Math.hypot(e.x-(px+t*sx),e.y-(py+t*sy))<e.radius+4) {
          const chilled=e.slowTime>0||!!b.slow;
          b.hit.add(e.id);this.hurtEnemy(e,b.damage,b.vx*.12,b.vy*.12,b.critical);
          if(b.primary&&this.upgrades.hunter&&e.hp>0){
            e.markHits=(e.markHits||0)+1;e.markTime=2;
            if(e.markHits>=3){
              e.markHits=0;this.hurtEnemy(e,this.damage*(.8+.6*this.upgrades.hunter)*(e.boss?1.5:1),0,0);
              this.emit({type:'markBurst',x:e.x,y:e.y,angle:0});
            }
          }
          // Only a direct bullet kill shatters; area damage cannot recurse.
          if(e.hp<=0&&chilled&&this.upgrades.shatter){
            const rank=this.upgrades.shatter,radius=70+rank*15;
            if(this.hasSynergy('winter'))for(const other of this.enemies)if(other.hp>0&&distance(other,e)<radius+other.radius&&!this.wall(e,other,2)){other.slowTime=2.5;other.slowFactor=Math.min(other.slowFactor,.45);}
            this.areaStrike(e,radius,this.damage*(.7+rank*.35),e.id);
            this.emit({type:'shatter',x:e.x,y:e.y,angle:0,amount:radius});
          }
          if(b.ricochets){
            let next:Enemy|undefined,best=220;
            for(const other of this.enemies){const d=distance(e,other);if(other.hp>0&&!b.hit.has(other.id)&&d<best&&!this.wall(e,other,3)){next=other;best=d;}}
            if(next){const a=Math.atan2(next.y-e.y,next.x-e.x);
              bounced.push({id:this.nextId++,x:e.x,y:e.y,vx:Math.cos(a)*this.bulletSpeed,vy:Math.sin(a)*this.bulletSpeed,life:.5,damage:b.damage*(this.hasSynergy('conductor')?.9:.72),pierce:0,hit:new Set(b.hit),ricochets:b.ricochets-1,slow:b.slow});
              this.emit({type:'ricochet',x:e.x,y:e.y,angle:a});
            }
            b.ricochets=0;
          }
          // Only the primary pellet can proc these effects, and only on its first hit.
          if(b.blast){const radius=b.blast;b.blast=0;this.areaStrike(e,radius,b.blastDamage||0);
            this.emit({type:'blast',x:e.x,y:e.y,angle:0,amount:radius});this.trauma=Math.max(this.trauma,.2);}
          if(b.chain){const rank=b.chain;b.chain=0;this.arcStrike(e,rank,b.damage);}
          if(b.slow && e.hp>0){const fresh=e.slowTime<.1;e.slowTime=Math.max(e.slowTime,1.5);e.slowFactor=Math.min(e.slowFactor,1-b.slow);if(fresh)this.emit({type:'frost',x:e.x,y:e.y,angle:0});}
          if(b.pierce--<=0)b.life=0;
        }
      }
      if(hit){b.life=0;this.wallsHit++;this.emit({type:'impact',x:b.x,y:b.y,angle:Math.atan2(b.vy,b.vx)});}
    }
    this.enemies=this.enemies.filter(e=>e.hp>0);this.bullets=this.bullets.filter(b=>b.life>0).concat(bounced);
    for(const drop of this.drops) {
      if(drop.bossLoot){drop.age=Math.min(1,(drop.age||0)+dt);if(drop.age<.35)continue;}
      const dx=this.x-drop.x,dy=this.y-drop.y,d=Math.hypot(dx,dy);
      if(d<this.pickupRadius&&!this.wall(drop,this,2)) { const step=Math.min(d,dt*(300+500*(1-d/this.pickupRadius)));drop.x+=dx/(d||1)*step;drop.y+=dy/(d||1)*step; }
      if(distance(drop,this)<23&&!this.wall(drop,this,2)) {
        if(drop.kind==='heal'){this.hp=Math.min(this.maxHp,this.hp+22);this.emit({type:'heal',x:this.x,y:this.y,angle:0});}
        else this.xp+=drop.value*(1+(this.upgrades.magnet||0)*.15);
        this.pickupEvents++;this.effect(drop.x,drop.y,'xp');drop.value=0;
      }
    }
    this.drops=this.drops.filter(d=>d.value>0);
    for(const p of this.effects){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;}
    this.effects=this.effects.filter(p=>p.life>0).slice(-240);
    if(this.time>=this.duration&&this.bossDefeated&&!this.enemies.some(e=>e.boss&&e.hp>0)){this.reward(100);this.phase='won';return;}
    this.checkLevel();
  }
  private dropBossLoot(e:Enemy):void {
    const loot=BOSS_LOOT[e.boss!.tier],count=loot.xpCount+loot.heals;
    for(let i=0;i<count;i++){
      // A deterministic spiral spreads loot without consuming the combat RNG.
      // The same player-sized collision sweep keeps every pickup reachable.
      const angle=i*2.3999632297,radius=24+(loot.radius-24)*Math.sqrt((i+.5)/count);
      const p=this.move(e,Math.cos(angle)*radius,Math.sin(angle)*radius,MAP.playerRadius);
      this.drops.push({id:this.nextId++,x:p.x,y:p.y,kind:i<loot.xpCount?'xp':'heal',value:i<loot.xpCount?loot.xpValue:1,bossLoot:true,age:0});
    }
  }
  private hurtEnemy(e: Enemy, damage: number, pushX:number, pushY:number, critical=false): void {
    if(e.hp<=0)return;e.hp-=damage;e.flash=.09;e.pushX+=pushX*(e.boss?.08:1);e.pushY+=pushY*(e.boss?.08:1);
    this.emit({type:'impact',x:e.x,y:e.y,angle:Math.atan2(pushY,pushX),actorId:e.id,kind:e.kind,amount:Math.round(damage),critical});
    for(let i=0;i<3;i++)this.effect(e.x,e.y,'spark');
    if(e.hp<=0) {
      this.kills++;this.killEvents++;this.trauma=Math.max(this.trauma,.07);
      if(this.upgrades.frenzy&&this.frenzyTime===0&&++this.frenzyKills>=8){
        this.frenzyKills=0;this.frenzyTime=5+this.upgrades.frenzy;
        this.emit({type:'frenzy',x:this.x,y:this.y,angle:0,amount:this.frenzyTime});
        this.banner='连杀狂热 · 火力全开';this.bannerTime=1.8;
      }
      this.reward(e.boss?BOSS_LOOT[e.boss.tier].coins:ENEMY_COINS[e.kind]);
      this.hp=Math.min(this.maxHp,this.hp+(this.upgrades.leech||0)*.8);
      this.emit({type:'death',x:e.x,y:e.y,angle:Math.atan2(pushY,pushX),actorId:e.id,kind:e.kind,bossId:e.boss?.id,bossTier:e.boss?.tier});
      if(e.boss)this.bosses.clearOwner(e.id);
      if(e.finalBoss) {this.bossDefeated=true;this.banner=this.enemies.some(a=>a!==e&&a.boss&&a.hp>0)?'感染源已清除 · 清理剩余精英':'感染源已清除 · 等待撤离';this.bannerTime=3;}
      for(let i=0;i<7;i++)this.effect(e.x,e.y,'blood');
      if(e.boss)this.dropBossLoot(e);
      else{
        this.drops.push({id:this.nextId++,x:e.x,y:e.y,kind:'xp',value:e.kind==='brute'?12:4});
        if(this.random()<.07)this.drops.push({id:this.nextId++,x:e.x+12,y:e.y+6,kind:'heal',value:1});
      }
    }
  }
  private effect(x:number,y:number,kind:Effect['kind'],text?:string):void {
    const a=this.random()*Math.PI*2,s=30+this.random()*140;
    const life=kind==='damage'?.7:kind==='pulse'?.45:.2+this.random()*.3;
    this.effects.push({id:this.nextId++,x,y,kind,text,life,maxLife:life,
      vx:kind==='damage'||kind==='pulse'?0:Math.cos(a)*s,vy:kind==='damage'?45:kind==='pulse'?0:Math.sin(a)*s});
  }
  snapshot():object {
    return {hero:this.hero.id,bossWarning:this.bossWarning?{...this.bossWarning}:null,eliteWavesSpawned:[...this.eliteWavesSpawned],bosses:this.enemies.filter(e=>e.boss&&e.hp>0).map(e=>({actorId:e.id,name:bossName(e.boss!),hp:Math.ceil(e.hp),maxHp:e.maxHp,...e.boss})),bossZones:this.bosses.zones.map(z=>({...z})),phase:this.phase,time:+this.time.toFixed(2),wave:this.wave,hp:+this.hp.toFixed(1),maxHp:this.maxHp,
      player:{x:+this.x.toFixed(1),y:+this.y.toFixed(1)},kills:this.kills,level:this.level,xp:this.xp,xpNext:this.xpNext,
      enemies:this.enemies.length,bullets:this.bullets.length,drops:this.drops.length,
      upgrades:{...this.upgrades},choices:this.choices.map(c=>c.id),bossSpawned:this.bossSpawned,bossDefeated:this.bossDefeated,
      build:{rerolls:this.rerolls,shield:+this.shield.toFixed(1),shieldMax:this.shieldMax,shieldDelay:+this.shieldDelay.toFixed(2),mines:this.mines.map(m=>({...m})),synergies:SYNERGIES.filter(s=>this.hasSynergy(s.id)).map(s=>s.name)},
      power:{tier:this.awakeningTier,name:this.hero.signature,empoweredShots:this.empoweredShots,cooldown:+this.heroTimer.toFixed(2),frenzy:+this.frenzyTime.toFixed(2),frenzyKills:this.frenzyKills,volleyCount:this.volleyCount,evolutions:UPGRADES.filter(u=>u.evolution&&(this.upgrades[u.id]||0)>=u.evolution.tier).map(u=>u.evolution!.name)},
      weapon:{ammo:this.ammo,capacity:this.magazineSize,reloading:this.reloading,reloadRemaining:+this.reloadTimer.toFixed(3),
        reloadDuration:+this.reloadDuration.toFixed(3),reloadProgress:+this.reloadProgress.toFixed(3),shotsFired:this.shotEvents,
        reloadsCompleted:this.reloadsCompleted,criticalChance:this.criticalChance,bulletSpeed:this.bulletSpeed},
      campaign:{map:this.arena.id,difficulty:this.arena.difficulty,waves:this.arena.waves,duration:this.duration,clearedWaves:this.clearedWaves,coins:this.coins,heroTalents:{...this.heroTalents},coinRewardScale:COIN_REWARD_SCALE},
      enemyKinds:this.enemies.reduce((counts:Record<string,number>,e)=>{counts[e.kind]=(counts[e.kind]||0)+1;return counts;},{}),enemyProjectiles:this.enemyProjectiles.length,
      map:{width:MAP.width,height:MAP.height,chunks:12,obstacles:this.map.obstacles.length,wallsHit:this.wallsHit,blockedMoves:this.blockedMoves,playerClear:this.free(this,MAP.playerRadius)}};
  }
}
