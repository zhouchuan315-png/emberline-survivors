// Paste into the browser console for a real-time, input-only automated playthrough.
// It observes game state, sends ordinary keyboard events, and never changes rules or health.
(() => {
  const cc=System.get(System.resolve('cc'));
  const host=cc.director.getScene().getChildByName('Game').getComponent('Emberline');
  const canvas=document.getElementById('GameCanvas');
  const held=new Set();
  const key=(code,down)=>canvas.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true}));
  const release=()=>{for(const code of held)key(code,false);held.clear();};
  const tap=code=>{key(code,true);key(code,false);};
  window.__playtestLog=[];
  window.__holdFirstUpgrade=true;
  window.__resumePlaytest=()=>{window.__holdFirstUpgrade=false;};
  if(window.__playtestTimer)clearInterval(window.__playtestTimer);
  let lastPhase='',lastLevel=0;
  window.__playtestTimer=setInterval(()=>{
    const s=host.sim;
    if(s.phase!==lastPhase||s.level!==lastLevel){window.__playtestLog.push(s.snapshot());lastPhase=s.phase;lastLevel=s.level;}
    if(s.phase==='upgrade'){
      release();if(window.__holdFirstUpgrade)return;
      const order=['multi','damage','rate','pierce','pulse','regen','vital','magnet','speed'];
      const choice=s.choices.reduce((best,c,i)=>order.indexOf(c.id)<order.indexOf(s.choices[best].id)?i:best,0);
      tap('Digit'+(choice+1));return;
    }
    if(s.phase!=='playing'){release();return;}
    const xp=s.drops.filter(d=>d.kind==='xp'||s.hp<s.maxHp*.7).sort((a,b)=>Math.hypot(a.x-s.x,a.y-s.y)-Math.hypot(b.x-s.x,b.y-s.y))[0];
    let best=-Infinity,bestX=0,bestY=0;
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4,x=s.x+Math.cos(a)*65,y=s.y+Math.sin(a)*65;
      let score=-Math.max(0,Math.abs(x)-510)*3-Math.max(0,Math.abs(y)-255)*3;
      for(const e of s.enemies){const d=Math.hypot(e.x-x,e.y-y)-e.radius;score-=18000/Math.max(12,d*d/10);}
      if(xp)score-=Math.hypot(xp.x-x,xp.y-y)*.8;else score-=Math.hypot(x,y)*.04;
      if(score>best){best=score;bestX=Math.cos(a);bestY=Math.sin(a);}
    }
    const wanted=new Set();if(bestX>.25)wanted.add('KeyD');if(bestX<-.25)wanted.add('KeyA');if(bestY>.25)wanted.add('KeyW');if(bestY<-.25)wanted.add('KeyS');
    for(const code of held)if(!wanted.has(code)){key(code,false);held.delete(code);}
    for(const code of wanted)if(!held.has(code)){key(code,true);held.add(code);}
    if(Math.min(...s.enemies.map(e=>Math.hypot(e.x-s.x,e.y-s.y)-e.radius))<50)tap('Space');
  },100);
  window.__stopPlaytest=()=>{clearInterval(window.__playtestTimer);release();};
  return 'Playtest controller ready; first upgrade is held for visual QA.';
})()
