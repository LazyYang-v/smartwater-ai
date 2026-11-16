// Run serially, without screenshots, profiling or other browser tests.
const task=await taskSpace(62),page=task.page('p1'),fs=await import('node:fs/promises')
const base='/Users/leizhenyang/projects/smartwater-ai/docs/acceptance/m1-stability-r1/performance/'
await fs.mkdir(base,{recursive:true})
for(const p of await task.pages())await p.cdp('Emulation.setFocusEmulationEnabled',{enabled:false})
await task.cdp('Target.activateTarget',{targetId:(await task.tabs()).find(t=>t.label==='p1').targetId})
await page.goto('http://127.0.0.1:4173/?qa=1')
await page.cdp('Emulation.clearDeviceMetricsOverride',{})
const nativeDprBeforeOverride=await page.evaluate(()=>devicePixelRatio)
await page.cdp('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:2,mobile:false})
await page.waitForFunction(()=>window.__SW_M1__?.snapshot().status==='ready'&&document.querySelectorAll('.trend-chart svg').length===2,undefined,{timeout:20000})
const identity=await page.evaluate(()=>fetch('/build-id.json').then(r=>r.json()))
const binding=await page.evaluate(async()=>{
 const hashes={}
 for(const el of document.querySelectorAll('script[src],link[rel=stylesheet][href]')){
  const url=el.src||el.href,bytes=await fetch(url,{cache:'no-store'}).then(r=>r.arrayBuffer())
  hashes[new URL(url).pathname]=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('')
 }
 const gl=document.querySelector('.canvas-host canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info')
 const gpu={renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),contextAttributes:gl.getContextAttributes()}
 return {at:new Date().toISOString(),gpu,hashes,loadedModelSha256:__SW_M1__.snapshot().loadedModelSha256,entries:performance.getEntriesByType('resource').filter(e=>/\.(js|css|glb|hdr)(\?|$)/.test(e.name)).map(e=>({url:e.name,duration:e.duration,decodedBodySize:e.decodedBodySize})),nativeDpr:devicePixelRatio}
})
for(const [p,hash] of Object.entries(binding.hashes))if(identity.files[p.slice(1)]?.sha256!==hash)throw new Error('Actual browser entry mismatch')
if(binding.loadedModelSha256!==identity.glb_sha256)throw new Error('Actually loaded GLB mismatch')
await fs.writeFile(base+'browser-build-binding.json',JSON.stringify({build_id:identity.build_id,nativeDprBeforeOverride,binding},null,2)+'\n')
const trials=[]
for(let round=1;round<=3;round++)for(const mode of ['A','B','C']){
 await page.evaluate(mode=>{const a=window.__SW_M1__;a.stopDiagnostics();a.diagnosticSwitch({chartsPaused:false,scenePaused:false});a.setPixelRatio(1);a.scenario('NORMAL');a.pause(mode==='A');a.range(1);a.panels({left:false,trends:false,tab:'do'})},mode)
 // Two actual camera actions warm selection/record and shader paths before each sample.
 await page.evaluate(async()=>{await __SW_M1__.send('定位一号曝气池');await __SW_M1__.send('回到总览')})
 const conditions=await page.evaluate(()=>({at:new Date().toISOString(),pageAgeMs:performance.now(),url:location.href,browser:navigator.userAgent,scene:__SW_M1__.snapshot(),dashboard:__SW_M1__.lightDiagnostics(),viewport:[innerWidth,innerHeight],visibility:document.visibilityState,policy:'All nine serial in one document; no reload or browser recreation. Native DOM DPR2, Three DPR1. A pauses demo clock only; B/C full updates. No screenshots or profiler during samples.'}))
 const tabs=(await task.tabs()).map(({label,targetId,url,active,openedBy})=>({label,targetId,url,active,openedBy}))
 await page.evaluate(mode=>{
  window.__STABILITY_TRIAL__={done:false}
  const a=window.__SW_M1__,longTasks=[],events=[],actions=[]
  const onVisibility=e=>events.push({at:performance.now(),state:document.visibilityState,trusted:e.isTrusted})
  document.addEventListener('visibilitychange',onVisibility)
  let observer,longTaskAvailable=false
  try{observer=new PerformanceObserver(list=>{for(const e of list.getEntries())longTasks.push({at:e.startTime,duration:e.duration})});observer.observe({type:'longtask',buffered:false});longTaskAvailable=true}catch{}
  const run=async()=>{
   if(mode!=='C')return a.measurePerformance(61)
   a.beginFrameSample();const start=performance.now();let i=0
   while(performance.now()-start<61500){
    a.range([1,6,24][i%3]);a.panels({tab:i%2?'blower_power':'do'})
    document.querySelector('.process-panel .text-button')?.click()
    const action=a.send(i%2?'回到总览':'定位一号曝气池')
    if(i%4===0){await new Promise(r=>setTimeout(r,100));a.cancel()}
    actions.push(await action);i++
   }
   return a.endFrameSample()
  }
  void run().then(measurement=>{window.__STABILITY_TRIAL__={done:true,measurement,actions,longTasks,longTaskAvailable,events}}).catch(error=>{window.__STABILITY_TRIAL__={done:true,error:String(error),actions,longTasks,longTaskAvailable,events}}).finally(()=>{observer?.disconnect();document.removeEventListener('visibilitychange',onVisibility)})
 },mode)
 await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false})
 let done=false
 for(let i=0;i<8;i++){await new Promise(r=>setTimeout(r,15000));done=await page.evaluate(()=>window.__STABILITY_TRIAL__.done);await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false});if(done)break}
 const result=await page.evaluate(()=>window.__STABILITY_TRIAL__)
 const final=await page.evaluate(()=>({scene:__SW_M1__.snapshot(),dashboard:__SW_M1__.lightDiagnostics(),records:__SW_M1__.records(),recordDom:document.querySelectorAll('.action-record').length}))
 await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false})
 const m=result.measurement,s=conditions.scene,f=final.scene
 const valid=done&&!result.error&&!m?.workload_error&&m?.sampled_duration_ms>=60000&&m.page_visible_throughout&&result.events.every(e=>e.state==='visible')&&m.loadedModelSha256===identity.glb_sha256&&m.rendererDpr===1&&m.canvas.width===s.canvas.width&&m.canvas.height===s.canvas.height&&m.drawingBuffer.width===s.drawingBuffer.width&&m.drawingBuffer.height===s.drawingBuffer.height&&final.dashboard.charts.active===2&&f.loadGeneration===s.loadGeneration&&f.activeRenderLoops===1
 const report={round,mode,build_id:identity.build_id,glb_sha256:identity.glb_sha256,conditions,tabs,result,final,valid,target:{fps:45,p95:40,passed:!!valid&&m.average_fps>=45&&m.p95_frame_ms<=40}}
 const file=`round-${round}-${mode}.json`;await fs.writeFile(base+file,JSON.stringify(report,null,2)+'\n')
 trials.push({file,round,mode,valid,average_fps:m?.average_fps,p95_frame_ms:m?.p95_frame_ms,frames_over_50_ms:m?.frames_over_50_ms,frames_over_100_ms:m?.frames_over_100_ms,longTasks:result.longTaskAvailable?result.longTasks.length:null,sampled_duration_ms:m?.sampled_duration_ms,passed:report.target.passed,error:result.error??m?.workload_error??null})
 await fs.writeFile(base+'summary.json',JSON.stringify(trials,null,2)+'\n');console.log(JSON.stringify(trials.at(-1)))
}
