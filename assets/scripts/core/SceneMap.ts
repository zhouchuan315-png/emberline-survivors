/** Shared authored map: rendering, collisions, navigation and minimap use these objects. */
import type { MapId } from './Campaign.ts';
export interface Point { x:number; y:number }
export type PropKind = 'container' | 'barricade' | 'crates' | 'car';
export interface Obstacle { id:string; kind:PropKind; x:number; y:number; width:number; height:number; lift:number; hull:Point[] }
export const MAP = { width:2400, height:1440, tile:120, chunkWidth:600, chunkHeight:480, columns:4, rows:3, playerRadius:16 };
const shapes:Record<PropKind,{ratio:number;lift:number;points:number[][]}>={
 container:{ratio:486/768,lift:.27,points:[[-.48,.11],[.30,-.21],[.48,-.05],[-.30,.29]]},
 barricade:{ratio:423/768,lift:.21,points:[[-.48,-.05],[-.29,-.26],[.48,.02],[.42,.22]]},
 crates:{ratio:516/581,lift:.28,points:[[-.47,.11],[-.01,-.20],[.47,.12],[.05,.36]]},
 car:{ratio:446/768,lift:.21,points:[[-.43,.13],[.20,-.23],[.46,-.06],[-.16,.33]]},
};
function prop(id:string,kind:PropKind,x:number,y:number,width:number):Obstacle {
 const s=shapes[kind],height=width*s.ratio;
 return {id,kind,x,y,width,height,lift:s.lift*height,hull:s.points.map(([px,py])=>({x:x+px*width,y:y+py*height}))};
}
// Three rows of four modules. Main x/y axes stay open as connected escape routes.
const modules:Array<{name:string;props:Array<[PropKind,number,number,number]>}>=[
 {name:'西北仓储',props:[['container',-58,26,282],['crates',149,-129,102]]},
 {name:'装卸站 A',props:[['container',-15,75,265],['barricade',109,-131,165]]},
 {name:'装卸站 B',props:[['container',20,60,265],['crates',-143,-131,100]]},
 {name:'北停车区',props:[['car',-10,54,210],['barricade',132,-138,156]]},
 {name:'西侧物资区',props:[['crates',-55,101,112],['container',54,-126,240]]},
 {name:'集结区',props:[['barricade',-30,136,182],['crates',-132,-128,96]]},
 {name:'检疫哨站',props:[['car',92,113,210],['barricade',21,-135,180]]},
 {name:'东侧车库',props:[['container',38,85,250],['car',-83,-142,190]]},
 {name:'回收区',props:[['car',-20,-12,220],['crates',155,125,98]]},
 {name:'南物资站',props:[['container',-22,-59,272],['crates',118,131,96]]},
 {name:'南检查站',props:[['car',-30,-48,218],['barricade',119,131,160]]},
 {name:'撤离仓库',props:[['container',32,-28,274],['crates',-153,124,100]]},
];
export const CHUNKS=modules.map((m,i)=>({id:`zone-${i+1}`,name:m.name,x:-900+(i%4)*600,y:480-Math.floor(i/4)*480}));
export const OBSTACLES:Obstacle[]=[];
modules.forEach((m,i)=>m.props.forEach((p,j)=>OBSTACLES.push(prop(`${CHUNKS[i].id}-${j}`,p[0],CHUNKS[i].x+p[1],CHUNKS[i].y+p[2],p[3]))));
export const SPAWN_GATES:Point[]=[{x:-1148,y:0},{x:1148,y:0},{x:0,y:668},{x:0,y:-668},{x:-600,y:668},{x:600,y:-668},{x:-1148,y:480},{x:1148,y:-480}];
export interface Hazard extends Point {radius:number;kind:'heat'|'toxic';offset:number}
export interface LevelMap {id:MapId;chunks:typeof CHUNKS;obstacles:Obstacle[];gates:Point[];hazards:Hazard[]}
export function createLevelMap(id:MapId='yard'):LevelMap {
 if(id==='yard')return {id,chunks:CHUNKS,obstacles:OBSTACLES,gates:SPAWN_GATES,hazards:[]};
 const names=id==='foundry'?['废铁堆场','一号熔炉','二号熔炉','废料回收','冷却廊道','铸造入口','传送车间','旧发电站','加工区','炉渣库','装运仓','南门']:['样本收容','培养舱 A','培养舱 B','冷库','西实验室','消毒通道','检验大厅','孵化室','废液池','应急仓','隔离室','撤离站'];
 const chunks=CHUNKS.map((c,i)=>({...c,name:names[i]}));const obstacles:Obstacle[]=[];
 chunks.forEach((c,i)=>{
  const lab=id==='laboratory';const flip=i%2===0?1:-1;
  obstacles.push(prop(`${id}-${i}-0`,lab?'container':i%3===0?'car':'container',c.x+flip*60,c.y+105,lab?230:260));
  obstacles.push(prop(`${id}-${i}-1`,lab?'barricade':'crates',c.x-flip*(lab?85:135),c.y-130,lab?210:100));
  if(lab||i%2===0)obstacles.push(prop(`${id}-${i}-2`,lab?'crates':'barricade',c.x+flip*160,c.y-100,lab?100:155));
 });
 const hazards:Hazard[]=id==='foundry'?[{x:-620,y:240,radius:64,kind:'heat',offset:0},{x:580,y:-240,radius:64,kind:'heat',offset:4},{x:300,y:0,radius:58,kind:'heat',offset:2}]:[{x:-600,y:0,radius:72,kind:'toxic',offset:0},{x:600,y:0,radius:72,kind:'toxic',offset:3},{x:0,y:460,radius:65,kind:'toxic',offset:6},{x:0,y:-460,radius:65,kind:'toxic',offset:2}];
 return {id,chunks,obstacles,gates:SPAWN_GATES,hazards};
}
export function hazardPhase(time:number,h:Hazard):'off'|'warning'|'active'{const t=(time+h.offset)%10;return t<5?'off':t<7?'warning':'active';}
export const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
function closest(p:Point,a:Point,b:Point):Point {
 const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);
 return {x:a.x+dx*t,y:a.y+dy*t};
}
function contact(p:Point,o:Obstacle):{inside:boolean;distance:number;point:Point} {
 let inside=true,dist=Infinity,point=o.hull[0];
 for(let i=0;i<o.hull.length;i++){
  const a=o.hull[i],b=o.hull[(i+1)%o.hull.length];
  if((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x)<0)inside=false;
  const q=closest(p,a,b),d=Math.hypot(p.x-q.x,p.y-q.y);if(d<dist){dist=d;point=q;}
 }
 return {inside,distance:dist,point};
}
export function isFree(p:Point,radius:number,obstacles=OBSTACLES):boolean {
 if(Math.abs(p.x)>MAP.width/2-radius||Math.abs(p.y)>MAP.height/2-radius)return false;
 return !obstacles.some(o=>{const c=contact(p,o);return c.inside||c.distance<radius-.001;});
}
/** Short substeps plus circle/polygon projection prevent high-speed dash tunnelling. */
export function moveCircle(p:Point,dx:number,dy:number,radius:number,obstacles=OBSTACLES):Point {
 const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/Math.min(8,radius*.5)));let result={...p};
 for(let s=0;s<steps;s++){
  result.x=clamp(result.x+dx/steps,-MAP.width/2+radius,MAP.width/2-radius);
  result.y=clamp(result.y+dy/steps,-MAP.height/2+radius,MAP.height/2-radius);
  for(let iteration=0;iteration<4;iteration++){
   let changed=false;
   for(const o of obstacles){
    // Broad phase around the full art bounds includes the convex footprint.
    if(Math.abs(result.x-o.x)>o.width*.6+radius||Math.abs(result.y-o.y)>o.height*.6+radius)continue;
    const c=contact(result,o);if(!c.inside&&c.distance>=radius)continue;
    let nx=result.x-c.point.x,ny=result.y-c.point.y;
    if(c.distance<1e-7){nx=c.point.x-o.x;ny=c.point.y-o.y;}
    else if(c.inside){nx=-nx;ny=-ny;}
    const len=Math.hypot(nx,ny)||1,depth=c.inside?radius+c.distance:radius-c.distance;
    result.x+=nx/len*(depth+.002);result.y+=ny/len*(depth+.002);changed=true;
   }
   if(!changed)break;
  }
  result.x=clamp(result.x,-MAP.width/2+radius,MAP.width/2-radius);result.y=clamp(result.y,-MAP.height/2+radius,MAP.height/2-radius);
 }
 return result;
}
/** Earliest swept circle hit: convex interior + edge capsules, with rounded corners. */
export function wallHit(a:Point,b:Point,radius=0,obstacles=OBSTACLES):{t:number;obstacle:Obstacle}|null {
 let result:{t:number;obstacle:Obstacle}|null=null;const vx=b.x-a.x,vy=b.y-a.y,v2=vx*vx+vy*vy;
 for(const o of obstacles){
  if(Math.max(a.x,b.x)+radius<o.x-o.width*.6||Math.min(a.x,b.x)-radius>o.x+o.width*.6||Math.max(a.y,b.y)+radius<o.y-o.height*.6||Math.min(a.y,b.y)-radius>o.y+o.height*.6)continue;
  let first=Infinity,enter=0,exit=1,possible=true;
  const initial=contact(a,o);if(initial.inside||initial.distance<radius)first=0;
  for(let i=0;i<o.hull.length;i++){
   const p=o.hull[i],q=o.hull[(i+1)%o.hull.length],ex=q.x-p.x,ey=q.y-p.y,len=Math.hypot(ex,ey);
   const start=ex*(a.y-p.y)-ey*(a.x-p.x),change=ex*vy-ey*vx;
   if(Math.abs(change)<1e-10){if(start<0)possible=false;}
   else{const t=-start/change;if(change>0)enter=Math.max(enter,t);else exit=Math.min(exit,t);}
   if(radius>0&&Math.abs(change)>1e-10){
    for(const sign of [-1,1]){
     const t=(sign*radius*len-start)/change;
     const along=((a.x+vx*t-p.x)*ex+(a.y+vy*t-p.y)*ey)/(len*len);
     if(t>=0&&t<=1&&along>=0&&along<=1)first=Math.min(first,t);
    }
   }
   if(radius>0&&v2>1e-10){
    const px=a.x-p.x,py=a.y-p.y,dot=px*vx+py*vy,discriminant=dot*dot-v2*(px*px+py*py-radius*radius);
    if(discriminant>=0){const t=(-dot-Math.sqrt(discriminant))/v2;if(t>=0&&t<=1)first=Math.min(first,t);}
   }
  }
  if(possible&&enter<=exit&&enter<=1&&exit>=0)first=Math.min(first,Math.max(0,enter));
  if(first<=1&&(!result||first<result.t))result={t:first,obstacle:o};
 }
 return result;
}
/** Cached, radius-aware reverse BFS. All enemies of one size share the player's flow field. */
export class Navigation {
 private obstacles:Obstacle[];
 constructor(obstacles:Obstacle[]=OBSTACLES){this.obstacles=obstacles;}
 readonly cell=40;readonly columns=MAP.width/this.cell;readonly rows=MAP.height/this.cell;
 private fields=new Map<number,{free:Uint8Array;distance:Int32Array;edges:Uint8Array;goal:number}>();
 private index(p:Point):number {return clamp(Math.floor((p.y+MAP.height/2)/this.cell),0,this.rows-1)*this.columns+clamp(Math.floor((p.x+MAP.width/2)/this.cell),0,this.columns-1);}
 private point(index:number):Point {return {x:(index%this.columns+.5)*this.cell-MAP.width/2,y:(Math.floor(index/this.columns)+.5)*this.cell-MAP.height/2};}
 private field(radius:number,target:Point){
  let f=this.fields.get(radius);const count=this.columns*this.rows;
  if(!f){const free=new Uint8Array(count);for(let i=0;i<count;i++)free[i]=Number(isFree(this.point(i),radius+2,this.obstacles));const edges=new Uint8Array(count),dirs=[[1,0],[-1,0],[0,1],[0,-1]];
   for(let i=0;i<count;i++)if(free[i])for(let k=0;k<4;k++){
    const [dx,dy]=dirs[k],x=i%this.columns+dx,y=Math.floor(i/this.columns)+dy,n=y*this.columns+x;
    if(x>=0&&y>=0&&x<this.columns&&y<this.rows&&free[n]&&!wallHit(this.point(i),this.point(n),radius+1,this.obstacles))edges[i]|=1<<k;
   }
   f={free,distance:new Int32Array(count),edges,goal:-1};this.fields.set(radius,f);}
  let goal=this.index(target);
  if(!f.free[goal]){let best=Infinity;for(let i=0;i<count;i++)if(f.free[i]){const p=this.point(i),d=(p.x-target.x)**2+(p.y-target.y)**2;if(d<best){best=d;goal=i;}}}
  if(f.goal===goal)return f;
  f.goal=goal;f.distance.fill(-1);f.distance[goal]=0;const queue=[goal];
  for(let head=0;head<queue.length;head++){
   const i=queue[head],x=i%this.columns,y=Math.floor(i/this.columns);
   const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
   for(let k=0;k<4;k++){
    if(!(f.edges[i]&(1<<k)))continue;const [dx,dy]=dirs[k],nx=x+dx,ny=y+dy,n=ny*this.columns+nx;if(nx<0||ny<0||nx>=this.columns||ny>=this.rows||!f.free[n]||f.distance[n]>=0)continue;
    f.distance[n]=f.distance[i]+1;queue.push(n);
   }
  }
  return f;
 }
 direction(position:Point,target:Point,radius:number):Point {
  if(!wallHit(position,target,radius,this.obstacles))return target;
  const size=radius<=20?20:radius<=32?32:46,f=this.field(size,target),index=this.index(position),x=index%this.columns,y=Math.floor(index/this.columns);
  let best=Infinity,result=position;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const nx=x+dx,ny=y+dy,n=ny*this.columns+nx;if(nx<0||ny<0||nx>=this.columns||ny>=this.rows||!f.free[n]||f.distance[n]<0)continue;
   const q=this.point(n);if(wallHit(position,q,radius,this.obstacles))continue;
   const score=f.distance[n]*this.cell+Math.hypot(q.x-position.x,q.y-position.y)*.4;
   if(score<best){best=score;result=q;}
  }
  return result;
 }
}
