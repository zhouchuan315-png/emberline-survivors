/** Distance-driven presentation only; independent of the simulation clock/RNG. */
export class RunCycle {
  phase=0;
  moving=false;
  dashing=false;
  backwards=false;
  private x=0;
  private y=0;
  reset(x=0,y=0):void {this.x=x;this.y=y;this.phase=0;this.moving=false;this.dashing=false;this.backwards=false;}
  advance(x:number,y:number,dt:number,facing:number,dashing:boolean):boolean {
    if(dt<=0)return false;
    const dx=x-this.x,dy=y-this.y,distance=Math.hypot(dx,dy);
    this.x=x;this.y=y;this.moving=distance>dt*4;this.dashing=dashing&&this.moving;
    this.backwards=Math.abs(dx)>Math.abs(dy)*.35&&dx*facing<0;
    if(!this.moving||this.dashing)return false;
    const previous=Math.floor(this.phase*2);
    // Two steps per 104 world units; a speed boost increases cadence continuously.
    this.phase+=distance/104*(this.backwards?-1:1);
    return Math.floor(this.phase*2)!==previous;
  }
  get frame():number {return this.dashing?4:Math.floor(((this.phase%1+1)%1)*16)%16;}
  snapshot():object {return {phase:+this.phase.toFixed(4),moving:this.moving,dashing:this.dashing,backwards:this.backwards,frame:this.frame};}
}
