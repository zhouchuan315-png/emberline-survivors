// Run against the isolated test browser URL from `agent-browser get cdp-url`.
import fs from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
const ws=new WebSocket(process.argv[2]);
const outputDir=process.argv[3]?new URL('file://'+process.argv[3].replace(/\/$/,'')+'/'):new URL('../evidence/runtime/',import.meta.url);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let next=1;const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const {resolve,reject,timer}=pending.get(m.id);clearTimeout(timer);pending.delete(m.id);m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result);}};
const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=next++;const timer=setTimeout(()=>reject(new Error('CDP timeout '+method)),15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,sessionId}));});
try{
 const targets=await call('Target.getTargets');const target=targets.targetInfos.find(x=>x.type==='page'&&x.url.startsWith('http://127.0.0.1:8765'));
 if(!target)throw new Error('Game page not found');
 const {sessionId}=await call('Target.attachToTarget',{targetId:target.targetId,flatten:true});
 const send=(method,params={})=>call(method,params,sessionId);
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await send('Page.reload',{ignoreCache:true});
 let ready=false;for(let i=0;i<100;i++){if(await evaluate('window.emberlineReady===true')){ready=true;break;}await delay(200);}if(!ready)throw new Error('Game did not load');
 const touch=async(type,x,y)=>send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:0,radiusX:5,radiusY:5,force:1}]});
 await touch('touchStart',195,395);await delay(80);await touch('touchEnd');await delay(180);
 const before=await evaluate('JSON.parse(window.render_game_to_text())');
 if(before.phase!=='playing')throw new Error('Tap did not start game');
 await touch('touchStart',90,570);await delay(100);await touch('touchMove',145,570);await delay(650);
 const during=await evaluate('JSON.parse(window.render_game_to_text())');
 await touch('touchEnd');await delay(100);
 await touch('touchStart',332,697);await delay(60);await touch('touchEnd');await delay(100);
 const dash=await evaluate('(()=>{const c=System.get(System.resolve("cc"));return c.director.getScene().getChildByName("Game").getComponent("Emberline").sim.dashCooldown;})()');
 const result={device:'iPhone 14 emulation; 390×844 CSS, DPR 3',input:'CDP Input.dispatchTouchEvent (touch emulation enabled before reload)',before,during,moved:during.player.x-before.player.x,dashCooldown:dash,
   capabilities:await evaluate('({touchPoints:navigator.maxTouchPoints,touches:System.get(System.resolve("cc")).sys.capabilities.touches})')};
 if(result.moved<50)throw new Error('Joystick did not move player: '+JSON.stringify(result));
 if(dash<=0)throw new Error('Dash touch did not trigger: '+JSON.stringify(result));
 const capture=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(new URL('mobile-touch.png',outputDir),Buffer.from(capture.data,'base64'));
 await touch('touchStart',362,130);await delay(80);await touch('touchEnd');await delay(100);
 result.paused=await evaluate('JSON.parse(window.render_game_to_text()).phase');
 fs.writeFileSync(new URL('mobile-touch.json',outputDir),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
}finally{ws.close();}
