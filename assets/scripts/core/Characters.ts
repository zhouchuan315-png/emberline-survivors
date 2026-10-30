export type HeroId='vanguard'|'scout'|'medic';
export interface HeroConfig {id:HeroId;name:string;role:string;detail:string;accent:string;hp:number;damage:number;speed:number;reload:number;regen:number;signature:string}
export const HEROES:HeroConfig[]=[
  {id:'vanguard',name:'烬火',role:'突击手',detail:'100 生命 · 均衡步枪\n3级觉醒：换弹蓄能爆裂齐射',accent:'#edaa4a',hp:100,damage:1,speed:1,reload:1,regen:0,signature:'烈焰装填'},
  {id:'scout',name:'夜隼',role:'侦察兵',detail:'80 生命 · 移速 +18%\n3级觉醒：冲刺释放穿透弹幕',accent:'#72c6c1',hp:80,damage:.9,speed:1.18,reload:.85,regen:0,signature:'闪袭弹幕'},
  {id:'medic',name:'白芷',role:'战地医师',detail:'115 生命 · 持续再生\n3级觉醒：治疗清弹净化新星',accent:'#e6c9b0',hp:115,damage:.92,speed:.96,reload:1,regen:.6,signature:'净化新星'},
];
export const heroById=(id?:string):HeroConfig=>HEROES.find(h=>h.id===id)||HEROES[0];
