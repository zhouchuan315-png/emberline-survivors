import { _decorator, Component, Node, Canvas, Camera, UITransform, Graphics, Color, Label, Sprite,
  SpriteFrame, resources, view, ResolutionPolicy, Layers, input, Input, EventKeyboard, KeyCode,
  EventTouch, Vec2, Rect, Size, AudioClip, AudioSource, UIOpacity, EffectAsset, game, Game, sys, screen } from 'cc';
import { Simulation, Phase, EnemyKind, CombatEvent, UPGRADES } from './core/Simulation';
import { ARENAS, arenaById, ENEMY_NAMES, COIN_REWARD_SCALE } from './core/Campaign';
import { PROFILE_KEY, parseProfile, HERO_TALENTS, START_ITEMS, purchase, talentState, purchaseHeroTalent, equipItem, beginRun, creditRun, ProfileStore, type Profile } from './core/Progression';
import { CombatVfx } from './CombatVfx';
import { HeroAura } from './HeroAura';
import { ProjectileView } from './ProjectileView';
import { MineView } from './MineView';
import { SceneView } from './SceneView';
import { MAP, hazardPhase } from './core/SceneMap';
import { RunCycle } from './core/RunCycle';
import { HEROES, heroById, type HeroId } from './core/Characters';
import { BOSSES, barrageAngles, bossForMap, bossSkillName, bossName, ELITE_NAMES, type BossTier, type BossId } from './core/BossEncounter';
import { TALENT_BRANCHES } from './core/HeroTalents';
import { HERO_MOTION_MUZZLES } from './core/HeroMotionAnchors';
const { ccclass } = _decorator;
const C = { ink:'#101818', panel:'#172221', border:'#39423a', muted:'#91a092', white:'#eee9d6',
  orange:'#edaa4a', green:'#98bd79', red:'#e47862', teal:'#6bc9ab' };
const color=(hex:string,alpha=255) => {const c=new Color();Color.fromHEX(c,hex);c.a=alpha;return c;};
interface Actor { root:Node; body:Node; sprite:Sprite; base:number; name:string; clock:number;
  attack:number; dying:number; frame:number; facing:number; step:number; moving:boolean }
interface DamageNumber { label:Label; x:number; y:number; age:number; life:number; ink:string }

@ccclass('Emberline')
export class Emberline extends Component {
  private sim = new Simulation(); private canvas!:Node; private world!:Node; private hud!:Node; private overlay!:Node;
  private sceneMap!:SceneView; private cameraPosition={x:0,y:0};
  private floor!:Node; private fx!:Graphics; private hudPaint!:Graphics;
  private actors=new Map<number,Actor>(); private texts=new Map<number,Label>();private player!:Actor;
  private frames=new Map<string,SpriteFrame>(); private sounds=new Map<string,AudioClip>();private audio!:AudioSource;
  private clips=new Map<string,SpriteFrame[]>();private combatFx!:CombatVfx;private heroAura!:HeroAura;
  private projectileView!:ProjectileView;
  private mineView!:MineView;
  private runCycle=new RunCycle();private playerClip='vanguard';
  private dying:Actor[]=[];private damageNumbers:DamageNumber[]=[];private ghostClock=0;
  private animationChanges=0;private actionCounts:Record<string,number>={};private visualClock=0;
  private deathOverlayDelay=0;
  private keys=new Set<number>();private stick=new Vec2();private touchId:number|null=null;private stickOrigin=new Vec2();
  private stickPaint!:Graphics;private stickBase!:Node;private stickKnob!:Node;
  private phase:Phase|'loading'='loading';private ready=false;private muted=false;private reducedMotion=false;private W=1280;private H=800;private scale=1;
  private hudSize={w:1280,h:800};
  private hpLabel!:Label;private timeLabel!:Label;private killLabel!:Label;private levelLabel!:Label;private waveLabel!:Label;
  private dashLabel!:Label;private bannerLabel!:Label;private bossLabel!:Label;
  private ammoLabel!:Label;private ammoStatus!:Label;private weaponLabel!:Label;private reloadButtonLabel!:Label;
  private reloadHint!:Label;private reloadFace!:Sprite;private dashFace!:Sprite;
  private bannerPlate!:Node;private bossPlate!:Node;private bossSkillLabel!:Label;
  private hudGeometry={health:{x:0,y:0,w:0},xp:{x:0,y:0,w:0},ammo:{x:0,y:0,w:0},boss:{x:0,y:0,w:0}};
  private combatView={top:248,bottom:-296};
  private warningRoot!:Node;private warningPaint!:Graphics;private warningFade!:UIOpacity;private warningTitle!:Label;private warningDetail!:Label;
  private coinLabel!:Label;private profile:Profile=parseProfile(null);private runId='';
  private profileStore=new ProfileStore(sys.localStorage,task=>typeof navigator!=='undefined'&&navigator.locks?navigator.locks.request(PROFILE_KEY,task):Promise.resolve().then(task));
  private starting=false;private creditedCoins=-1;private settled=false;private saving=false;
  private storageHandler=(event:StorageEvent)=>{if(event.key===PROFILE_KEY){this.refreshProfile();if(this.ready&&this.sim.phase==='menu')this.showPhase();}};
  private campView:'home'|'maps'|'shop'|'heroes'='home';private shopTab:'talents'|'items'='talents';private shopPage=0;private shopNotice='';private saveWarning='';private talentHero:HeroId='vanguard';private talentBranch:0|1=0;private talentFocus='arsenal';
  private menuBest=0;private bestKills=0;private lastShot=0;private lastHit=0;private lastPick=0;private lastPowerSound=-1;private uiClock=0;
  private buttons:Array<{node:Node;hover:boolean}>=[];
  private buildGuide=false;
  private hideHandler=()=>{if(this.sim.phase==='playing'){this.sim.pause();this.keys.clear();this.stick.set(0,0);this.touchId=null;}};

