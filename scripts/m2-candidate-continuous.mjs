const task=await taskSpace(62),page=task.page('p1'),fs=await import('node:fs/promises')
const path='/Users/leizhenyang/projects/smartwater-ai/docs/acceptance/m1-stability-r1/m2-continuous.json'
const log={kind:'12-minute INTERACTION-PRIORITY candidate confirmation. Active20-move blocks and actual tool actions alternate with idle. Idle draw counts never scored as FPS. Not the original constant-animation load.',windows:[],done:false}
await page.goto('http://127.0.0.1:4173/?qa=1');await page.cdp('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:2,mobile:false});await page.waitForFunction(()=>__SW_M1__?.snapshot().firstRenderMs>0,undefined,{timeout:20000})
log.build=await page.evaluate(()=>fetch('/build-id.json').then(r=>r.json()).then(x=>x.build_id))
const idleProbe=async mode=>{await page.evaluate(m=>__SW_M1__.setRenderMode(m),mode);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const before=await page.evaluate(()=>__SW_M1__.snapshot());await new Promise(r=>setTimeout(r,3000));const after=await page.evaluate(()=>__SW_M1__.snapshot());return {mode,draws:after.frame-before.frame,before,after,notFps:true}}
log.idleComparison=[await idleProbe('full'),await idleProbe('interactive')]
await page.evaluate(()=>{
 window.__M2_CONTINUOUS__={start:new Date().toISOString(),startMono:performance.now(),windows:[],done:false}
 const a=__SW_M1__,state=__M2_CONTINUOUS__
 const run=async()=>{
  let index=0
  while(performance.now()-state.startMono<720000){
   const windowStart=performance.now();a.scenario(['NORMAL','LOW_DO','MISSING_DATA'][index%3]);a.range([1,6,24][index%3]);document.querySelector('.process-panel .text-button')?.click()
   const active=await a.measurePerformance(12)
   const focus=a.send('定位一号曝气池');await new Promise(r=>setTimeout(r,150));a.cancel();const cancelled=await focus;const reset=await a.send('回到总览')
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))
   const idleBefore=a.lightDiagnostics();await new Promise(r=>setTimeout(r,Math.max(0,60000-(performance.now()-windowStart))));const after=a.lightDiagnostics()
   const canvas=document.querySelector('.canvas-host canvas'),gl=canvas.getContext('webgl2')
   state.windows.push({index:++index,elapsedMs:performance.now()-state.startMono,active,cancelled,reset,idleDraws:after.frame-idleBefore.frame,after,actualBuffer:{width:gl.drawingBufferWidth,height:gl.drawingBufferHeight},contextLost:gl.isContextLost()})
  }
 }
 void run().then(()=>{state.done=true;state.end=new Date().toISOString();state.totalMs=performance.now()-state.startMono}).catch(error=>{state.done=true;state.error=String(error);state.end=new Date().toISOString();state.totalMs=performance.now()-state.startMono})
})
await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false})
let saved=0
for(let n=0;n<72;n++){
 await new Promise(r=>setTimeout(r,15000))
 const meta=await page.evaluate(()=>({count:__M2_CONTINUOUS__.windows.length,done:__M2_CONTINUOUS__.done,start:__M2_CONTINUOUS__.start,end:__M2_CONTINUOUS__.end,totalMs:__M2_CONTINUOUS__.totalMs,error:__M2_CONTINUOUS__.error}))
 if(meta.count>saved){const newWindows=await page.evaluate(i=>__M2_CONTINUOUS__.windows.slice(i),saved);log.windows.push(...newWindows);saved=meta.count;console.log('Candidate windows '+saved)}
 Object.assign(log,meta);await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false});await fs.writeFile(path,JSON.stringify(log,null,2)+'\n')
 if(meta.done)break
}
