import { Node, Sprite, SpriteFrame, UITransform, Layers, Color } from 'cc';

interface ShotSprite {node:Node;sprite:Sprite}
/** Small pooled sprites; rule coordinates and collision radii remain in Simulation. */
export class ProjectileView {
  readonly root:Node;
  private live=new Map<number,ShotSprite>();private pool:ShotSprite[]=[];private seen=new Set<number>();
  private frames:SpriteFrame[];
  constructor(parent:Node,frames:SpriteFrame[]){
    this.root=new Node('Projectiles');this.root.layer=Layers.Enum.UI_2D;parent.addChild(this.root);this.frames=frames;
  }
  begin():void {this.seen.clear();}
  draw(id:number,x:number,y:number,vx:number,vy:number,row:number,size:number,time:number):void {
    this.seen.add(id);let shot=this.live.get(id);
    if(!shot){
      if(this.live.size>=512)return;
      shot=this.pool.pop();
      if(!shot){const node=new Node('Projectile');node.layer=Layers.Enum.UI_2D;this.root.addChild(node);node.addComponent(UITransform);
        const sprite=node.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;shot={node,sprite};}
      shot.node.active=true;this.live.set(id,shot);
    }
    shot.node.setPosition(x,y);shot.node.angle=Math.atan2(vy,vx)*180/Math.PI;
    shot.node.getComponent(UITransform)!.setContentSize(size,size);
    shot.sprite.spriteFrame=this.frames[row*4+(Math.floor(time*12+id)%4)];shot.sprite.color=Color.WHITE;
  }
  end():void {
    for(const [id,shot] of Array.from(this.live.entries()))if(!this.seen.has(id)){
      shot.node.active=false;this.live.delete(id);this.pool.push(shot);
    }
  }
  clear():void {for(const shot of Array.from(this.live.values()).concat(this.pool))shot.node.destroy();this.live.clear();this.pool=[];this.seen.clear();}
  snapshot():{active:number;pooled:number}{return {active:this.live.size,pooled:this.pool.length};}
}
