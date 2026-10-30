import { Color, EffectAsset, Layers, Material, Node, Sprite, SpriteFrame, Texture2D, UITransform, Vec4 } from 'cc';

interface AuraState {
  x:number; y:number; tier:number; frenzy:number; accent:string; reduced:boolean; alive:boolean;
}

/** One reusable GPU quad below actors. Its clock follows gameplay, not wall time. */
export class HeroAura {
  readonly root:Node;
  private readonly material:Material;
  private readonly texture:Texture2D;
  private readonly frame:SpriteFrame;
  private readonly params=new Vec4();
  private readonly tint=new Vec4();
  private readonly heroColor=new Color();
  private clock=0; private strength=0; private power=0; private surge=0;
  private reduced=false;

  constructor(ground:Node,effect:EffectAsset) {
    this.root=new Node('Hero-Shader-Aura');this.root.layer=Layers.Enum.UI_2D;ground.addChild(this.root);
    this.root.addComponent(UITransform).setContentSize(180,100);
    // Dedicated, unpackable UVs stay [0,1] even when the hero uses an atlas.
    this.texture=new Texture2D();this.texture.reset({width:2,height:2});
    this.texture.uploadData(new Uint8Array(16).fill(255));
    this.frame=new SpriteFrame();this.frame.texture=this.texture;this.frame.packable=false;
    this.material=new Material();this.material.initialize({effectAsset:effect});
    const sprite=this.root.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame=this.frame;sprite.customMaterial=this.material;
    this.clear();
  }

  attach(ground:Node):void {this.root.setParent(ground);}
  activate():void {this.surge=1;}

  update(dt:number,state:AuraState):void {
    if(!state.alive){this.clear();return;}
    this.root.setPosition(state.x,state.y+2);
    this.reduced=state.reduced;
    const target=state.frenzy>0?1:state.tier>0?0.36:0;
    if(dt>0){
      this.clock+=dt;
      const blend=1-Math.exp(-dt*10);
      this.strength+=(target-this.strength)*blend;
      this.power+=((state.frenzy>0?1:0)-this.power)*blend;
      this.surge=Math.max(0,this.surge-dt/0.85);
    }
    this.root.active=this.strength>0.005;
    Color.fromHEX(this.heroColor,state.accent);
    const mix=this.power;
    this.tint.set(this.heroColor.r/255*(1-mix)+mix,
      this.heroColor.g/255*(1-mix)+0.59*mix,this.heroColor.b/255*(1-mix)+0.15*mix,state.reduced?1:0);
    this.params.set(state.reduced?0:this.clock,this.strength*(state.reduced?0.75:1),this.power,state.reduced?0:this.surge);
    this.material.setProperty('auraParams',this.params);this.material.setProperty('auraTint',this.tint);
  }

  snapshot():object {
    return {renderer:'shader',effect:this.material.effectName,active:this.root.active,clock:this.clock,
      strength:this.strength,power:this.power,surge:this.surge,reduced:this.reduced,
      position:{x:this.root.position.x,y:this.root.position.y},params:[this.params.x,this.params.y,this.params.z,this.params.w]};
  }
  clear():void {
    this.clock=0;this.strength=0;this.power=0;this.surge=0;this.reduced=false;
    this.params.set(0,0,0,0);this.material.setProperty('auraParams',this.params);this.root.active=false;
  }
  destroy():void {this.root.destroy();this.material.destroy();this.frame.destroy();this.texture.destroy();}
}
