// Isolated presentation fixtures + ordinary key events against the real Cocos export.
import fs from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
const out=new URL('../evidence/materials-20260924-run/runtime/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const ws=new WebSocket(process.argv[2]);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let next=1;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=next++;const timer=setTimeout(()=>reject(Error('CDP timeout '+method)),15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,sessionId}));});
const assert=(ok,message)=>{if(!ok)throw Error(message);};
try{
 const {targetInfos}=await call('Target.getTargets');const target=targetInfos.find(t=>t.type==='page'&&t.url.startsWith('http://127.0.0.1:8765'));
 const {sessionId}=await call('Target.attachToTarget',{targetId:target.targetId,flatten:true});
 const send=(method,params={})=>call(method,params,sessionId);await send('Runtime.enable');
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const setup=`const cc=System.get(System.resolve('cc'));const h=cc.director.getScene().getChildByName('Game').getComponent('Emberline');`;
 const run=body=>evaluate('(()=>{'+setup+body+'})()');
 const state=()=>evaluate('JSON.parse(render_game_to_text())');
 const key=(code,down)=>evaluate(`document.getElementById('GameCanvas').dispatchEvent(new KeyboardEvent('${down?'keydown':'keyup'}',{code:'${code}',bubbles:true}))`);
 const tap=async code=>{await key(code,true);await key(code,false);};
 const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(new URL(name,out),Buffer.from(r.data,'base64'));};
 await send('Page.reload',{ignoreCache:true});let ready=false;
 for(let i=0;i<100;i++){if(await evaluate('window.emberlineReady===true')){ready=true;break;}await delay(100);}assert(ready,'load failed');
 await run('h.startGame();h.sim.spawnTimer=1000;');await key('KeyD',true);
 const samples=[];
 for(let i=0;i<45;i++){samples.push(await state());await delay(25);}
 await shot('running-right.png');
 const moving=samples.filter(s=>s.animation.playerClip==='survivor-run');
 assert(moving.length>35,'run clip missing');
 assert(new Set(moving.map(s=>s.animation.playerFrame)).size>=14,'run frames not cycling');
 await tap('KeyP');const paused=await state();await delay(250);assert(JSON.stringify(paused)===JSON.stringify(await state()),'pause not frozen');await tap('KeyP');
 for(let i=0;i<100;i++){if((await state()).player.x>=550)break;await delay(30);}
 await delay(120);const wall=await state();assert(wall.player.x===550&&!wall.animation.run.moving&&wall.animation.playerClip==='survivor','wall running continues');
 await key('KeyD',false);await key('KeyA',true);await delay(350);const left=await state();
 assert(left.animation.playerClip==='survivor-run'&&left.player.x<550,'left run missing');await shot('running-left.png');
 await key('KeyA',false);await delay(80);const idle=await state();assert(idle.animation.playerClip==='survivor'&&!idle.animation.run.moving,'idle missing');
 await tap('Space');await delay(70);const dash=await state();assert(dash.animation.run.dashing&&dash.animation.playerFrame===4,'dash leg hold missing');
 await delay(300);await run('h.startGame();h.sim.spawnTimer=1000;h.sim.spawn("brute",{x:-150,y:0});');await key('KeyD',true);await delay(180);
 const back=await state();assert(back.animation.run.backwards&&back.animation.playerClip==='survivor-run','backpedal missing');
 await key('KeyD',false);
 await run('h.startGame();h.sim.spawnTimer=1000;h.sim.upgrades.speed=2;');await key('KeyD',true);
 const fast0=await state();await delay(300);const fast1=await state();
 const travelled=fast1.player.x-fast0.player.x,cycles=fast1.animation.run.phase-fast0.animation.run.phase;
 assert(Math.abs(travelled/104-cycles)<.003,'speed upgrade cadence disconnected from distance');await key('KeyD',false);
 const report={result:'passed',type:'Cocos Web presentation fixture; keys use input path, spawn suppression isolates gait',framesSeen:[...new Set(moving.map(s=>s.animation.playerFrame))],paused:true,wall,idle,left,dash,backpedal:back,speed:{travelled,cycles},samples,errors};
 assert(errors.length===0,'browser exception');fs.writeFileSync(new URL('run-report.json',out),JSON.stringify(report,null,2));
 console.log(JSON.stringify({result:report.result,framesSeen:report.framesSeen,wallStopped:true,pauseFrozen:true,idle:true,left:true,dash:true,backpedal:true,speed:report.speed,errors}));
 await run('h.returnMenu();');
}finally{ws.close();}
