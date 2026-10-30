import { Node, UITransform, Layers, Sprite, SpriteFrame, Graphics, Color, Label } from 'cc';
import { MAP, Point, LevelMap, createLevelMap } from './core/SceneMap';
const ink=(hex:string,alpha=255)=>{const c=new Color();Color.fromHEX(c,hex);c.a=alpha;return c;};
function node(name:string,parent:Node,w=100,h=100){const n=new Node(name);n.layer=Layers.Enum.UI_2D;parent.addChild(n);n.addComponent(UITransform).setContentSize(w,h);return n;}
/** Builds one playable level from twelve reusable terrain chunks and independent props. */
export class SceneView {
 readonly ground:Node;readonly depth:Node;readonly props:Node[]=[];readonly debug:Graphics;
 private minimap!:Graphics; private minimapRoot!:Node;
 debugVisible=false;
 constructor(parent:Node,frames:Map<string,SpriteFrame>,private level:LevelMap=createLevelMap(),texture='scene/ground'){
  this.ground=node('StitchedGround',parent,MAP.width,MAP.height);this.depth=node('DepthSortedObstaclesAndActors',parent,MAP.width,MAP.height);
  for(const chunk of this.level.chunks){
   const c=node(chunk.id+'-'+chunk.name,this.ground,MAP.chunkWidth,MAP.chunkHeight);c.setPosition(chunk.x,chunk.y);
   for(let y=0;y<4;y++)for(let x=0;x<5;x++){
    const t=node(`Ground-${x}-${y}`,c,MAP.tile+.15,MAP.tile+.15);t.setPosition(-240+x*MAP.tile,-180+y*MAP.tile);
    const s=t.addComponent(Sprite);s.sizeMode=Sprite.SizeMode.CUSTOM;s.spriteFrame=frames.get(texture)!;
   }
  }
  const paint=node('RoadMarkings',this.ground,MAP.width,MAP.height).addComponent(Graphics);
  paint.fillColor=ink('#1d2524',75);
  for(const x of [-600,0,600]){paint.rect(x-63,-720,126,1440);paint.fill();}
  for(const y of [-240,0,240]){paint.rect(-1200,y-53,2400,106);paint.fill();}
  paint.strokeColor=ink('#d0bd86',68);paint.lineWidth=2;
  for(const x of [-600,0,600])for(let y=-680;y<720;y+=76){paint.moveTo(x,y);paint.lineTo(x,y+26);paint.stroke();}
  for(const y of [-240,240])for(let x=-1150;x<1200;x+=82){paint.moveTo(x,y);paint.lineTo(x+30,y);paint.stroke();}
  // Parking/loading stencils are floor paint, not raised obstacles.
  for(const chunk of this.level.chunks){
   paint.strokeColor=ink('#b9b094',65);paint.lineWidth=3;paint.rect(chunk.x-212,chunk.y-181,424,327);paint.stroke();
   const label=node('ZoneStencil',this.ground,160,26);label.setPosition(chunk.x-110,chunk.y-197);
   const text=label.addComponent(Label);text.string=chunk.name;text.fontSize=14;text.lineHeight=20;text.color=ink('#d7cfae',100);
  }
  paint.strokeColor=ink('#848676');paint.lineWidth=18;paint.rect(-1192,-712,2384,1424);paint.stroke();
  paint.strokeColor=ink('#272f2c');paint.lineWidth=4;paint.rect(-1179,-699,2358,1398);paint.stroke();
  for(let x=-1160;x<1200;x+=60){paint.fillColor=ink('#b39551',160);paint.rect(x,-717,25,7);paint.rect(x,710,25,7);paint.fill();}
  for(const obstacle of this.level.obstacles){
   const root=node('Obstacle:'+obstacle.id+':'+obstacle.kind,this.depth,obstacle.width,obstacle.height);root.setPosition(obstacle.x,obstacle.y);
   const shadow=node('GroundShadow',root).addComponent(Graphics);shadow.fillColor=ink('#080f10',90);
   obstacle.hull.forEach((p,i)=>{if(i===0)shadow.moveTo(p.x-obstacle.x+7,p.y-obstacle.y-7);else shadow.lineTo(p.x-obstacle.x+7,p.y-obstacle.y-7);});shadow.close();shadow.fill();
   const body=node('GeneratedProp',root,obstacle.width,obstacle.height);body.setPosition(0,obstacle.lift);
   const sprite=body.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=frames.get('scene/'+obstacle.kind)!;
   this.props.push(root);
  }
  this.debug=node('CollisionOverlay',parent,MAP.width,MAP.height).addComponent(Graphics);this.debug.node.active=false;
 }
 attachMinimap(hud:Node,x:number,y:number,scale:number){
  this.minimapRoot=node('Minimap',hud,192,128);this.minimapRoot.setPosition(x,y);
  this.minimapRoot.setScale(scale,scale,1);
  this.minimap=this.minimapRoot.addComponent(Graphics);
 }
 drawMap(player:Point,enemies:Point[],viewWidth:number,viewHeight:number,camera:Point){
  const g=this.minimap;if(!g)return;g.clear();const sx=172/MAP.width,sy=103/MAP.height;
  g.fillColor=ink('#101b19',230);g.roundRect(-96,-64,192,128,6);g.fill();g.strokeColor=ink('#627264',170);g.lineWidth=1;g.rect(-86,-51.5,172,103);g.stroke();
  for(const o of this.level.obstacles){g.fillColor=ink(o.kind==='container'?'#91a574':'#74837c');o.hull.forEach((p,i)=>{if(i===0)g.moveTo(p.x*sx,p.y*sy);else g.lineTo(p.x*sx,p.y*sy);});g.close();g.fill();}
  g.strokeColor=ink('#e8e1c1',55);g.rect((camera.x-viewWidth/2)*sx,(camera.y-viewHeight/2)*sy,viewWidth*sx,viewHeight*sy);g.stroke();
  g.fillColor=ink('#df8067',190);for(const e of enemies.slice(0,60)){g.circle(e.x*sx,e.y*sy,1.35);g.fill();}
  g.fillColor=ink('#efb458');g.circle(player.x*sx,player.y*sy,3.3);g.fill();g.strokeColor=ink('#fff0ca');g.circle(player.x*sx,player.y*sy,5.3);g.stroke();
 }
 drawDebug(player:Point){
  this.debug.node.active=this.debugVisible;if(!this.debugVisible)return;const g=this.debug;g.clear();g.lineWidth=2;g.strokeColor=ink('#82dfb9',225);
  for(const o of this.level.obstacles){o.hull.forEach((p,i)=>{if(i===0)g.moveTo(p.x,p.y);else g.lineTo(p.x,p.y);});g.close();g.stroke();}
  g.strokeColor=ink('#ffc865');g.circle(player.x,player.y,MAP.playerRadius);g.stroke();
 }
}
