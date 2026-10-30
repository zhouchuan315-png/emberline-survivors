import { Color, Graphics, Layers, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { CombatEvent } from './core/Simulation';

interface Burst { node:Node; sprite:Sprite; age:number; life:number; frames:SpriteFrame[]; start:number; count:number; size:number; ghost:boolean }
interface Spark { x:number; y:number; vx:number; vy:number; age:number; life:number; size:number; ink:string }
interface Ring { x:number; y:number; age:number; life:number; radius:number; ink:string; spokes:boolean }
interface Arc {points:Array<{x:number;y:number}>;age:number;life:number;reduced:boolean}
interface GeneratedChain { nodes:Node[]; age:number; life:number; reduced:boolean }
interface PowerFrames { blast?:SpriteFrame[]; chain?:SpriteFrame[] }
const tint=(hex:string,alpha=255)=>{const c=new Color();Color.fromHEX(c,hex);c.a=alpha;return c;};

/** Bounded cosmetic layer. Uses its own clock, never the rules' random generator. */
export class CombatVfx {
  readonly root:Node;
  private paint:Graphics;
  private bursts:Burst[]=[];
  private sparks:Spark[]=[];
  private rings:Ring[]=[];
  private arcs:Arc[]=[];
  private generatedChains:GeneratedChain[]=[];
  private counts:Record<string,number>={};
  private frameChanges=0;
  constructor(parent:Node,private frames:SpriteFrame[],private skillFrames?:SpriteFrame[],private bossFrames?:SpriteFrame[],private powerFrames?:PowerFrames) {
    this.root=this.node('Combat-VFX',parent,1280,800);
    this.paint=this.node('Sparks-and-shockwaves',this.root,1280,800).addComponent(Graphics);
  }
  private node(name:string,parent:Node,w:number,h:number):Node {
    const n=new Node(name);n.layer=Layers.Enum.UI_2D;parent.addChild(n);n.addComponent(UITransform).setContentSize(w,h);return n;
  }
  private count(name:string):void {this.counts[name]=(this.counts[name]||0)+1;}
  private burst(row:number,x:number,y:number,size:number,life:number,angle=0,frames=this.frames,start=row*4,count=4):void {
    if(this.bursts.length>=64){this.bursts.shift()!.node.destroy();}
    const n=this.node('Flipbook-VFX',this.root,size,size);n.setPosition(x,y);n.angle=angle*180/Math.PI;
    const sprite=n.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=frames[start];
    this.bursts.push({node:n,sprite,age:0,life,frames,start,count,size,ghost:false});
  }
  private spray(x:number,y:number,n:number,speed:number,ink:string,angle?:number):void {
    for(let i=0;i<n;i++){
      const a=angle===undefined?i*2.39996:angle+(i/(n-1||1)-.5)*1.9;
      const v=speed*(.4+((i*7)%11)/12),life=.19+(i%4)*.075;
      this.sparks.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v+20,age:0,life,size:1.5+i%3,ink});
    }
    if(this.sparks.length>280)this.sparks.splice(0,this.sparks.length-280);
  }
  private ring(x:number,y:number,radius:number,ink:string,life=.45,spokes=false):void {
    this.rings.push({x,y,age:0,life,radius,ink,spokes});
    if(this.rings.length>24)this.rings.shift();
  }
  event(e:CombatEvent,reduced:boolean,muzzle?:{x:number;y:number}):void {
    this.count(e.type);const x=e.x,y=e.y+43;
    switch(e.type){
      case 'fire':
        this.burst(0,muzzle?.x??x+Math.cos(e.angle)*36,muzzle?.y??y+Math.sin(e.angle)*23,reduced?86:112,.14,e.angle);
        this.spray(x,y,2,65,'#e9b34f',e.angle-Math.PI*.65);break;
      case 'impact':
        this.burst(1,x,y,e.kind==='boss'?112:86,.24,e.angle);
        this.spray(x,y,reduced?3:7,160,'#ffd385',e.angle);break;
      case 'death':
        if(e.detonated)break; // Self-detonation already owns its smoke and debris.
        this.burst(2,x,e.y+15,e.kind==='boss'?204:e.kind==='brute'?136:104,.46);
        this.spray(x,y,reduced?4:13,130,'#b1c57c');
        if(e.kind==='boss'){this.ring(x,e.y,190,'#eeb559',.8,true);this.spray(x,y,26,230,'#ffc45a');}break;
      case 'attack':
        this.ring(x,e.y,e.kind==='boss'?78:38,'#e78a62',.24);
        this.spray(x+Math.cos(e.angle)*22,y,4,120,'#d99a71',e.angle);break;
      case 'hurt':this.spray(x,y,reduced?5:12,165,'#f58b72');break;
      case 'dash':
        this.burst(3,x,e.y+5,86,.4);this.spray(x,e.y,12,140,'#f4c365',e.angle+Math.PI);break;
      case 'upgrade':
        this.ring(x,e.y,125,'#80e5c2',.75,true);this.ring(x,e.y,90,'#ffe09a',.5);
        this.spray(x,e.y+10,reduced?10:24,150,'#9ae8c6');break;
      case 'pulse':
        this.skillBurst(1,x,e.y+12,220,.5);
        this.ring(x,e.y,e.amount||130,'#a0f4dc',.48,true);
        this.ring(x,e.y,(e.amount||130)*.84,'#5acbaa',.4);this.spray(x,e.y,18,180,'#a0f4dc');break;
      case 'reload':
        this.ring(x,e.y+8,34,'#f0c86c',.32);
        this.spray(x,e.y+12,5,75,'#f0c86c');break;
      case 'reloadComplete':
        this.ring(x,e.y+8,58,'#8de0b5',.38);
        this.spray(x,e.y+12,8,110,'#8de0b5');break;
      case 'frost':this.skillBurst(0,x,y,100,.35);break;
      case 'shatter':this.skillBurst(0,x,e.y+18,(e.amount||100)*2,.42);this.spray(x,y,reduced?5:14,170,'#94eaff');break;
      case 'ricochet':this.spray(x,y,reduced?2:5,120,'#b8fff0',e.angle);break;
      case 'shieldHit':this.spray(x,y,reduced?4:9,100,'#91dafa');break;
      case 'markBurst':this.burst(1,x,y,130,.26);this.spray(x,y,reduced?4:10,140,'#ffdc83');break;
      case 'heal':this.skillBurst(2,x,y,110,.55);break;
      case 'explosion':
        // The hit already happened: start at the fireball, then play the authored decay.
        if(this.powerFrames?.blast)this.burst(0,x,e.y+25,(e.amount||100)*2.4,.55,0,this.powerFrames.blast,4,12);
        else this.skillBurst(3,x,e.y+25,210,.55);
        this.ring(x,e.y,e.amount||100,'#f6b361',.45);this.spray(x,y,reduced?4:10,180,'#f6b361');break;
      case 'summon':this.ring(x,e.y,100,'#c798d9',.6,true);break;
      case 'blast':
        if(this.powerFrames?.blast)this.powerBurst(this.powerFrames.blast,x,e.y+20,(e.amount||100)*2.4,.48);
        else this.skillBurst(3,x,e.y+20,(e.amount||100)*1.65,.38);
        this.ring(x,e.y,e.amount||100,'#ffc36b',.36);this.spray(x,y,reduced?4:12,210,'#ffcf77');break;
      case 'chain':
        if(e.points){
          if(this.powerFrames?.chain)this.generatedChain(e.points,reduced);
          else {this.arcs.push({points:e.points.map(p=>({x:p.x,y:p.y+43})),age:0,life:.22,reduced});if(this.arcs.length>16)this.arcs.shift();}
        }
        break;
      case 'awakening':
        // HeroAura owns the following light and the activation wave.
        break;
      case 'heroPower':
        this.ring(x,e.y,e.amount||100,e.ink||'#93e6bc',.5,true);
        this.skillBurst(1,x,e.y+12,(e.amount||100)*1.5,.4);break;
      case 'frenzy':
        break;
      case 'bossArrival':this.ring(x,e.y,e.bossTier==='elite'?130:210,'#ff5965',1,true);break;
      case 'bossPhase':this.ring(x,e.y,170,'#f4c17c',.8,true);this.spray(x,y,reduced?8:22,160,'#eeb776');break;
      case 'bossCast':this.spray(x,y,reduced?4:8,100,'#eab963',e.angle);break;
      case 'bossSlam':this.bossBurst(0,x,e.y,(e.amount||120)*2.1,.5);break;
      case 'bossFire':this.bossBurst(1,x,e.y+40,(e.amount||60)*2.6,.65);break;
      case 'bossAcid':this.bossBurst(2,x,e.y,(e.amount||60)*2.4,.65);break;
      case 'bossSummon':this.bossBurst(3,x,e.y+20,210,.7);break;
    }
  }
  private skillBurst(row:number,x:number,y:number,size:number,life:number):void{
    if(!this.skillFrames)return;this.burst(0,x,y,size,life,0,this.skillFrames,row*4,4);
  }
  private bossBurst(row:number,x:number,y:number,size:number,life:number):void {
    if(!this.bossFrames)return;this.burst(0,x,y,size,life,0,this.bossFrames,row*4,4);
  }
  private powerBurst(frames:SpriteFrame[],x:number,y:number,size:number,life:number,angle=0):void {
    if(!frames.length)return;this.burst(0,x,y,size,life,angle,frames,0,frames.length);
  }
  private generatedChain(points:Array<{x:number;y:number}>,reduced:boolean):void {
    const frames=this.powerFrames?.chain;if(!frames||points.length<2)return;
    const nodes:Node[]=[];const translated=points.map(p=>({x:p.x,y:p.y+43}));
    for(let i=1;i<translated.length;i++){
      const a=translated[i-1],b=translated[i],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
      const n=this.node('Generated-Chain-Lightning',this.root,len,Math.max(34,Math.min(112,len*.28)));
      n.setPosition((a.x+b.x)/2,(a.y+b.y)/2);n.angle=Math.atan2(dy,dx)*180/Math.PI;
      const sprite=n.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=frames[0];nodes.push(n);
    }
    this.generatedChains.push({nodes,age:0,life:0.34,reduced});
    if(this.generatedChains.length>16){const old=this.generatedChains.shift()!;for(const n of old.nodes)n.destroy();}
  }
  footstep(x:number,y:number):void {this.burst(3,x,y,48,.3);}
  ghost(frame:SpriteFrame,x:number,y:number,size:number,facing:number):void {
    if(this.bursts.length>=64)return;
    const n=this.node('Dash-afterimage',this.root,size,size);n.setPosition(x,y);n.setScale(facing,1,1);
    const sprite=n.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=frame;sprite.color=tint('#ffc36c',110);
    this.bursts.push({node:n,sprite,age:0,life:.2,frames:[frame],start:0,count:1,size,ghost:true});this.count('afterimage');
  }
  update(dt:number):void {
    for(const b of this.bursts){
      b.age+=dt;const t=Math.min(1,b.age/b.life);
      if(b.ghost)b.sprite.color=tint('#ffc36c',Math.round(110*(1-t)));
      else {
        const index=Math.min(b.count-1,Math.floor(t*b.count));
        const frame=b.frames[b.start+index];
        if(b.sprite.spriteFrame!==frame){b.sprite.spriteFrame=frame;this.frameChanges++;}
        b.sprite.color=tint('#ffffff',Math.round(255*(t<.65?1:(1-t)/.35)));
      }
      if(t>=1)b.node.destroy();
    }
    this.bursts=this.bursts.filter(b=>b.age<b.life);
    for(const chain of this.generatedChains){
      chain.age+=dt;const t=Math.min(1,chain.age/chain.life),index=Math.min(15,Math.floor(t*16));
      const frames=this.powerFrames?.chain;
      if(frames)for(const n of chain.nodes){const sprite=n.getComponent(Sprite);if(sprite){sprite.spriteFrame=frames[index];sprite.color=tint('#ffffff',Math.round(255*(t<.7?1:(1-t)/.3)));}}
      if(t>=1)for(const n of chain.nodes)n.destroy();
    }
    this.generatedChains=this.generatedChains.filter(c=>c.age<c.life);
    const g=this.paint;g.clear();
    for(const arc of this.arcs){
      arc.age+=dt;const alpha=Math.max(0,1-arc.age/arc.life);
      for(let k=1;k<arc.points.length;k++){
        const a=arc.points[k-1],b=arc.points[k],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
        for(const core of [false,true]){
          g.strokeColor=tint(core?'#effffc':'#72dcda',Math.round(alpha*(core?255:170)));g.lineWidth=core?2:6;
          g.moveTo(a.x,a.y);
          for(let i=1;i<=6;i++){const t=i/6,bend=i===6?0:arc.reduced?0:(i%2===0?-1:1)*7;
            g.lineTo(a.x+dx*t-dy/len*bend,a.y+dy*t+dx/len*bend);}
          g.stroke();
        }
      }
    }
    this.arcs=this.arcs.filter(a=>a.age<a.life);
    for(const p of this.sparks){
      p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy-=150*dt;
      const a=Math.max(0,1-p.age/p.life);
      g.strokeColor=tint(p.ink,Math.round(a*255));g.lineWidth=p.size;
      g.moveTo(p.x-p.vx*.024,p.y-p.vy*.024);g.lineTo(p.x,p.y);g.stroke();
      g.fillColor=tint('#fff2c8',Math.round(a*220));g.circle(p.x,p.y,p.size*.45);g.fill();
    }
    this.sparks=this.sparks.filter(p=>p.age<p.life);
    for(const r of this.rings){
      r.age+=dt;const t=Math.min(1,r.age/r.life),ease=1-Math.pow(1-t,3),radius=8+ease*r.radius;
      g.strokeColor=tint(r.ink,Math.round((1-t)*220));g.lineWidth=1+(1-t)*3;
      g.ellipse(r.x,r.y,radius,radius*.57);g.stroke();
      if(r.spokes)for(let i=0;i<12;i++){
        const a=i*Math.PI/6,inner=radius*.9;
        g.moveTo(r.x+Math.cos(a)*inner,r.y+Math.sin(a)*inner*.57);
        g.lineTo(r.x+Math.cos(a)*(radius+12*(1-t)),r.y+Math.sin(a)*(radius+12*(1-t))*.57);g.stroke();
      }
    }
    this.rings=this.rings.filter(r=>r.age<r.life);
    this.paint.node.setSiblingIndex(this.root.children.length-1);
  }
  snapshot():object {return {activeBursts:this.bursts.length,activeSparks:this.sparks.length,activeRings:this.rings.length,activeArcs:this.arcs.length,activeGeneratedChains:this.generatedChains.length,generatedPowers:{blast:!!this.powerFrames?.blast,chain:!!this.powerFrames?.chain},frameChanges:this.frameChanges,events:{...this.counts}};}
  clear():void {for(const b of this.bursts)b.node.destroy();for(const c of this.generatedChains)for(const n of c.nodes)n.destroy();this.bursts=[];this.sparks=[];this.rings=[];this.arcs=[];this.generatedChains=[];this.counts={};this.frameChanges=0;this.paint.clear();}
}