  onLoad():void { this.initialize().catch(error=>console.error('Emberline initialization failed',error)); }
  private async initialize():Promise<void> {
    this.muted=sys.localStorage.getItem('emberline-muted')==='1';
    this.reducedMotion=sys.localStorage.getItem('emberline-reduced-motion')==='1';
    this.menuBest=Number(sys.localStorage.getItem('emberline-best')||0);this.bestKills=Number(sys.localStorage.getItem('emberline-kills')||0);
    try{this.profile=(await this.profileStore.transact(()=>{})).profile;}catch{this.saveWarning='本机存档不可用，当前进度仅保留到关闭页面';}
    const size=screen.windowSize;const portrait=size.height>size.width;
    this.W=portrait?800:1280;this.H=portrait?1280:800;this.scale=portrait?1.3:1;
    // SHOW_ALL can expose additional world beyond the design frame on tall / wide windows.
    // Keep menus in their authored frame, but anchor combat controls to the visible edges.
    const ratio=size.width/size.height;
    this.hudSize={w:Math.max(this.W,this.H*ratio),h:Math.max(this.H,this.W/ratio)};
    view.setDesignResolutionSize(this.W,this.H,ResolutionPolicy.SHOW_ALL);
    this.canvas=this.make('Canvas',this.node,this.W,this.H);this.canvas.setPosition(this.W/2,this.H/2);
    const cv=this.canvas.addComponent(Canvas);const camNode=new Node('UICamera');camNode.layer=Layers.Enum.UI_2D;
    this.canvas.addChild(camNode);camNode.setPosition(0,0,1000);const camera=camNode.addComponent(Camera);
    camera.projection=Camera.ProjectionType.ORTHO;camera.orthoHeight=this.H/2;camera.near=1;camera.far=2000;
    camera.clearFlags=Camera.ClearFlag.SOLID_COLOR;camera.clearColor=color(C.ink);camera.visibility=Layers.Enum.UI_2D;
    cv.cameraComponent=camera;
    this.audio=this.node.addComponent(AudioSource);
    this.floor=this.make('Backdrop',this.canvas,this.W,this.H);this.rect(this.floor,0,0,this.W,this.H,C.ink);
    this.world=this.make('Battlefield',this.canvas,1280,700);this.world.setScale(this.scale,this.scale,1);
    if(portrait)this.world.setPosition(0,65);
    this.fx=this.make('Effects',this.world,1280,700).addComponent(Graphics);
    this.hud=this.make('HUD',this.canvas,this.W,this.H);this.overlay=this.make('Overlay',this.canvas,this.W,this.H);
    this.text(this.overlay,'正在建立撤离信号…',0,0,25,C.orange,this.W-80);
    input.on(Input.EventType.KEY_DOWN,this.onKeyDown,this);input.on(Input.EventType.KEY_UP,this.onKeyUp,this);
    input.on(Input.EventType.TOUCH_START,this.onTouchStart,this);input.on(Input.EventType.TOUCH_MOVE,this.onTouchMove,this);
    input.on(Input.EventType.TOUCH_END,this.onTouchEnd,this);input.on(Input.EventType.TOUCH_CANCEL,this.onTouchEnd,this);
    game.on(Game.EVENT_HIDE,this.hideHandler);
    if(typeof window!=='undefined')window.addEventListener('storage',this.storageHandler);
    let auraEffect!:EffectAsset;
    try {
      auraEffect=await new Promise<EffectAsset>((resolve,reject)=>resources.load('shaders/hero-aura',EffectAsset,(err,asset)=>err?reject(err):resolve(asset)));
      await Promise.all(['arena','zombie','brute'].map(name=>new Promise<void>((resolve,reject)=>{
        resources.load(`art/${name}/spriteFrame`,SpriteFrame,(err,asset)=>{if(err)reject(err);else{this.frames.set(name,asset);resolve();}});
      })));
      await Promise.all(['ground','container','barricade','crates','car'].map(name=>new Promise<void>((resolve,reject)=>{
        resources.load(`scene/${name}/spriteFrame`,SpriteFrame,(err,asset)=>{if(err)reject(err);else{this.frames.set('scene/'+name,asset);resolve();}});
      })));
      await Promise.all(['panel','secondary','primary','card','health','reload','dash','pause'].map(name=>new Promise<void>((resolve,reject)=>{
        resources.load(`ui/${name}/spriteFrame`,SpriteFrame,(err,asset)=>{if(err)reject(err);else{this.frames.set('ui/'+name,asset);resolve();}});
      })));
      await Promise.all(['available','selected','locked','maxed','detail','branch','detail-locked','action'].map(name=>new Promise<void>((resolve,reject)=>{
        resources.load(`ui/talent/${name}/spriteFrame`,SpriteFrame,(err,asset)=>{if(err)reject(err);else{this.frames.set('ui/talent/'+name,asset);resolve();}});
      })));
      await Promise.all(['zombie','brute','effects'].map(name=>new Promise<void>((resolve,reject)=>{
        resources.load(`animation/${name}/spriteFrame`,SpriteFrame,(err,atlas)=>{
          if(err){reject(err);return;}
          const frames:SpriteFrame[]=[];
          for(let i=0;i<16;i++){
            const f=new SpriteFrame();f.texture=atlas.texture;f.rect=new Rect((i%4)*256,Math.floor(i/4)*256,256,256);
            f.originalSize=new Size(256,256);f.offset=new Vec2(0,0);f.packable=false;frames.push(f);
          }
          this.clips.set(name,frames);resolve();
        });
      })));
      await Promise.all(['shot','hit','pickup','select','dash'].map(name=>new Promise<void>(resolve=>{
        resources.load(`audio/${name}`,AudioClip,(err,asset)=>{if(!err)this.sounds.set(name,asset);resolve();});
      })));
      await Promise.all(['icons-a','icons-b','spitter','bomber','charger','summoner','skills-fx','blast-vfx','chain-vfx','projectile-vfx','mine-vfx','foundry','laboratory'].map(name=>new Promise<void>((resolve,reject)=>{
        resources.load(`expansion/${name}/spriteFrame`,SpriteFrame,(err,atlas)=>{
          if(err){reject(err);return;}this.frames.set('expansion/'+name,atlas);
          if(name==='foundry'||name==='laboratory'){resolve();return;}
          const frames:SpriteFrame[]=[];
          for(let i=0;i<16;i++){const f=new SpriteFrame();f.texture=atlas.texture;f.rect=new Rect(i%4*256,Math.floor(i/4)*256,256,256);f.originalSize=new Size(256,256);f.offset=new Vec2(0,0);f.packable=false;frames.push(f);}
          this.clips.set(name,frames);this.frames.set(name,frames[8]);resolve();
        });
      })));
      await Promise.all(['vanguard','scout','medic','vanguard-run','scout-run','medic-run',
        'vanguard-idle','scout-idle','medic-idle','vanguard-reload','scout-reload','medic-reload',
        'vanguard-fire','scout-fire','medic-fire','warden','furnace','hive','boss-fx'].map(name=>new Promise<void>((resolve,reject)=>{
        resources.load(`roster/${name}/spriteFrame`,SpriteFrame,(err,atlas)=>{
          if(err){reject(err);return;}const frames:SpriteFrame[]=[];
          for(let i=0;i<16;i++){const f=new SpriteFrame();f.texture=atlas.texture;f.rect=new Rect(i%4*256,Math.floor(i/4)*256,256,256);f.originalSize=new Size(256,256);f.offset=new Vec2(0,0);f.packable=false;frames.push(f);}
          this.clips.set(name,frames);this.frames.set(name,frames[8]);resolve();
        });
      })));
      await Promise.all(['vanguard-portrait','scout-portrait','medic-portrait','cover-wide','cover-tall'].map(name=>new Promise<void>((resolve,reject)=>{
        resources.load(`roster/${name}/spriteFrame`,SpriteFrame,(err,asset)=>{if(err)reject(err);else{this.frames.set(name,asset);resolve();}});
      })));
    }catch(err){this.overlay.removeAllChildren();this.text(this.overlay,'素材加载失败，请刷新重试',0,0,24,C.red,this.W-80);console.error(err);return;}
    const bg=this.make('GeneratedArena',this.floor,1280,768);this.sprite(bg,'arena');
    if(portrait){bg.setScale(this.scale,this.scale,1);bg.setPosition(0,65);}
    this.sceneMap=new SceneView(this.world,this.frames);
    this.player=this.actor(this.profile.selectedHero,104);this.player.root.setPosition(0,0);
    this.heroAura=new HeroAura(this.sceneMap.ground,auraEffect);
    this.mineView=new MineView(this.sceneMap.ground,this.clips.get('mine-vfx')!);
    this.projectileView=new ProjectileView(this.world,this.clips.get('projectile-vfx')!);
    this.combatFx=new CombatVfx(this.world,this.clips.get('effects')!,this.clips.get('skills-fx'),this.clips.get('boss-fx'),{
      blast:this.clips.get('blast-vfx'),chain:this.clips.get('chain-vfx')
    });
    this.buildHUD();this.ready=true;this.showPhase();
    // Compact observable state for repeatable QA; no gameplay-changing hooks.
    const host=globalThis as unknown as Record<string,unknown>;
    host.render_game_to_text=()=>JSON.stringify({...this.sim.snapshot(),profile:{coins:this.profile.coins,totalEarned:this.profile.totalEarned,heroTalents:this.profile.heroTalents,legacyRefund:this.profile.legacyRefund,items:{...this.profile.items},equipped:this.profile.equipped,selectedMap:this.profile.selectedMap,selectedHero:this.profile.selectedHero,runs:this.profile.runs,wins:this.profile.wins},campView:this.campView,shopTab:this.shopTab,shopPage:this.shopPage,shopNotice:this.shopNotice,saveWarning:this.saveWarning,coordinateSystem:'x right, y up; stitched world 2400×1440',camera:{...this.cameraPosition},collisionDebug:this.sceneMap.debugVisible,assetsLoaded:this.frames.size+this.clips.size,engine:'Cocos Creator 3.8.6',
      animation:{sheets:this.clips.size,framesPerSheet:16,frameChanges:this.animationChanges,playerFrame:this.player.frame,playerClip:this.playerClip,run:this.runCycle.snapshot(),
        actions:{...this.actionCounts},dying:this.dying.length,actors:Array.from(this.actors.values()).slice(0,8).map(a=>({name:a.name,frame:a.frame,attack:a.attack>0}))},bossAlert:{visible:this.warningRoot.active,opacity:this.warningFade.opacity,title:this.warningTitle.string},vfx:this.combatFx.snapshot(),heroAura:this.heroAura.snapshot()});
    host.emberlineReady=true;
  }
  private make(name:string,parent:Node,w=100,h=100):Node {const n=new Node(name);n.layer=Layers.Enum.UI_2D;parent.addChild(n);n.addComponent(UITransform).setContentSize(w,h);return n;}
  private text(parent:Node,value:string,x:number,y:number,size=20,hex=C.white,width=300,align=Label.HorizontalAlign.CENTER):Label {
    size=this.W<1000?Math.max(this.sim.phase==='menu'?30:24,size*1.16):size;
    const n=this.make('Text',parent,width,size*2.8);n.setPosition(x,y);const l=n.addComponent(Label);l.string=value;l.fontFamily='Arial';
    l.fontSize=size;l.lineHeight=size*1.45;l.color=color(hex);l.horizontalAlign=align;l.verticalAlign=Label.VerticalAlign.CENTER;
    l.overflow=Label.Overflow.SHRINK;l.enableWrapText=true;return l;
  }
  private rect(parent:Node,x:number,y:number,w:number,h:number,hex:string,alpha=255,radius=0):Graphics {
    const n=this.make('Panel',parent,w,h);n.setPosition(x,y);const g=n.addComponent(Graphics);g.fillColor=color(hex,alpha);
    if(radius)g.roundRect(-w/2,-h/2,w,h,radius);else g.rect(-w/2,-h/2,w,h);g.fill();return g;
  }
  private line(g:Graphics,x1:number,y1:number,x2:number,y2:number,hex:string,width=1):void {g.strokeColor=color(hex);g.lineWidth=width;g.moveTo(x1,y1);g.lineTo(x2,y2);g.stroke();}
  private sprite(node:Node,name:string):Sprite {const s=node.addComponent(Sprite);s.sizeMode=Sprite.SizeMode.CUSTOM;s.spriteFrame=this.frames.get(name)!;return s;}
  private icon(parent:Node,index:number,x:number,y:number,size=70,frame?:SpriteFrame):void{
    const n=this.make('SkillIcon:'+index,parent,size,size);n.setPosition(x,y);const s=n.addComponent(Sprite);s.sizeMode=Sprite.SizeMode.CUSTOM;s.spriteFrame=frame||this.clips.get(index<16?'icons-a':'icons-b')![index%16];
  }
  private uiArt(parent:Node,name:string,x:number,y:number,w:number,h:number,sliced=false):Sprite {
    const n=this.make('UI:'+name,parent,w,h);n.setPosition(x,y);const s=this.sprite(n,'ui/'+name);
    if(sliced)s.type=Sprite.Type.SLICED;return s;
  }
  private hudText(parent:Node,value:string,x:number,y:number,size:number,hex:string,width:number,align=Label.HorizontalAlign.CENTER):Label {
    const l=this.text(parent,value,x,y,size,hex,width,align);l.fontSize=size;l.lineHeight=size*1.2;
    l.node.getComponent(UITransform)!.height=size*1.4;l.enableWrapText=false;return l;
  }
  private button(parent:Node,title:string,x:number,y:number,w:number,h:number,callback:()=>void,primary=false):Node {
    if(this.W<1000)h=Math.max(92,h);
    const n=this.make('Button:'+title,parent,w,h);n.setPosition(x,y);
    const face=this.uiArt(n,h>180?'card':primary?'primary':'secondary',0,0,w,h,true);
    const paint=(hover=false)=>{face.color=color(hover?'#ffffff':'#deded4');};paint();
    this.text(n,this.W<1000?title.replace(/\s*\[[^\]]+\]/g,''):title,0,0,h>60?24:19,primary?C.ink:C.white,w-32);
    n.on(Node.EventType.TOUCH_END,()=>{paint();this.sound('select',.35);callback();});
    n.on(Node.EventType.TOUCH_START,()=>{face.color=color('#b4bcb1');});
    n.on(Node.EventType.TOUCH_CANCEL,()=>paint());
    n.on(Node.EventType.MOUSE_ENTER,()=>paint(true));n.on(Node.EventType.MOUSE_LEAVE,()=>paint(false));
    return n;
  }
  private actor(name:string,size:number):Actor {
    const root=this.make('Actor:'+name,this.sceneMap.depth,size,size);const shadow=root.addComponent(Graphics);
    shadow.fillColor=color('#000000',85);shadow.ellipse(0,-2,size*.23,size*.075);shadow.fill();
    const body=this.make('Body',root,size,size);body.setPosition(0,size*.40625);const sprite=this.sprite(body,name);
    sprite.spriteFrame=this.clips.get(name)![8];
    return {root,body,sprite,base:size,name,clock:0,attack:0,dying:-1,frame:8,facing:1,step:-1,moving:false};
  }
  private buildHUD():void {
    for(const child of [...this.hud.children]){child.active=false;child.destroy();}this.hud.removeAllChildren();
    const w=this.hudSize.w,h=this.hudSize.h,mobile=this.W<1000,margin=16,top=h/2-margin;
    // All persistent HUD content stays in two narrow edge bands. Camera framing
    // uses the same clear area so the hero remains visible at the map boundary.
    this.combatView={top:h/2-(mobile?224:152),bottom:-h/2+(mobile?136:104)};
    const healthW=mobile?268:260,healthH=mobile?96:64,healthX=-w/2+margin+healthW/2,healthY=top-healthH/2;
    const health=this.rect(this.hud,healthX,healthY,healthW,healthH,C.ink,222,4).node;health.name='HealthCard';
    this.uiArt(health,'health',-healthW/2+26,mobile?24:12,22,22).color=color(C.green);
    this.hpLabel=this.hudText(health,'100 / 100',-12,mobile?24:12,mobile?28:24,C.white,148);
    this.levelLabel=this.hudText(health,'LV.01',healthW/2-44,mobile?24:12,mobile?20:14,C.teal,64);
    this.hudGeometry.health={x:healthX-healthW/2+18,y:healthY-6,w:healthW-36};
    this.hudGeometry.xp={x:healthX-healthW/2+18,y:healthY-15,w:healthW-36};
    const coins=this.rect(this.hud,healthX,mobile?healthY-32:top-healthH-18,healthW,mobile?28:24,C.ink,210,4).node;coins.name='CoinStrip';
    this.coinLabel=this.hudText(coins,'',0,0,mobile?20:14,C.orange,healthW-20);

    const timerW=mobile?292:248,timerH=healthH,timerX=mobile?50:0,timerY=top-timerH/2;
    const timer=this.rect(this.hud,timerX,timerY,timerW,timerH,C.ink,222,4).node;timer.name='TimerCard';
    this.timeLabel=this.hudText(timer,'00:00',0,mobile?27:11,mobile?32:27,C.white,timerW-28);
    this.waveLabel=this.hudText(timer,'',0,mobile?-3:-17,mobile?22:15,C.orange,timerW-24);
    const pauseW=mobile?96:64,pauseX=w/2-margin-pauseW/2;
    const pause=this.button(this.hud,'',pauseX,top-healthH/2,pauseW,healthH,()=>this.sim.pause());pause.name='PauseButton';
    this.uiArt(pause,'pause',0,mobile?12:0,mobile?30:24,mobile?30:24);
    if(mobile)this.hudText(pause,'暂停',0,-23,22,C.white,80);
    if(mobile){
      this.killLabel=this.hudText(timer,'',0,-31,20,C.muted,timerW-24);
    }else{
      const kill=this.rect(this.hud,pauseX-108,timerY,128,healthH,C.ink,222,4).node;kill.name='KillCard';
      this.hudText(kill,'击杀',0,15,13,C.muted,100);
      this.killLabel=this.hudText(kill,'',0,-10,24,C.white,104);
    }
    const bossW=mobile?624:620,bossH=mobile?80:56,bossX=mobile?-72:0,bossY=top-healthH-12-bossH/2;
    this.bannerPlate=this.rect(this.hud,bossX,bossY,bossW,mobile?48:32,C.ink,218,4).node;this.bannerPlate.name='WaveBanner';
    this.bannerLabel=this.hudText(this.bannerPlate,'',0,0,mobile?24:18,C.orange,bossW-24);
    this.bossPlate=this.rect(this.hud,bossX,bossY,bossW,bossH,C.ink,222,4).node;this.bossPlate.name='BossStrip';
    this.bossLabel=this.hudText(this.bossPlate,'',mobile?0:-152,mobile?23:10,mobile?24:16,C.red,mobile?592:284);
    this.bossSkillLabel=this.hudText(this.bossPlate,'',mobile?0:146,mobile?-23:10,mobile?22:14,C.orange,mobile?592:296);
    this.hudGeometry.boss={x:bossX-bossW/2+16,y:bossY-(mobile?3:16),w:bossW-32};

    const ammoW=260,ammoH=mobile?104:80,ammoX=-w/2+margin+ammoW/2,ammoY=-h/2+margin+ammoH/2;
    const ammo=this.rect(this.hud,ammoX,ammoY,ammoW,ammoH,C.ink,222,4).node;ammo.name='AmmoCard';
    this.weaponLabel=this.hudText(ammo,'自动步枪',0,mobile?32:24,mobile?21:14,C.muted,ammoW-32);
    this.ammoLabel=this.hudText(ammo,'18 / 18',0,mobile?5:1,mobile?32:27,C.white,ammoW-32);this.ammoLabel.node.name='AmmoCount';
    this.ammoStatus=this.hudText(ammo,'',0,mobile?-32:-27,mobile?20:13,C.muted,ammoW-24);
    this.hudGeometry.ammo={x:ammoX-ammoW/2+16,y:ammoY-(mobile?17:16),w:ammoW-32};
    const actionW=mobile?152:132,actionH=mobile?104:80,gap=16,actionY=-h/2+margin+actionH/2,dashX=w/2-margin-actionW/2,reloadX=dashX-actionW-gap;
    const reload=this.button(this.hud,'',reloadX,actionY,actionW,actionH,()=>this.sim.reload());reload.name='ReloadButton';
    this.reloadFace=reload.getChildByName('UI:secondary')!.getComponent(Sprite)!;
    this.uiArt(reload,'reload',mobile?-42:-35,mobile?17:9,mobile?30:24,mobile?30:24);
    this.reloadButtonLabel=this.hudText(reload,'换弹',16,mobile?17:9,mobile?25:19,C.white,actionW-54);
    this.reloadHint=this.hudText(reload,'',0,mobile?-25:-16,mobile?21:13,C.white,actionW-20);
    const dash=this.button(this.hud,'',dashX,actionY,actionW,actionH,()=>{if(this.sim.dash())this.sound('dash',.5);},true);dash.name='DashButton';
    this.dashFace=dash.getChildByName('UI:primary')!.getComponent(Sprite)!;
    this.uiArt(dash,'dash',mobile?-42:-35,mobile?17:9,mobile?32:26,mobile?32:26).color=color('#26322a');
    this.hudText(dash,'冲刺',16,mobile?17:9,mobile?25:19,C.ink,actionW-54);
    this.dashLabel=this.hudText(dash,'',0,mobile?-25:-16,mobile?21:13,C.ink,actionW-20);
    if(!mobile){
      const hint=this.rect(this.hud,0,-h/2+30,300,24,C.ink,180,4).node;hint.name='MovementHint';
      this.hudText(hint,'WASD 移动 · R 换弹 · 空格冲刺',0,0,13,C.muted,288);
    }
    this.hudPaint=this.make('HUD-bars',this.hud,w,h).addComponent(Graphics);
    this.sceneMap.attachMinimap(this.hud,mobile?w/2-margin-64:pauseX-236,mobile?top-healthH-12-128/3:top-32,mobile?2/3:.5);
    this.stickBase=this.make('Joystick',this.hud,150,150);this.stickBase.active=false;
    this.stickPaint=this.stickBase.addComponent(Graphics);this.stickPaint.fillColor=color('#e9e6cc',25);this.stickPaint.circle(0,0,60);this.stickPaint.fill();
    this.stickPaint.strokeColor=color('#e9e6cc',80);this.stickPaint.lineWidth=2;this.stickPaint.circle(0,0,60);this.stickPaint.stroke();
    this.buildBossAlert();
    this.stickKnob=this.make('Joystick-knob',this.stickBase,50,50);const kg=this.stickKnob.addComponent(Graphics);kg.fillColor=color(C.orange,150);kg.circle(0,0,23);kg.fill();
  }
  private buildBossAlert():void {
    this.warningRoot?.destroy();const {w,h}=this.hudSize;
    this.warningRoot=this.make('BossWarning',this.canvas,w,h);this.warningRoot.setSiblingIndex(this.hud.getSiblingIndex());
    this.warningPaint=this.warningRoot.addComponent(Graphics);this.warningFade=this.warningRoot.addComponent(UIOpacity);
    const mobile=this.W<1000,{x,y}=this.bossPlate.position,width=this.bossPlate.getComponent(UITransform)!.width;
    this.warningTitle=this.hudText(this.warningRoot,'',x,y+(mobile?20:13),mobile?28:21,'#ffe7dc',width-24);
    this.warningTitle.node.name='BossWarningTitle';
    this.warningDetail=this.hudText(this.warningRoot,'',x,y-(mobile?20:13),mobile?21:14,'#f7c5b4',width-24);
    this.warningRoot.active=false;
  }
  private renderBossAlert():void {
    const warning=this.sim.bossWarning,{w,h}=this.hudSize;
    const wasVisible=this.warningRoot.active;
    this.warningRoot.active=!!warning&&['playing','paused','upgrade'].includes(this.sim.phase);
    if(wasVisible!==this.warningRoot.active)this.renderHUD();
    if(!warning)return;
    const age=warning.total-warning.remaining,fade=Math.min(1,age/.18,warning.remaining/.45);
    const pulse=this.reducedMotion?.5:(Math.sin(age*Math.PI*2*1.3)+1)/2;
    this.warningFade.opacity=Math.round(255*Math.max(0,fade));
    const g=this.warningPaint;g.clear();
    g.fillColor=color('#ba1825',Math.round(24+pulse*17));g.rect(-w/2,-h/2,w,h);g.fill();
    for(let i=0;i<8;i++){
      const inset=i*8,alpha=Math.round((1-i/8)*(48+pulse*30));g.fillColor=color('#e72c3f',alpha);
      g.rect(-w/2+inset,-h/2+inset,w-inset*2,8);g.rect(-w/2+inset,h/2-inset-8,w-inset*2,8);
      g.rect(-w/2+inset,-h/2+inset,8,h-inset*2);g.rect(w/2-inset-8,-h/2+inset,8,h-inset*2);g.fill();
    }
    const {x,y}=this.bossPlate.position,{width,height}=this.bossPlate.getComponent(UITransform)!;
    g.fillColor=color('#300d16',238);g.rect(x-width/2,y-height/2,width,height);g.fill();
    g.fillColor=color('#ff5962',230);g.rect(x-width/2,y+height/2-2,width,2);g.rect(x-width/2,y-height/2,width,2);g.fill();
    this.warningTitle.string=warning.tier==='final'?'危险警报 · 最终首领':'危险警报 · 精英来袭';
    this.warningDetail.string=`${warning.name} · ${warning.tier==='final'?'警惕加速追击':'击败可获得金币与补给'}`;
  }
  private showPhase():void {
    this.phase=this.sim.phase;for(const child of [...this.overlay.children]){child.active=false;child.destroy();}this.overlay.removeAllChildren();this.hud.active=this.phase!=='menu';
    if(this.phase==='menu'){this.showMenu();return;}
    if(this.phase==='playing')return;
    this.rect(this.overlay,0,0,this.hudSize.w,this.hudSize.h,C.ink,225);
    if(this.buildGuide&&(this.phase==='upgrade'||this.phase==='paused')){this.showBuildGuide();return;}
    if(this.phase==='upgrade'){this.showUpgrades();return;}
    const paused=this.phase==='paused',won=this.phase==='won';
    if(paused)this.button(this.overlay,'强化联动图鉴  [Tab]',0,this.W<1000?300:252,350,this.W<1000?92:52,()=>{this.buildGuide=true;this.showPhase();}).name='BuildGuideButton';
    this.text(this.overlay,paused?'信号已暂停':won?'成功撤离':'防线失守',0,135,55,won?C.orange:C.white,this.W-80);
    this.text(this.overlay,paused?'深呼吸，下一轮尸潮还在等你。':won?'你带着余烬，穿过了这片长夜。':'每一次坚持，都让下一次更接近黎明。',0,64,18,C.muted,this.W-90);
    if(!paused){
      this.saveRecord();this.text(this.overlay,`${this.formatTime(this.sim.time)}  生存     ${this.sim.kills}  击杀     LV.${this.sim.level}`,0,-4,24,C.orange,this.W-80);
      this.text(this.overlay,`本局 +${this.sim.coins} 金币 · 已入账   /   钱包 ${this.profile.coins}`,0,-50,18,C.orange,this.W-80);
    }
    this.button(this.overlay,paused?'继续战斗':'再来一局',0,this.W<1000?-113:-125,300,68,()=>{if(paused)this.sim.pause();else this.startGame();},true);
    this.button(this.overlay,'返回营地',0,-215,300,52,()=>this.returnMenu());
    this.button(this.overlay,this.muted?'声音：关闭':'声音：开启',-112,this.W<1000?-324:-288,210,this.W<1000?92:44,()=>{this.toggleSound();this.showPhase();});
    this.button(this.overlay,this.reducedMotion?'震动：关闭':'震动：开启',112,this.W<1000?-324:-288,210,this.W<1000?92:44,()=>{this.toggleMotion();this.showPhase();});
  }
  private showMenu():void {
    if(this.campView==='maps'){this.showMaps();return;}
    if(this.campView==='shop'){this.showShop();return;}
    if(this.campView==='heroes'){this.showHeroes();return;}
    const portrait=this.W<1000,x=portrait?0:-350,arena=arenaById(this.profile.selectedMap),hero=heroById(this.profile.selectedHero);
    const cover=this.make('AnimeCover',this.overlay,portrait?900:1423,portrait?1600:800);
    cover.setPosition(portrait?0:45,portrait?-120:0);this.sprite(cover,portrait?'cover-tall':'cover-wide');
    // Wide art reserves the left side; portrait art reserves its lower half.
    // Keep the three faces exposed and group controls into the quiet region.
    if(portrait)this.rect(this.overlay,0,-354,this.W,572,'#08191f',210);
    else this.rect(this.overlay,-367,0,546,this.H,'#08191f',205);
    this.text(this.overlay,'E M B E R L I N E   /   营 地',x,portrait?584:342,15,C.orange,510);
    this.text(this.overlay,'余烬防线',x,portrait?507:249,portrait?68:64,C.white,510);
    this.text(this.overlay,`金币 ${this.profile.coins} · 角色专属天赋树`,x,portrait?-127:177,20,C.orange,510);
    this.text(this.overlay,`${arena.name} · ${arena.difficulty} · ${arena.waves} 波`,x,portrait?-171:128,23,C.white,530);
    this.button(this.overlay,`${hero.name} · ${hero.role}  [H]`,x,portrait?-48:63,portrait?540:410,portrait?92:56,()=>{this.campView='heroes';this.showPhase();}).name='OpenHeroes';
    this.button(this.overlay,'开始行动  [Enter]',x,portrait?-258:-23,portrait?540:410,portrait?98:76,()=>this.startGame(),true).name='StartRun';
    this.button(this.overlay,'地图 / 难度  [C]',x-(portrait?140:111),portrait?-370:-108,portrait?260:208,66,()=>{this.campView='maps';this.showPhase();}).name='OpenMaps';
    this.button(this.overlay,'天赋 / 补给  [G]',x+(portrait?140:111),portrait?-370:-108,portrait?260:208,66,()=>{this.campView='shop';this.shopTab='talents';this.talentHero=this.profile.selectedHero;this.shopPage=0;this.shopNotice='';this.showPhase();}).name='OpenShop';
    const item=START_ITEMS.find(i=>i.id===this.profile.equipped),stock=item?(this.profile.items[item.id]||0):0;
    this.text(this.overlay,item?`开局道具：${item.name} · 库存 ${stock}${stock?'':'（本局不携带）'}`:'开局道具：未装备 · 可在商城准备',x,portrait?-449:-170,16,C.teal,portrait?680:530);
    if(!portrait){
      this.text(this.overlay,`最终首领：${BOSSES[bossForMap(arena.id)].name} · 3 阶段`,x,-210,16,C.orange,530);
      this.text(this.overlay,'WASD 移动 · R 换弹 · 空格冲刺',x,-251,14,C.muted,530);
      this.rect(this.overlay,305,-321,564,82,'#08191f',205,4);
      this.text(this.overlay,'当前出战  /  '+hero.name+' · '+hero.role,305,-302,24,hero.accent,530);
      this.text(this.overlay,hero.detail,305,-337,15,C.white,530);
    }
    this.button(this.overlay,this.muted?'声音：关闭':'声音：开启',x-(portrait?140:106),portrait?-526:-316,portrait?260:192,portrait?92:44,()=>{this.toggleSound();this.showPhase();});
    this.button(this.overlay,this.reducedMotion?'震动：关闭':'震动：开启',x+(portrait?140:106),portrait?-526:-316,portrait?260:192,portrait?92:44,()=>{this.toggleMotion();this.showPhase();});
    this.text(this.overlay,this.saveWarning||'进度保存在本机浏览器 · 金币仅通过游戏获得',x,-this.H/2+27,12,this.saveWarning?C.red:C.muted,620);
  }
  private showHeroes():void {
    const portrait=this.W<1000;this.campHeader('选择幸存者');
    HEROES.forEach((hero,i)=>{
      const w=portrait?690:346,h=portrait?246:390,x=portrait?0:(i-1)*374,y=portrait?280-i*265:-14;
      const card=this.button(this.overlay,'',x,y,w,h,()=>{void this.selectHero(hero.id);});card.name='Hero:'+hero.id;
      const art=this.make('HeroPortrait',card,portrait?204:174,portrait?204:174);art.setPosition(portrait?-228:0,portrait?9:98);this.sprite(art,hero.id+'-portrait');
      const tx=portrait?84:0;this.text(card,hero.name+' · '+hero.role,tx,portrait?78:-18,25,hero.accent,portrait?420:320);
      this.text(card,hero.detail,tx,portrait?6:-82,16,C.white,portrait?430:318);
      this.text(card,this.profile.selectedHero===hero.id?'✓ 已选择':'点击选择 · 免费',tx,-h/2+28,15,this.profile.selectedHero===hero.id?C.orange:C.muted,300);
    });
    this.button(this.overlay,'开始行动',120,-this.H/2+75,280,66,()=>this.startGame(),true).name='StartRun';
    this.button(this.overlay,'返回营地',-205,-this.H/2+75,230,66,()=>{this.campView='home';this.showPhase();}).name='BackCamp';
  }
  private async selectHero(id:HeroId):Promise<void> {
    try{this.profile=(await this.profileStore.transact(p=>{p.selectedHero=heroById(id).id;})).profile;this.saveWarning='';}
    catch{this.saveWarning='角色选择保存失败，请检查浏览器存储';}this.showPhase();
  }

  private campHeader(title:string):void {
    this.rect(this.overlay,0,0,this.W,this.H,C.ink,247);
    this.text(this.overlay,title,0,this.H/2-66,38,C.white,this.W-100);
    this.text(this.overlay,`金币 ${this.profile.coins} · 本机存档`,0,this.H/2-115,17,C.orange,this.W-100);
  }
  private showMaps():void {
    const portrait=this.W<1000;this.campHeader('选择战区');
    ARENAS.forEach((a,i)=>{
      const w=portrait?690:346,h=portrait?246:362,x=portrait?0:(i-1)*374,y=portrait?280-i*265:-14;
      const card=this.button(this.overlay,'',x,y,w,h,()=>{void this.selectMap(a.id);});card.name='Map:'+a.id;
      this.rect(card,-w/2+3,0,5,h-8,a.accent);
      const art=this.make('MapPreview',card,portrait?145:300,portrait?155:97);art.setPosition(portrait?-245:0,portrait?6:109);this.sprite(art,a.texture);
      const tx=portrait?70:0;
      this.text(card,`${i+1}. ${a.name}`,tx,portrait?73:32,25,C.white,portrait?460:320);
      this.text(card,`${a.difficulty} · ${a.waves} 波 · 奖励 ×${a.reward}`,tx,portrait?33:-7,16,a.accent,portrait?460:320);
      this.text(card,a.description,tx,portrait?-25:-69,15,C.muted,portrait?455:316);
      this.text(card,this.profile.selectedMap===a.id?'✓ 已选择':'点击选择',tx,-h/2+28,15,this.profile.selectedMap===a.id?C.orange:C.muted,300);
    });
    this.button(this.overlay,'开始行动  [Enter]',120,-this.H/2+75,280,66,()=>this.startGame(),true).name='StartRun';
    this.button(this.overlay,'返回营地',-205,-this.H/2+75,230,66,()=>{this.campView='home';this.showPhase();}).name='BackCamp';
  }
  private refreshProfile():void {try{this.profile=this.profileStore.read();}catch{this.saveWarning='本机存档不可用，请允许浏览器保存本地数据';}}
  private async selectMap(id:typeof ARENAS[number]['id']):Promise<void>{
    try{this.profile=(await this.profileStore.transact(p=>{p.selectedMap=id;})).profile;this.saveWarning='';}
    catch{this.saveWarning='地图选择保存失败，请检查浏览器存储';}this.showPhase();
  }
  private async shopBuy(id:string):Promise<void> {
    try{const result=await this.profileStore.transact(p=>purchase(p,id));this.profile=result.profile;this.shopNotice=result.value.message;this.saveWarning='';}
    catch{this.shopNotice='无法保存购买，未扣除金币';}if(this.sim.phase==='menu')this.showPhase();
  }
  private async buyHeroTalent(hero:HeroId,id:string):Promise<void> {
    try{const result=await this.profileStore.transact(p=>purchaseHeroTalent(p,hero,id));this.profile=result.profile;this.shopNotice=result.value.message;this.saveWarning='';}
    catch{this.shopNotice='无法保存天赋，未扣除金币';}if(this.sim.phase==='menu')this.showPhase();
  }
  private async shopEquip(id:string):Promise<void> {
    try{const result=await this.profileStore.transact(p=>{const next=p.equipped===id?null:id;return equipItem(p,next)?next?'道具已装备，下次开局消耗 1 件':'已卸下开局道具':'请先购买道具';});this.profile=result.profile;this.shopNotice=result.value;this.saveWarning='';}
    catch{this.shopNotice='无法保存装备，请检查浏览器存储';}if(this.sim.phase==='menu')this.showPhase();
  }
  private showShop():void {
    if(this.shopTab==='talents'){this.showTalentTreeV2();return;}
    const portrait=this.W<1000;this.campHeader('角色成长与补给');
    this.button(this.overlay,'角色天赋树',-142,this.H/2-175,258,58,()=>{this.shopTab='talents';this.shopPage=0;this.shopNotice='';this.showPhase();}).name='TabTalents';
    this.button(this.overlay,'开局道具',142,this.H/2-175,258,58,()=>{this.shopTab='items';this.shopPage=0;this.showPhase();},this.shopTab==='items').name='TabItems';
    const entries=START_ITEMS,pages=Math.ceil(entries.length/3);this.shopPage=Math.min(this.shopPage,pages-1);
    entries.slice(this.shopPage*3,this.shopPage*3+3).forEach((entry,i)=>{
      const owned=this.profile.items[entry.id]||0,cost=entry.base;
      const w=portrait?690:346,h=portrait?234:342,x=portrait?0:(i-1)*374,y=portrait?293-i*250:-5;
      const card=this.make('ShopCard:'+entry.id,this.overlay,w,h);card.setPosition(x,y);this.uiArt(card,'card',0,0,w,h,true);
      this.icon(card,entry.icon,portrait?-259:0,portrait?18:102,portrait?104:88);
      this.text(card,entry.name,portrait?40:0,portrait?72:34,25,C.white,portrait?430:315);
      this.text(card,entry.detail,portrait?50:0,portrait?21:-20,15,C.muted,portrait?450:315);
      this.text(card,`库存 ${owned}${this.profile.equipped===entry.id?' · 已装备':''}`,portrait?-205:0,portrait?-70:-77,14,C.teal,portrait?230:300);
      const title=owned>=entry.max?'库存已满':`购买 · ${cost} 金币`;
      this.button(card,title,portrait?45:-75,portrait?-67:-124,portrait?265:178,portrait?58:52,()=>this.shopBuy(entry.id),owned<entry.max&&this.profile.coins>=cost).name='Buy:'+entry.id;
      this.button(card,this.profile.equipped===entry.id?'卸下':'装备',portrait?250:109,portrait?-67:-124,portrait?116:104,portrait?58:52,()=>this.shopEquip(entry.id)).name='Equip:'+entry.id;
    });
    this.text(this.overlay,this.shopNotice||'购买后装备一件；开局消耗，局内升级仍随机。',0,portrait?-399:-211,14,C.orange,this.W-75);
    const y=-this.H/2+(portrait?160:126);
    this.button(this.overlay,'上一页',-170,y,155,54,()=>{this.shopPage=(this.shopPage+pages-1)%pages;this.showPhase();}).name='ShopPrev';
    this.text(this.overlay,`${this.shopPage+1} / ${pages}`,0,y,18,C.white,140);
    this.button(this.overlay,'下一页',170,y,155,54,()=>{this.shopPage=(this.shopPage+1)%pages;this.showPhase();}).name='ShopNext';
    this.button(this.overlay,'返回营地',0,-this.H/2+55,275,58,()=>{this.campView='home';this.showPhase();}).name='BackCamp';
  }
  private showTalentTree():void {
    const portrait=this.W<1000,hero=heroById(this.talentHero),entries=HERO_TALENTS[hero.id];
    HEROES.forEach((h,i)=>this.button(this.overlay,`${h.name}  [${i+1}]`,(i-1)*(portrait?238:260),portrait?355:153,portrait?220:242,portrait?92:56,()=>{this.talentHero=h.id;this.shopNotice='';this.showPhase();},h.id===hero.id).name='TalentHero:'+h.id);
    this.hudText(this.overlay,`仅 ${hero.name} 生效 · 前置 2 阶可进阶 · 下局生效`,0,portrait?282:102,portrait?23:17,hero.accent,this.W-70);
    if(portrait)TALENT_BRANCHES[hero.id].forEach((name,i)=>this.button(this.overlay,name,i===0?-177:177,210,334,92,()=>{this.talentBranch=i as 0|1;this.shopNotice='';this.showPhase();},i===this.talentBranch).name='TalentBranch:'+i);
    else TALENT_BRANCHES[hero.id].forEach((name,i)=>this.hudText(this.overlay,name,i===0?-220:220,-18,18,hero.accent,170));

    // Draw the central trunk and branch arrows before the cards.
    const linksNode=this.make('TalentLinks',this.overlay,this.W,this.H);linksNode.setPosition(0,0);
    const links=linksNode.addComponent(Graphics);links.strokeColor=color(hero.accent);links.lineWidth=7;links.lineCap=Graphics.LineCap.ROUND;
    const rootY=portrait?130:62,firstY=portrait?30:-55,stepY=portrait?155:120;
    if(portrait){
      links.moveTo(0,rootY-30);links.lineTo(0,firstY+70);
    }else{
      links.moveTo(0,rootY-27);links.lineTo(0,-18);links.lineTo(-220,-18);links.moveTo(0,-18);links.lineTo(220,-18);
      for(const x of [-220,220]){links.moveTo(x,-18);links.lineTo(x,firstY+54);}
    }
    // Solid connector bars keep the tree readable on low-alpha WebGL paths.
    const connector=(x:number,y:number,w:number,h:number)=>{const g=this.rect(this.overlay,x,y,w,h,hero.accent,190,3);g.node.name='TalentConnector';};
    if(portrait){
      connector(0,(rootY+firstY+70)/2,8,Math.max(8,rootY-firstY-70));
      connector(0,firstY-70-stepY/2,8,Math.max(8,stepY-140));
      connector(0,firstY-70-stepY*1.5,8,Math.max(8,stepY-140));
    }else{
      connector(0,(rootY+18)/2,8,Math.max(8,rootY-18));connector(0,-18,440,8);
      for(const x of [-220,220]){
        connector(x,(-18+firstY+54)/2,8,Math.max(8,18+firstY+54));
        connector(x,firstY-stepY/2,8,Math.max(8,stepY-96));
        connector(x,firstY-stepY*1.5,8,Math.max(8,stepY-96));
      }
    }
    const visible=portrait?entries.filter(t=>t.branch===this.talentBranch):entries;
    for(const branch of portrait?[this.talentBranch]:[0,1]){
      const branchEntries=entries.filter(t=>t.branch===branch);
      branchEntries.forEach(entry=>{
        const state=talentState(this.profile,hero.id,entry),{rank,cost,locked,maxed,canBuy}=state;
        const w=portrait?700:150,h=portrait?140:96;
        const x=portrait?0:(branch===0?-220:220),y=firstY-entry.tier*stepY;
        if(entry.tier>0){
          links.moveTo(x,y+h/2+stepY-h);links.lineTo(x,y+h/2);links.moveTo(x-7,y+h/2+9);links.lineTo(x,y+h/2);links.lineTo(x+7,y+h/2+9);
        }
        const card=this.make('TalentNode:'+entry.id,this.overlay,w,h);card.setPosition(x,y);this.uiArt(card,'card',0,0,w,h,true);
        this.icon(card,entry.icon,portrait?-286:0,portrait?30:24,portrait?58:42,entry.upgrade==='mines'?this.clips.get('mine-vfx')![8]:undefined);
        this.hudText(card,entry.name,portrait?-178:0,portrait?34:-7,portrait?22:13,locked?C.muted:C.white,portrait?210:132);
        this.hudText(card,entry.detail,portrait?-178:0,portrait?8:-25,portrait?15:9,C.white,portrait?214:132);
        const rankText=maxed?'✓ 已满阶':locked?state.reason:`${rank} / ${entry.max} 阶 · ${entry.tier===2?'开局专长':'永久成长'}`;
        this.hudText(card,rankText,portrait?-178:0,portrait?-15:-39,portrait?13:9,locked?C.muted:hero.accent,portrait?214:132);
        const label=maxed?'已满阶':locked?'未解锁':canBuy?`${rank?'升级':'解锁'} · ${cost}`:`${cost} · 不足`;
        const buy=this.button(card,label,portrait?229:0,portrait?-4:-51,portrait?214:130,portrait?100:24,()=>this.buyHeroTalent(hero.id,entry.id),canBuy);buy.name='BuyTalent:'+entry.id;
        if(!canBuy)buy.getComponentInChildren(Sprite)!.color=color('#8e9d92');
      });
    }
    const root=this.make('TalentRoot:'+hero.id,this.overlay,portrait?600:270,portrait?58:52);root.setPosition(0,rootY);this.uiArt(root,'card',0,0,portrait?600:270,portrait?58:52);
    this.hudText(root,`${hero.name} · 核心天赋`,0,portrait?10:8,portrait?22:18,hero.accent,portrait?520:230);
    this.hudText(root,'金币解锁 · 两条分支同时培养',0,portrait?-14:-12,portrait?13:11,C.muted,portrait?520:230);
    const refund=this.profile.legacyRefund?`旧天赋已返还 ${this.profile.legacyRefund} 金币`:`基础金币产出减少 ${Math.round((1-COIN_REWARD_SCALE)*100)}% · 两条分支均可培养`;
    this.hudText(this.overlay,this.shopNotice||refund,0,portrait?-390:-358,portrait?20:15,C.orange,this.W-60);
    this.button(this.overlay,'返回营地',0,portrait?-460:-370,portrait?320:275,portrait?92:44,()=>{this.campView='home';this.showPhase();}).name='BackCamp';
  }
  /** Compact talent graph with generated node states and a separate inspector panel. */
  private showTalentTreeV2():void {
    const portrait=this.W<1000,hero=heroById(this.talentHero),entries=HERO_TALENTS[hero.id];
    if(!entries.some(t=>t.id===this.talentFocus))this.talentFocus=entries[0].id;
    const nodeSize=portrait?116:100,treeX=portrait?0:-180,branchX=portrait?190:184;
    const tierY:number[]=portrait?[106,-68,-242]:[0,-132,-264];
    this.rect(this.overlay,0,0,this.W,this.H,C.ink,247);
    this.hudText(this.overlay,'角色成长与补给',portrait?0:-280,portrait?576:346,portrait?40:32,C.white,portrait?710:640);
    this.hudText(this.overlay,`金币 ${this.profile.coins}`,portrait?0:436,portrait?526:346,portrait?30:23,C.orange,portrait?680:300);
    this.button(this.overlay,'角色天赋树',-142,portrait?465:280,258,58,()=>{},true).name='TabTalents';
    this.button(this.overlay,'开局道具',142,portrait?465:280,258,58,()=>{this.shopTab='items';this.shopPage=0;this.shopNotice='';this.showPhase();}).name='TabItems';
    HEROES.forEach((h,i)=>this.button(this.overlay,`${h.name}  [${i+1}]`,(i-1)*(portrait?238:260),portrait?365:207,portrait?220:242,56,()=>{this.talentHero=h.id;this.talentFocus=HERO_TALENTS[h.id][0].id;this.shopNotice='';this.showPhase();},h.id===hero.id).name='TalentHero:'+h.id);

    // Fill narrow rectangles for connectors so each segment renders consistently on WebGL.
    const links=this.make('TalentLinks',this.overlay,this.W,this.H);
    const segment=(x1:number,y1:number,x2:number,y2:number,active=true)=>this.rect(links,(x1+x2)/2,(y1+y2)/2,Math.max(4,Math.abs(x2-x1)),Math.max(4,Math.abs(y2-y1)),active?hero.accent:'#57635f',active?210:180);
    const rootY=portrait?275:136,junctionY=portrait?237:108;
    segment(treeX,rootY-20,treeX,junctionY);segment(treeX-branchX,junctionY,treeX+branchX,junctionY);
    for(const branch of [0,1]){
      const x=treeX+(branch===0?-branchX:branchX);
      segment(x,junctionY,x,tierY[0]+nodeSize/2);
      for(let tier=1;tier<3;tier++){
        const entry=entries.find(t=>t.branch===branch&&t.tier===tier)!,active=!talentState(this.profile,hero.id,entry).locked;
        segment(x,tierY[tier-1]-nodeSize/2,x,tierY[tier]+nodeSize/2,active);
      }
    }
    const root=this.make('TalentRoot:'+hero.id,this.overlay,portrait?300:250,portrait?54:44);root.setPosition(treeX,rootY);
    this.uiArt(root,'talent/branch',0,0,portrait?300:250,portrait?54:44);
    this.hudText(root,`${hero.name} · 核心天赋`,0,2,portrait?23:18,C.white,portrait?254:210);
    TALENT_BRANCHES[hero.id].forEach((name,i)=>{
      const x=treeX+(i===0?-branchX:branchX),header=this.make(`TalentBranch:${i}`,this.overlay,portrait?238:206,portrait?52:44);header.setPosition(x,portrait?205:80);
      this.uiArt(header,'talent/branch',0,0,portrait?238:206,portrait?52:44);
      this.hudText(header,name,0,2,portrait?24:18,C.white,portrait?200:170);
    });
    for(const entry of entries){
      const state=talentState(this.profile,hero.id,entry),selected=entry.id===this.talentFocus;
      const x=treeX+(entry.branch===0?-branchX:branchX),y=tierY[entry.tier],frame=selected?'selected':state.maxed?'maxed':state.locked?'locked':'available';
      const node=this.make('TalentNode:'+entry.id,this.overlay,nodeSize+8,nodeSize+8);node.setPosition(x,y);this.uiArt(node,`talent/${frame}`,0,0,nodeSize,nodeSize);
      this.icon(node,entry.icon,0,8,nodeSize*.62,entry.upgrade==='mines'?this.clips.get('mine-vfx')![8]:undefined);
      const skill=node.getChildByName('SkillIcon:'+entry.icon)!.getComponent(Sprite)!;skill.grayscale=state.locked;
      const nameX=portrait?0:(entry.branch===0?-116:116),nameY=portrait?-80:0;
      if(portrait)this.rect(node,nameX,nameY,182,32,C.ink,255);
      this.hudText(node,entry.name,nameX,nameY,portrait?25:17,state.locked?C.muted:C.white,portrait?180:124);
      this.rect(node,0,-nodeSize/2+12,portrait?64:54,portrait?28:22,C.ink,255,4);
      this.hudText(node,state.maxed?'已满':`${state.rank}/${entry.max}`,0,-nodeSize/2+12,portrait?23:17,state.locked?C.muted:hero.accent,portrait?62:52);
      node.on(Node.EventType.TOUCH_END,()=>{this.talentFocus=entry.id;this.shopNotice='';this.sound('select',.35);this.showPhase();});
    }

    const focused=entries.find(t=>t.id===this.talentFocus)||entries[0],state=talentState(this.profile,hero.id,focused);
    const detailW=portrait?712:350,detailH=portrait?160:384;
    const detail=this.make('TalentDetail:'+focused.id,this.overlay,detailW,detailH);detail.setPosition(portrait?0:432,portrait?-448:-96);
    this.uiArt(detail,'talent/detail-locked',0,0,detailW,detailH,true);
    if(!portrait){
      this.icon(detail,focused.icon,0,109,76,focused.upgrade==='mines'?this.clips.get('mine-vfx')![8]:undefined);
      this.hudText(detail,`${hero.name} · ${TALENT_BRANCHES[hero.id][focused.branch]}`,0,158,15,C.muted,286);
    }
    this.hudText(detail,focused.name,portrait?-106:0,portrait?36:44,portrait?27:25,hero.accent,portrait?394:284,portrait?Label.HorizontalAlign.LEFT:Label.HorizontalAlign.CENTER);
    this.hudText(detail,focused.detail,portrait?-106:0,portrait?-4:0,portrait?23:18,C.white,portrait?394:294,portrait?Label.HorizontalAlign.LEFT:Label.HorizontalAlign.CENTER);
    const rankText=state.maxed?'已满阶':state.locked?state.reason:`${focused.tier===2?'开局专长':'永久成长'} · ${state.rank}/${focused.max} 阶`;
    this.hudText(detail,this.shopNotice||rankText,portrait?-106:0,portrait?-44:-38,portrait?21:16,state.locked?C.muted:hero.accent,portrait?394:294,portrait?Label.HorizontalAlign.LEFT:Label.HorizontalAlign.CENTER);
    if(!portrait)this.hudText(detail,'仅该角色生效 · 下局应用',0,-76,15,C.muted,286);
    const label=state.maxed?'已满阶':state.locked?'未解锁':state.canBuy?`${state.rank?'升级':'解锁'} · ${state.cost} 金币`:`还差 ${state.cost-this.profile.coins} 金币`;
    const buy=this.button(detail,label,portrait?236:0,portrait?0:-132,portrait?188:280,56,()=>this.buyHeroTalent(hero.id,focused.id),state.canBuy);buy.name='BuyTalent:'+focused.id;
    const buyFace=buy.getComponentInChildren(Sprite)!;buyFace.spriteFrame=this.frames.get('ui/talent/'+(state.canBuy?'action':'branch'))!;buyFace.type=Sprite.Type.SIMPLE;
    const buyLabel=buy.getComponentInChildren(Label)!;buyLabel.enableWrapText=false;buyLabel.fontSize=portrait?25:19;buyLabel.lineHeight=buyLabel.fontSize*1.2;
    if(!state.canBuy)buy.getComponentInChildren(Sprite)!.color=color('#8e9d92');
    this.button(this.overlay,'返回营地',0,portrait?-582:-356,portrait?300:275,56,()=>{this.campView='home';this.showPhase();}).name='BackCamp';
  }
  private showUpgrades():void {
    const portrait=this.W<1000;
    this.text(this.overlay,'潜能觉醒',0,portrait?470:225,46,C.white,this.W-80);
    const milestone=[3,6,9].includes(this.sim.level);
    this.text(this.overlay,`等级 ${this.sim.level}   ·   ${milestone?this.sim.hero.name+' · '+this.sim.hero.signature+'觉醒':'火力强化'}`,0,portrait?413:163,17,milestone?C.orange:C.muted,this.W-70);
    this.sim.choices.forEach((choice,i)=>{
      const u=this.sim.previewUpgrade(choice),rank=this.sim.upgrades[u.id]||0,evolving=!!u.evolution&&rank+1===u.evolution.tier;
      const cw=portrait?650:320,ch=portrait?224:340;
      const x=portrait?0:(i-1)*348,y=portrait?245-i*250:-35;
      const card=this.button(this.overlay,'',x,y,cw,ch,()=>this.sim.selectUpgrade(i));
      card.name='Upgrade:'+u.id;
      this.rect(card,-cw/2+2,0,4,ch-12,evolving?C.orange:C.teal);
      this.text(card,`0${i+1}   /   ${u.tag}`,portrait?-160:0,ch/2-34,12,C.orange,portrait?280:280,portrait?Label.HorizontalAlign.LEFT:Label.HorizontalAlign.CENTER);
      this.icon(card,u.art??Math.max(0,UPGRADES.findIndex(x=>x.id===u.id)),portrait?-230:0,portrait?-8:60,portrait?92:86,u.id==='mines'?this.clips.get('mine-vfx')![8]:undefined);
      this.text(card,u.name,portrait?40:0,portrait?48:0,26,evolving?C.orange:C.white,portrait?370:280);
      this.text(card,u.detail,portrait?40:0,portrait?-12:-60,16,C.muted,portrait?400:292);
      const hint=this.sim.synergyHint(u.id);
      if(hint)this.hudText(card,hint,portrait?40:0,portrait?-64:-108,portrait?20:14,C.orange,portrait?420:294);
      const progress=evolving?'本次进化':u.evolution&&rank+1<u.evolution.tier?`${u.evolution.tier} 阶进化`:`上限 ${u.max} 阶`;
      this.hudText(card,`${rank} → ${rank+1} 阶   ·   ${progress}`,portrait?45:0,-ch/2+24,portrait?18:12,evolving?C.orange:C.teal,portrait?400:290);
    });
    const reroll=this.button(this.overlay,`重抽 ${this.sim.rerolls}/2  [Q]`,-(portrait?170:160),portrait?-452:-266,portrait?310:280,portrait?92:52,()=>{if(this.sim.rerollUpgrades())this.showPhase();});reroll.name='RerollButton';
    if(!this.sim.rerolls)reroll.getComponentInChildren(Sprite)!.color=color('#647368');
    this.button(this.overlay,'联动图鉴  [Tab]',portrait?170:160,portrait?-452:-266,portrait?310:280,portrait?92:52,()=>{this.buildGuide=true;this.showPhase();}).name='BuildGuideButton';
    this.text(this.overlay,'战斗已暂停 · 凑齐条件自动激活联动',0,portrait?-526:-322,14,C.muted,this.W-80);
  }
  private showBuildGuide():void {
    const portrait=this.W<1000;
    this.text(this.overlay,'强化联动图鉴',0,portrait?536:316,38,C.white,this.W-80);
    this.text(this.overlay,'条件满足立即生效 · 可同时激活多组',0,portrait?478:268,16,C.muted,this.W-80);
    this.sim.buildRecipes.forEach((recipe,i)=>{
      const y=(portrait?365:190)-i*(portrait?158:91),w=portrait?704:1040,h=portrait?144:82;
      const row=this.rect(this.overlay,0,y,w,h,C.panel,245,6).node;row.name='Recipe:'+recipe.id;
      this.hudText(row,`${recipe.active?'已激活':'待解锁'}  /  ${recipe.name}`,0,portrait?42:24,portrait?26:19,recipe.active?C.teal:C.orange,w-32);
      this.hudText(row,recipe.requirement,0,portrait?0:-2,portrait?23:16,C.white,w-32);
      this.hudText(row,recipe.detail,0,portrait?-40:-26,portrait?21:15,C.muted,w-32);
    });
    this.button(this.overlay,'返回  [Tab]',0,portrait?-506:-282,330,portrait?92:52,()=>{this.buildGuide=false;this.showPhase();},true).name='CloseBuildGuide';
  }
  private async startGame():Promise<void> {
    if(this.starting)return;this.starting=true;
    try{
      await this.checkpoint(true);
      const id=`${Date.now()}-${Math.floor(Math.random()*1e9)}`;
      const result=await this.profileStore.transact(p=>beginRun(p,id));this.profile=result.profile;this.saveWarning='';
      this.clearActors();this.runId=id;this.creditedCoins=0;this.settled=false;
      this.sim=new Simulation(Date.now(),this.profile.selectedMap,result.value);
      this.player.name=this.sim.hero.id;this.player.frame=-1;this.player.sprite.spriteFrame=this.clips.get(this.sim.hero.id)![8];
      this.player.root.setParent(this.world);this.heroAura.attach(this.world);this.mineView.attach(this.world);for(const n of [this.sceneMap.ground,this.sceneMap.depth,this.sceneMap.debug.node]){n.active=false;n.destroy();}
      this.sceneMap=new SceneView(this.world,this.frames,this.sim.map,this.sim.arena.texture);this.player.root.setParent(this.sceneMap.depth);this.heroAura.attach(this.sceneMap.ground);this.mineView.attach(this.sceneMap.ground);this.buildHUD();
      this.sim.start();this.lastShot=0;this.lastHit=0;this.lastPick=0;
      this.player.clock=0;this.player.attack=0;this.player.dying=-1;this.player.step=-1;this.ghostClock=0;
      this.runCycle.reset();this.playerClip=this.sim.hero.id;
      this.keys.clear();this.stick.set(0,0);this.touchId=null;this.player.root.active=true;this.renderHUD();this.showPhase();
    }catch{this.saveWarning='存档写入失败，未消耗道具；请允许浏览器保存本地数据';this.showPhase();}
    finally{this.starting=false;}
  }
  private async returnMenu():Promise<void> {await this.checkpoint(true);this.clearActors();this.runId='';this.sim=new Simulation();this.campView='home';this.player.root.setPosition(0,0);this.player.root.active=false;this.refreshProfile();this.showPhase();}
  private async checkpoint(finished=false):Promise<void> {
    if(!this.runId||this.settled)return;
    const terminal=finished||this.sim.phase==='dead'||this.sim.phase==='won',coins=this.sim.coins,id=this.runId,won=this.sim.phase==='won';
    if(!terminal&&(this.saving||coins===this.creditedCoins))return;
    this.saving=true;
    try{const result=await this.profileStore.transact(p=>creditRun(p,id,coins,terminal,won));this.profile=result.profile;
      if(this.runId===id){this.creditedCoins=coins;this.settled=terminal;}this.saveWarning='';
      if(terminal&&this.runId===id&&this.deathOverlayDelay===0&&(this.sim.phase==='won'||this.sim.phase==='dead'))this.showPhase();
    }catch{this.saveWarning='金币暂未保存，正在等待本机存储恢复';}
    finally{this.saving=false;}
  }
  private clearActors():void {
    this.buildGuide=false;
    this.lastPowerSound=-1;
    for(const a of Array.from(this.actors.values()).concat(this.dying))a.root.destroy();this.actors.clear();this.dying=[];
    for(const t of Array.from(this.texts.values()))t.node.destroy();this.texts.clear();
    for(const n of this.damageNumbers)n.label.node.destroy();this.damageNumbers=[];
    this.fx.clear();this.combatFx?.clear();this.heroAura?.clear();this.projectileView?.clear();this.mineView?.clear();this.animationChanges=0;this.actionCounts={};this.visualClock=0;
    this.deathOverlayDelay=0;
    this.runCycle.reset();
  }
  private saveRecord():void {this.menuBest=Math.max(this.menuBest,Math.floor(this.sim.time));this.bestKills=Math.max(this.bestKills,this.sim.kills);sys.localStorage.setItem('emberline-best',String(this.menuBest));sys.localStorage.setItem('emberline-kills',String(this.bestKills));}
  private toggleMotion():void {this.reducedMotion=!this.reducedMotion;sys.localStorage.setItem('emberline-reduced-motion',this.reducedMotion?'1':'0');}
  private toggleSound():void {this.muted=!this.muted;sys.localStorage.setItem('emberline-muted',this.muted?'1':'0');}
  private sound(name:string,volume=.4):void {const clip=this.sounds.get(name);if(clip&&!this.muted)this.audio.playOneShot(clip,volume);}
  private formatTime(t:number):string {return `${Math.floor(t/60).toString().padStart(2,'0')}:${Math.floor(t%60).toString().padStart(2,'0')}`;}
  private onKeyDown(e:EventKeyboard):void {
    if(e.keyCode===KeyCode.KEY_B&&this.ready){this.sceneMap.debugVisible=!this.sceneMap.debugVisible;return;}
    if(!this.ready||this.keys.has(e.keyCode))return;this.keys.add(e.keyCode);
    if(e.keyCode===KeyCode.TAB&&(this.sim.phase==='upgrade'||this.sim.phase==='paused')){this.buildGuide=!this.buildGuide;this.showPhase();return;}
    if(this.buildGuide){if(e.keyCode===KeyCode.ESCAPE){this.buildGuide=false;this.showPhase();}return;}
    if(e.keyCode===KeyCode.KEY_Q&&this.sim.rerollUpgrades()){this.showPhase();return;}
    if(this.sim.phase==='menu'){
      if(e.keyCode===KeyCode.ESCAPE){this.campView='home';this.showPhase();return;}
      if(e.keyCode===KeyCode.KEY_G){this.campView='shop';this.shopTab='talents';this.talentHero=this.profile.selectedHero;this.shopPage=0;this.shopNotice='';this.showPhase();return;}
      if(e.keyCode===KeyCode.KEY_H){this.campView='heroes';this.showPhase();return;}
      if(this.campView==='heroes'&&e.keyCode>=KeyCode.DIGIT_1&&e.keyCode<=KeyCode.DIGIT_3){void this.selectHero(HEROES[e.keyCode-KeyCode.DIGIT_1].id);return;}
      if(e.keyCode===KeyCode.KEY_C){this.campView='maps';this.showPhase();return;}
      if(this.campView==='maps'&&e.keyCode>=KeyCode.DIGIT_1&&e.keyCode<=KeyCode.DIGIT_3){void this.selectMap(ARENAS[e.keyCode-KeyCode.DIGIT_1].id);return;}
      if(this.campView==='shop'){if(e.keyCode>=KeyCode.DIGIT_1&&e.keyCode<=KeyCode.DIGIT_3&&this.shopTab==='talents'){this.talentHero=HEROES[e.keyCode-KeyCode.DIGIT_1].id;this.shopNotice='';this.showPhase();}return;}
    }
    if(e.keyCode===KeyCode.ESCAPE||e.keyCode===KeyCode.KEY_P)this.sim.pause();
    if(e.keyCode===KeyCode.SPACE&&this.sim.dash())this.sound('dash',.5);
    if(e.keyCode===KeyCode.ENTER){if(this.sim.phase==='menu'||this.sim.phase==='dead'||this.sim.phase==='won')this.startGame();else if(this.sim.phase==='paused')this.sim.pause();}
    if(e.keyCode===KeyCode.KEY_M){this.toggleSound();if(this.sim.phase!=='playing')this.showPhase();}
    if(e.keyCode===KeyCode.KEY_R){
      if(this.sim.phase==='playing')this.sim.reload();
      else if(this.sim.phase==='paused'||this.sim.phase==='dead'||this.sim.phase==='won')this.returnMenu();
    }
    if(this.sim.phase==='upgrade'&&e.keyCode>=KeyCode.DIGIT_1&&e.keyCode<=KeyCode.DIGIT_3)this.sim.selectUpgrade(e.keyCode-KeyCode.DIGIT_1);
  }
  private onKeyUp(e:EventKeyboard):void {this.keys.delete(e.keyCode);}
  private onTouchStart(e:EventTouch):void {
    if(this.sim.phase!=='playing'||this.touchId!==null)return;const p=e.getUILocation();
    // Reserve the top HUD and lower equipment row so a touch there cannot start movement.
    const cy=p.y-this.H/2;
    if(p.x>this.W*.55||cy>this.combatView.top||cy<this.combatView.bottom)return;
    this.touchId=e.getID();this.stickOrigin.set(p.x,p.y);this.stick.set(0,0);
    this.stickBase.active=true;this.stickBase.setPosition(p.x-this.W/2,p.y-this.H/2);this.stickKnob.setPosition(0,0);
  }
  private onTouchMove(e:EventTouch):void {if(e.getID()!==this.touchId)return;const p=e.getUILocation();let x=p.x-this.stickOrigin.x,y=p.y-this.stickOrigin.y;const l=Math.hypot(x,y);if(l>60){x*=60/l;y*=60/l;}this.stick.set(x/60,y/60);this.stickKnob.setPosition(x,y);}
  private onTouchEnd(e:EventTouch):void {if(e.getID()!==this.touchId)return;this.touchId=null;this.stick.set(0,0);this.stickBase.active=false;}

  update(dt:number):void {
    if(!this.ready)return;
    const mx=Number(this.keys.has(KeyCode.KEY_D)||this.keys.has(KeyCode.ARROW_RIGHT))-Number(this.keys.has(KeyCode.KEY_A)||this.keys.has(KeyCode.ARROW_LEFT))+this.stick.x;
    const my=Number(this.keys.has(KeyCode.KEY_W)||this.keys.has(KeyCode.ARROW_UP))-Number(this.keys.has(KeyCode.KEY_S)||this.keys.has(KeyCode.ARROW_DOWN))+this.stick.y;
    const before=this.sim.time;this.sim.update(dt,mx,my);
    this.checkpoint();
    const visualDt=this.sim.phase==='dead'?Math.min(dt,.05):this.sim.time-before;
    this.visualClock+=visualDt;
    this.consumeCombatEvents(this.sim.drainCombatEvents());
    if(this.sim.phase!==this.phase){
      if(this.sim.phase==='dead'){this.phase='dead';this.deathOverlayDelay=.62;}
      else this.showPhase();
      if(this.sim.phase==='upgrade')this.sound('select',.6);
    }
    if(this.deathOverlayDelay>0){this.deathOverlayDelay=Math.max(0,this.deathOverlayDelay-dt);if(this.deathOverlayDelay===0&&this.sim.phase==='dead')this.showPhase();}
    if(this.sim.shotEvents>this.lastShot){this.lastShot=this.sim.shotEvents;this.sound('shot',.18);}
    if(this.sim.hitEvents>this.lastHit){this.lastHit=this.sim.hitEvents;this.sound('hit',.5);}
    if(this.sim.pickupEvents>this.lastPick){this.lastPick=this.sim.pickupEvents;this.sound('pickup',.13);}
    this.renderWorld(visualDt);this.uiClock+=dt;if(this.uiClock>.08){this.uiClock=0;this.renderHUD();}
  }
  private enemyActor(kind:EnemyKind,bossId:BossId=bossForMap(this.sim.arena.id),tier:BossTier='final'):Actor {
    const actor=this.actor(kind==='walker'||kind==='runner'?'zombie':kind==='boss'?bossId:kind==='brute'?'brute':kind,kind==='boss'?(tier==='elite'?164:230):kind==='brute'?132:kind==='bomber'?120:kind==='runner'?85:108);
    if(kind==='boss'&&tier==='elite')this.text(actor.root,`精英 · ${ELITE_NAMES[bossId]}`,0,144,14,'#ffd089',210);
    return actor;
  }
  private consumeCombatEvents(events:CombatEvent[]):void {
    for(const e of events){
      this.combatFx.event(e,this.reducedMotion,e.type==='fire'?this.heroMuzzle(e.x,e.y,this.sim.facing,true):undefined);
      if(e.type==='awakening'||e.type==='frenzy')this.heroAura.activate();
      if(e.type==='bossArrival'){this.sound('dash',.5);this.sound('select',.4);}
      if(e.type==='fire'){this.player.attack=.17;this.actionCounts.shoot=(this.actionCounts.shoot||0)+1;}
      if(e.type==='reload'){this.actionCounts.reload=(this.actionCounts.reload||0)+1;this.sound('select',.2);}
      if(e.type==='reloadComplete')this.sound('pickup',.3);
      if(e.type==='awakening'||e.type==='frenzy'){this.sound('select',.45);this.sound('dash',.3);}
      if(e.type==='heroPower')this.sound('pickup',.22);
      if((e.type==='blast'||e.type==='explosion')&&this.visualClock-this.lastPowerSound>.1){this.lastPowerSound=this.visualClock;this.sound('hit',.38);}
      if(e.type==='chain'&&this.visualClock-this.lastPowerSound>.1){this.lastPowerSound=this.visualClock;this.sound('select',.18);}
      if((e.type==='attack'||e.type==='bossCast')&&e.actorId!==undefined){
        let a=this.actors.get(e.actorId);if(!a){a=this.enemyActor(e.kind!,e.bossId,e.bossTier);a.root.setPosition(e.x,e.y);this.actors.set(e.actorId,a);}
        a.attack=.4;this.actionCounts.attack=(this.actionCounts.attack||0)+1;
      }
      if(e.type==='death'&&e.actorId!==undefined){
        if(e.detonated){
          const detonated=this.actors.get(e.actorId);if(detonated){detonated.root.active=false;detonated.root.destroy();this.actors.delete(e.actorId);}
          this.actionCounts.death=(this.actionCounts.death||0)+1;continue;
        }
        const a=this.actors.get(e.actorId)||this.enemyActor(e.kind!,e.bossId,e.bossTier);this.actors.delete(e.actorId);
        a.root.setPosition(e.x,e.y);a.dying=0;a.attack=0;this.dying.push(a);
        if(this.dying.length>32)this.dying.shift()!.root.destroy();
        this.actionCounts.death=(this.actionCounts.death||0)+1;
      }
      if(e.type==='impact'&&e.amount!==undefined){
        if(this.damageNumbers.length>=40)this.damageNumbers.shift()!.label.node.destroy();
        const ink=e.critical?'#ffb55c':'#ffe2a2';
        const label=this.text(this.world,`${e.critical?'暴击 ':''}${e.amount}`,e.x,e.y+55,e.critical?23:e.kind==='boss'?23:17,ink,e.critical?140:90);
        this.damageNumbers.push({label,x:e.x,y:e.y+55,age:0,life:.52,ink});
      }
    }
  }
  private heroMuzzle(x:number,y:number,facing:number,recoil=false):{x:number;y:number} {
    // Use the barrel anchor for the active full-body clip. The anchor is a
    // presentation offset only; projectile collision and damage remain in
    // Simulation. During a fire event playerClip still refers to the previous
    // frame, so choose the upcoming fire clip when the hero is stationary.
    const hero=this.sim.hero.id;
    const clip=this.runCycle.moving?hero+'-run':hero+'-fire';
    const frames=HERO_MOTION_MUZZLES[clip]||HERO_MOTION_MUZZLES[hero+'-idle'];
    const tip=frames?.[Math.min(frames.length-1,Math.max(0,this.player?.frame||0))]||({vanguard:[194,57],scout:[178,58],medic:[189,62]} as Record<string,number[]>)[hero];
    const scale=this.player.base/256,px=(tip[0]-128)*scale*facing,py=(128-tip[1])*scale;
    const angle=-facing*((recoil?1.5:0)+(this.sim.dashTime>0?8:0))*Math.PI/180;
    return {x:x+px*Math.cos(angle)-py*Math.sin(angle)-(recoil?facing*1.8:0),y:y+this.player.base*.40625+px*Math.sin(angle)+py*Math.cos(angle)};
  }
  private animateActor(a:Actor,dt:number,moving:boolean,facing:number,fps:number):void {
    a.clock+=dt;a.attack=Math.max(0,a.attack-dt);a.facing=facing;
    let frame=a.name==='survivor'?8:0,bob=moving?Math.sin(a.clock*fps*Math.PI/2)*1.2:Math.sin(a.clock*3)*.45;
    if(a.dying>=0){a.dying+=dt;frame=12+Math.min(3,Math.floor(a.dying/.14));bob=0;}
    else if(a.attack>0&&!(a.name==='survivor'&&moving)){const duration=a.name==='survivor'?.17:.4;frame=8+Math.min(3,Math.floor((1-a.attack/duration)*4));}
    else if(moving)frame=Math.floor(a.clock*fps)%8;
    if(frame!==a.frame){a.frame=frame;a.sprite.spriteFrame=this.clips.get(a.name)![frame];this.animationChanges++;}
    const recoil=a.name==='survivor'?a.attack/.17:0;
    a.body.setPosition(-facing*recoil*4,a.base*.40625+bob);
    a.body.setScale(facing,1,1);
    a.body.angle=a.dying>=0?0:a.name==='survivor'?-facing*recoil*5:moving?Math.sin(a.clock*fps*Math.PI/4)*2:0;
    if(a.dying>=0)a.sprite.color=color('#d0c4a2',Math.round(255*Math.min(1,Math.max(0,(.95-a.dying)/.3))));
    const step=Math.floor(a.clock*fps/4);
    if(moving&&dt>0&&step!==a.step&&a.dying<0){
      a.step=step;if(a.name==='survivor'||a.base>120)this.combatFx.footstep(a.root.position.x,a.root.position.y);
    }
  }
  private animatePlayer(dt:number):void {
    const a=this.player,s=this.sim;
    const landed=this.runCycle.advance(s.x,s.y,dt,s.facing,s.dashTime>0);
    a.clock+=dt;a.attack=Math.max(0,a.attack-dt);a.facing=s.facing;
    let frame=8,clip:string=s.hero.id;
    if(a.dying>=0){a.dying+=dt;frame=12+Math.min(3,Math.floor(a.dying/.14));}
    else if(this.runCycle.moving){
      clip=s.hero.id+'-run';
      // Locomotion takes priority over the stationary whole-body reload clip.
      // Reload progress continues in Simulation while these feet keep stepping.
      frame=this.runCycle.frame;
    }
    else if(s.reloading){
      clip=s.hero.id+'-reload';
      frame=Math.min(15,Math.floor(s.reloadProgress*16));
    }
    else if(a.attack>0){
      clip=s.hero.id+'-fire';
      frame=Math.min(15,Math.floor((1-a.attack/.17)*16));
    }
    else {
      clip=s.hero.id+'-idle';
      frame=Math.floor(this.visualClock*8)%16;
    }
    const asset=this.clips.get(clip)![frame];
    if(a.sprite.spriteFrame!==asset){a.sprite.spriteFrame=asset;this.animationChanges++;}
    a.frame=frame;
    this.playerClip=clip;
    // Full-body clips already carry natural motion; keep their sole baseline fixed.
    const recoil=a.attack/.17;
    a.body.setPosition(-s.facing*recoil*1.8,a.base*.40625);
    a.body.setScale(s.facing,1,1);
    a.body.angle=a.dying>=0?0:-s.facing*(recoil*1.5+(this.runCycle.dashing?8:0));
    if(a.dying>=0)a.sprite.color=color('#d0c4a2',Math.round(255*Math.min(1,Math.max(0,(.95-a.dying)/.3))));
    if(landed&&a.dying<0)this.combatFx.footstep(s.x,s.y);
  }
  private renderWorld(dt:number):void {
    this.renderBossAlert();
    const s=this.sim;this.world.active=s.phase!=='menu';this.floor.active=s.phase==='menu';if(s.phase==='menu'){this.player.root.active=false;this.floor.setPosition(0,0);return;}
    const shake=s.phase==='playing'&&!this.reducedMotion?s.trauma*s.trauma:0;
    const visibleH=this.combatView.top-this.combatView.bottom,centerY=(this.combatView.top+this.combatView.bottom)/2;
    const boundX=Math.max(0,MAP.width/2-this.hudSize.w/2/this.scale+48);
    const boundY=Math.max(0,MAP.height/2-visibleH/2/this.scale);
    // Frame feet plus the full sprite above them, including when hugging a wall.
    this.cameraPosition={x:Math.max(-boundX,Math.min(boundX,s.x)),y:Math.max(-boundY-32,Math.min(boundY+112,s.y+40))};
    this.world.setPosition(-this.cameraPosition.x*this.scale+Math.sin(s.time*91)*shake*5,centerY-this.cameraPosition.y*this.scale+Math.cos(s.time*113)*shake*4);
    this.player.root.active=true;this.player.root.setPosition(s.x,s.y);
    this.heroAura.update(dt,{x:s.x,y:s.y,tier:s.awakeningTier,frenzy:s.frenzyTime,accent:s.hero.accent,reduced:this.reducedMotion,alive:s.hp>0&&s.phase!=='won'});
    if(s.phase==='dead'&&this.player.dying<0)this.player.dying=0;
    this.animatePlayer(dt);
    if(this.player.dying<0)this.player.sprite.color=!this.reducedMotion&&s.invulnerable>0&&Math.floor(s.time*20)%2===0?color('#ffffff',145):Color.WHITE;
    this.ghostClock+=dt;
    if(s.dashTime>0&&!this.reducedMotion&&this.ghostClock>.025){
      this.ghostClock=0;this.combatFx.ghost(this.player.sprite.spriteFrame!,s.x,s.y+this.player.base*.40625,this.player.base,s.facing);
    }
    const live=new Set(s.enemies.map(e=>e.id));
    for(const [id,a]of Array.from(this.actors.entries()))if(!live.has(id)){a.root.destroy();this.actors.delete(id);}
    for(const e of s.enemies){let a=this.actors.get(e.id);if(!a){a=this.enemyActor(e.kind,e.boss?.id,e.boss?.tier);a.clock=e.id*.137;this.actors.set(e.id,a);}
      if(dt>0)a.moving=Math.hypot(a.root.position.x-e.x,a.root.position.y-e.y)>.01;
      if(dt>0&&(e.warning>0||(e.boss?.castRemaining||0)>0||e.boss?.barrage))a.attack=.4;
      if(dt>0&&e.boss&&e.boss.pursuitRemaining>0)a.attack=0;
      a.root.setPosition(e.x,e.y);
      this.animateActor(a,dt,a.moving,e.boss&&(e.boss.castRemaining>0||e.boss.chargeRemaining>0||e.boss.pursuitRemaining>0)?Math.cos(e.boss.angle)>=0?1:-1:s.x>=e.x?1:-1,e.boss&&e.boss.pursuitRemaining>0?15:e.kind==='runner'?15:e.kind==='brute'||e.kind==='boss'?7:9);
      if(e.boss&&e.boss.pursuitRemaining>0&&dt>0&&!this.reducedMotion&&Math.floor(this.visualClock*12)!==Math.floor((this.visualClock-dt)*12))this.combatFx.ghost(a.sprite.spriteFrame!,e.x,e.y+a.base*.40625,a.base,a.facing);
      a.sprite.color=e.flash>0?color('#fff6bb'):e.slowTime>0?color('#96dded'):e.kind==='runner'?color('#c5d7a7'):e.boss?.tier==='elite'?color('#f4d9a1'):e.boss?.phase===3?color('#ffe1c0'):Color.WHITE;
    }
    for(const a of this.dying){this.animateActor(a,dt,false,a.facing,0);if(a.dying>=.95)a.root.destroy();}
    this.dying=this.dying.filter(a=>a.dying<.95);
    // Sort by feet position so foreground characters occlude those behind them.
    const sorted=Array.from(this.actors.values()).concat(this.player,this.dying).map(a=>a.root).concat(this.sceneMap.props).sort((a,b)=>b.position.y-a.position.y);
    sorted.forEach((n,i)=>n.setSiblingIndex(i));this.sceneMap.ground.setSiblingIndex(0);this.sceneMap.depth.setSiblingIndex(1);this.fx.node.setSiblingIndex(2);
    this.sceneMap.drawDebug(s);this.sceneMap.debug.node.setSiblingIndex(this.world.children.length-1);
    this.sceneMap.drawMap(s,s.enemies,this.hudSize.w/this.scale,visibleH/this.scale,this.cameraPosition);
    this.combatFx.root.setSiblingIndex(this.world.children.length-1);this.combatFx.update(dt);
    for(const n of this.damageNumbers){
      n.age+=dt;const t=Math.min(1,n.age/n.life);n.label.node.setPosition(n.x,n.y+32*(1-Math.pow(1-t,2)));
      n.label.node.setScale(1+Math.max(0,.18-n.age)*1.8,1+Math.max(0,.18-n.age)*1.8,1);
      n.label.color=color(n.ink,Math.round(255*(1-t*t)));n.label.node.setSiblingIndex(this.world.children.length-1);
      if(t>=1)n.label.node.destroy();
    }
    this.damageNumbers=this.damageNumbers.filter(n=>n.age<n.life);
    const g=this.fx;g.clear();
    this.mineView.update(s.mines,this.reducedMotion);
    if(s.shieldMax){
      g.fillColor=color('#1c343b',230);g.rect(s.x-22,s.y-35,44,4);g.fill();
      g.fillColor=color('#91dafa');g.rect(s.x-22,s.y-35,44*s.shield/s.shieldMax,4);g.fill();
    }
    for(const e of s.enemies)if(e.markHits){
      for(let i=0;i<3;i++){g.fillColor=color(i<e.markHits?'#ffe2a3':'#554c38',230);g.rect(e.x-12+i*9,e.y+86,6,5);g.fill();}
    }
    g.strokeColor=color(C.orange,45);g.lineWidth=1;g.circle(s.x,s.y,24);g.stroke();
    if(s.reloading){
      g.fillColor=color(C.ink,230);g.roundRect(s.x-27,s.y-25,54,8,3);g.fill();
      g.fillColor=color(C.orange);g.rect(s.x-24,s.y-23,48*s.reloadProgress,4);g.fill();
    }
    if(s.dashTime>0){g.strokeColor=color(C.orange,150);g.lineWidth=5;g.moveTo(s.x-s.dashX*50,s.y-s.dashY*50);g.lineTo(s.x,s.y);g.stroke();}
    for(const d of s.drops){
      const size=d.bossLoot?1.5:1,bounce=d.bossLoot&&!this.reducedMotion?Math.sin(Math.min(1,(d.age||0)/.35)*Math.PI)*20:0,x=d.x,y=d.y+bounce;
      if(d.bossLoot){g.fillColor=color(C.ink,160);g.ellipse(x,d.y-3,9,3);g.fill();}
      g.fillColor=color(d.kind==='heal'?C.red:C.teal);
      if(d.kind==='heal'){g.rect(x-3*size,y-8*size,6*size,16*size);g.rect(x-8*size,y-3*size,16*size,6*size);}
      else{g.moveTo(x,y+6*size);g.lineTo(x+4*size,y);g.lineTo(x,y-6*size);g.lineTo(x-4*size,y);g.close();}g.fill();
      if(d.bossLoot&&d.kind==='xp'){g.fillColor=color('#e3fff0');g.circle(x-1,y+2,2);g.fill();}
    }
    for(const h of s.map.hazards){const phase=hazardPhase(s.time,h);g.strokeColor=color(h.kind==='heat'?C.orange:'#a8ce66',phase==='off'?50:200);g.lineWidth=phase==='active'?4:2;g.circle(h.x,h.y,h.radius);g.stroke();if(phase==='active'){g.fillColor=color(h.kind==='heat'?C.orange:'#a8ce66',65);g.fill();}}
    for(const e of s.enemies)if(e.warning>0){g.lineWidth=3;g.strokeColor=color(e.kind==='bomber'?C.red:e.kind==='summoner'?'#c798d9':C.orange,210);if(e.kind==='charger'){g.moveTo(e.x,e.y);g.lineTo(e.x+e.chargeX*250,e.y+e.chargeY*250);}else g.circle(e.x,e.y,e.kind==='bomber'?100:e.kind==='summoner'?65:35);g.stroke();}
    this.drawBossTelegraphs(g);
    this.projectileView.begin();this.projectileView.root.setSiblingIndex(this.fx.node.getSiblingIndex()+1);
    for(const b of s.enemyProjectiles){
      this.projectileView.draw(b.id,b.x,b.y+28,b.vx,b.vy,b.style==='warden'?1:b.style==='furnace'?2:3,52,this.reducedMotion?0:this.visualClock);
    }
    for(const b of s.bullets){const powerful=b.empowered||!!b.blast;
      // Ease the tracer from the authored barrel to the common enemy hit height.
      // Collision coordinates and damage remain exclusively in Simulation.
      const birth=Math.max(0,1-(.85-b.life)/.15),muzzle=this.heroMuzzle(0,0,b.vx>=0?1:-1);
      const bx=b.x+muzzle.x*birth,by=b.y+43+(muzzle.y-43)*birth;
      this.line(g,bx-b.vx*(powerful?.023:.012),by-b.vy*(powerful?.023:.012),bx,by,powerful?'#ffd480':'#9ef7ef',powerful?3:1.5);
      this.projectileView.draw(b.id,bx,by,b.vx,b.vy,0,powerful?56:42,this.reducedMotion?0:this.visualClock);}
    this.projectileView.end();
    const liveText=new Set<number>();
    for(const p of s.effects){const alpha=Math.round(255*p.life/p.maxLife);
      if(p.kind==='damage'){liveText.add(p.id);let l=this.texts.get(p.id);if(!l){l=this.text(this.world,p.text||'',p.x,p.y,21,C.red,100);this.texts.set(p.id,l);}l.node.setPosition(p.x,p.y);l.color=color(C.red,alpha);continue;}
      if(p.kind==='pulse'){g.lineWidth=3;g.strokeColor=color(C.teal,alpha);g.circle(p.x,p.y,Number(p.text)*(1-p.life/p.maxLife));g.stroke();continue;}
      g.fillColor=color(p.kind==='spark'?C.orange:p.kind==='blood'?C.green:C.teal,alpha);g.circle(p.x,p.y,p.kind==='blood'?3:2);g.fill();
    }
    for(const[id,l]of Array.from(this.texts.entries()))if(!liveText.has(id)){l.node.destroy();this.texts.delete(id);}
    for(const e of s.enemies)if(e.kind==='brute'||e.kind==='boss'){const w=e.kind==='boss'?100: 50;g.fillColor=color(C.ink);g.rect(e.x-w/2,e.y+e.radius*2.5,w,4);g.fill();g.fillColor=color(C.red);g.rect(e.x-w/2,e.y+e.radius*2.5,w*e.hp/e.maxHp,4);g.fill();}
  }
  private drawBossTelegraphs(g:Graphics):void {
    const s=this.sim;
    for(const z of s.bosses.zones){
      const hex=z.kind==='acid'?'#badb70':z.kind==='fire'?'#f59253':'#edb963';
      g.fillColor=color(hex,z.warning>0?35:95);g.circle(z.x,z.y,z.radius);g.fill();
      g.strokeColor=color(hex,235);g.lineWidth=z.warning>0?2:4;g.circle(z.x,z.y,z.radius);g.stroke();
      if(z.warning>0){g.lineWidth=3;g.circle(z.x,z.y,z.radius*(1-z.warning/z.warningTotal));g.stroke();}
    }
    for(const e of s.enemies){const b=e.boss;if(!b)continue;const hex=b.tier==='elite'?'#ffd089':BOSSES[b.id].accent;
      if(b.tier==='elite'){g.strokeColor=color(hex,210);g.lineWidth=2;g.circle(e.x,e.y,e.radius+8);g.stroke();}
      if(b.pursuitRemaining>0){g.strokeColor=color('#ff555e',220);g.lineWidth=4;g.circle(e.x,e.y,e.radius+12);g.moveTo(e.x,e.y);g.lineTo(e.x+Math.cos(b.angle)*85,e.y+Math.sin(b.angle)*85);g.stroke();}
      if(b.phase>1||b.transition>0){g.strokeColor=color(hex,180);g.lineWidth=b.transition>0?5:2;g.circle(e.x,e.y,e.radius+12+b.phase*5);g.stroke();
        for(let i=0;i<b.phase;i++){const x=e.x+(i-(b.phase-1)/2)*14;g.fillColor=color(hex);g.moveTo(x,e.y-63);g.lineTo(x+5,e.y-69);g.lineTo(x,e.y-75);g.lineTo(x-5,e.y-69);g.close();g.fill();}}
      if(b.castRemaining<=0)continue;
      const x=e.x,y=e.y,dx=Math.cos(b.angle),dy=Math.sin(b.angle);
      g.strokeColor=color(hex,210);g.fillColor=color(hex,35);g.lineWidth=2;
      if(b.skill==='hunt'){
        g.strokeColor=color('#ff5965',230);g.lineWidth=3;g.circle(x,y,e.radius+22);
        g.moveTo(x+dx*75-dy*20,y+dy*75+dx*20);g.lineTo(x+dx*110,y+dy*110);g.lineTo(x+dx*75+dy*20,y+dy*75-dx*20);g.stroke();
      }else if(b.skill==='rush'){
        const length=b.phase===3?378:313,r=e.radius;
        g.moveTo(x-dy*r,y+dx*r);g.lineTo(x+dx*length-dy*r,y+dy*length+dx*r);g.lineTo(x+dx*length+dy*r,y+dy*length-dx*r);g.lineTo(x+dy*r,y-dx*r);g.close();g.fill();g.stroke();
      }else if(b.skill==='volley'||b.skill==='nova'){
        for(const a of barrageAngles(b.skill,b.phase,b.tier,b.angle)){
          const length=b.skill==='volley'?310:145;
          g.moveTo(x+Math.cos(a)*65,y+Math.sin(a)*65);g.lineTo(x+Math.cos(a)*length,y+Math.sin(a)*length);g.stroke();
        }
      }else if(b.skill==='summon'){g.circle(x,y,95);g.stroke();}
    }
  }
  private renderHUD():void {
    const s=this.sim,w=this.W;this.hpLabel.string=`${Math.ceil(s.hp)} / ${s.maxHp}`;
    this.timeLabel.string=this.formatTime(s.time);this.killLabel.string=w<1000?`击杀 ${s.kills}`:String(s.kills);this.levelLabel.string=`LV.${String(s.level).padStart(2,'0')}`;
    this.waveLabel.string=`${s.arena.difficulty} · 第 ${s.wave} / ${s.arena.waves} 波`;
    this.coinLabel.string=`本局 +${s.coins} 金币`;
    this.dashLabel.string=s.dashCooldown>0?`${s.dashCooldown.toFixed(1)} 秒`:w<1000?'就绪 · 无敌':'空格 · 就绪';
    this.dashFace.color=color(s.dashCooldown>0?'#a6a89d':'#ffffff');
    this.bannerLabel.string=s.bannerTime>0?s.banner:'';
    this.ammoLabel.string=`${String(s.ammo).padStart(2,'0')} / ${s.magazineSize}`;
    this.ammoLabel.color=color(s.reloading?C.orange:s.ammo<=3?C.red:C.white);
    this.weaponLabel.string=s.awakeningTier?`${s.hero.signature} ${s.awakeningTier}阶`:'自动步枪';
    this.weaponLabel.color=color(s.awakeningTier?s.hero.accent:C.muted);
    this.ammoStatus.string=s.reloading?`装填 ${s.reloadTimer.toFixed(1)} 秒`:s.powerStatus;
    this.ammoStatus.color=color(s.frenzyTime>0?C.orange:C.muted);
    this.reloadButtonLabel.string=s.reloading?'换弹中':'换弹';
    this.reloadHint.string=s.reloading?`${Math.round(s.reloadProgress*100)}%`:s.ammo===s.magazineSize?'弹匣已满':w<1000?'点击装填':'R · 装填';
    this.reloadButtonLabel.color=color(s.reloading?C.orange:C.white);
    this.reloadFace.color=color(s.reloading?'#ffffff':s.ammo===s.magazineSize?'#a6b0a5':'#e7ebdc');
    const g=this.hudPaint;g.clear();
    const bar=(box:{x:number;y:number;w:number},value:number,ink:string,height:number)=>{
      g.fillColor=color('#384339');g.rect(box.x,box.y,box.w,height);g.fill();
      if(value>0){g.fillColor=color(ink);g.rect(box.x,box.y,box.w*Math.min(1,Math.max(0,value)),height);g.fill();}
    };
    bar(this.hudGeometry.health,s.hp/s.maxHp,s.hp/s.maxHp<.3?C.red:C.green,6);
    bar(this.hudGeometry.xp,s.xp/s.xpNext,C.teal,3);
    bar(this.hudGeometry.ammo,s.reloading?s.reloadProgress:s.ammo/s.magazineSize,s.reloading?C.orange:s.ammo<=3?C.red:C.teal,5);
    const boss=s.enemies.find(e=>e.finalBoss&&e.hp>0)||s.enemies.find(e=>e.boss&&e.hp>0),state=boss?.boss;
    this.bossLabel.string=state?`${state.tier==='elite'?'精英 · ':''}${bossName(state)} · ${state.phase} / ${state.tier==='elite'?2:3} 阶段`:'';
    this.bossSkillLabel.string=state?state.arrival>0?'首领降临 · 准备战斗':state.barrage?`${bossSkillName(state.id,state.barrage.skill)} · ${state.barrage.wave} / ${state.barrage.total} 连发`:state.pursuitRemaining>0?'加速追猎 · 移动躲避，近身时冲刺':state.recovery>0?'攻击后摇 · 抓住反击机会':state.transition>0?'阶段进化 · 拉开距离':state.castRemaining>0?`${bossSkillName(state.id,state.skill!)} · ${state.castRemaining.toFixed(1)}秒`:state.chargeRemaining>0?'冲锋中 · 避开路线':BOSSES[state.id].phaseNames[state.phase-1]:'';
    this.bossPlate.active=!!boss&&!s.bossWarning;
    this.bannerPlate.active=s.bannerTime>0&&!boss&&!s.bossWarning;
    if(this.bossPlate.active&&boss){
      const {x,y,w}=this.hudGeometry.boss;bar({x,y,w},boss.hp/boss.maxHp,BOSSES[boss.boss!.id].accent,6);
      for(const ratio of (state?.tier==='elite'?[.5]:[.33,.66])){g.fillColor=color(C.ink);g.rect(x+w*ratio,y-1,2,8);g.fill();}
    }
  }
  onDestroy():void {
    this.heroAura?.destroy();
    for(const frames of Array.from(this.clips.values()))for(const frame of frames)frame.destroy();
    input.off(Input.EventType.KEY_DOWN,this.onKeyDown,this);input.off(Input.EventType.KEY_UP,this.onKeyUp,this);
    input.off(Input.EventType.TOUCH_START,this.onTouchStart,this);input.off(Input.EventType.TOUCH_MOVE,this.onTouchMove,this);
    input.off(Input.EventType.TOUCH_END,this.onTouchEnd,this);input.off(Input.EventType.TOUCH_CANCEL,this.onTouchEnd,this);game.off(Game.EVENT_HIDE,this.hideHandler);if(typeof window!=='undefined')window.removeEventListener('storage',this.storageHandler);
  }
}
