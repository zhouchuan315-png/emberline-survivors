import { Node, Sprite, SpriteFrame, UITransform, Layers, Color } from 'cc';
import type { Mine } from './core/Simulation';

interface MineSprite { node:Node; sprite:Sprite; frame:number }

/** Ground props use simulation age, so arming and the idle loop freeze together. */
export class MineView {
  readonly root:Node;
  private live=new Map<number,MineSprite>();
  private pool:MineSprite[]=[];
  constructor(parent:Node,private frames:SpriteFrame[]) {
    this.root=new Node('Mines');this.root.layer=Layers.Enum.UI_2D;parent.addChild(this.root);
  }
  attach(parent:Node):void {this.root.setParent(parent);}
  update(mines:readonly Mine[],reduced:boolean):void {
    const ids=new Set(mines.map(m=>m.id));
    for(const [id,view] of Array.from(this.live.entries()))if(!ids.has(id)){
      view.node.active=false;this.live.delete(id);this.pool.push(view);
    }
    for(const mine of mines){
      let view=this.live.get(mine.id);
      if(!view){
        if(this.live.size>=9)continue;
        view=this.pool.pop();
        if(!view){
          const node=new Node('Mine');node.layer=Layers.Enum.UI_2D;this.root.addChild(node);
          node.addComponent(UITransform).setContentSize(52,52);
          const sprite=node.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;
          view={node,sprite,frame:-1};
        }
        view.node.active=true;this.live.set(mine.id,view);
      }
      // Frames 0–3 deploy, 4–15 breathe in place. Never replay deployment in the idle loop.
      const frame=mine.age<.45?(reduced?0:Math.min(3,Math.floor(mine.age/.45*4))):
        reduced?4:4+Math.floor((mine.age-.45)*10)%12;
      if(view.frame!==frame){view.sprite.spriteFrame=this.frames[frame];view.frame=frame;}
      view.node.setPosition(mine.x,mine.y);
      view.sprite.color=new Color(255,255,255,Math.round(255*Math.min(1,mine.life/.3)));
    }
  }
  clear():void {
    for(const view of Array.from(this.live.values()).concat(this.pool))view.node.destroy();
    this.live.clear();this.pool=[];
  }
  snapshot():{active:number;pooled:number;frames:number[]} {
    return {active:this.live.size,pooled:this.pool.length,frames:Array.from(this.live.values()).map(v=>v.frame)};
  }
}
