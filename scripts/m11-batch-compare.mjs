const task=await taskSpace(62),page=task.page('p1'),fs=await import('node:fs/promises')
const base='/Users/leizhenyang/projects/smartwater-ai/docs/acceptance/m1-stability-r1/batch-experiment/'
await page.goto('http://127.0.0.1:4181/?qa=1');await page.cdp('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:2,mobile:false})
await page.waitForFunction(()=>window.__SW_M1__?.snapshot().status==='ready',undefined,{timeout:20000})
await task.cdp('Target.activateTarget',{targetId:(await task.tabs()).find(t=>t.label==='p1').targetId})
const identity=await page.evaluate(()=>fetch('/build-id.json').then(r=>r.json())),results=[]
await page.evaluate(()=>{__SW_M1__.pause(true);__SW_M1__.setWaterPhase(0)})
const shots=[]
for(const enabled of [false,true]){
 const stats=await page.evaluate(e=>__SW_M1__.setBatching(e),enabled)
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))
 const meta=await page.evaluate(()=>({scene:__SW_M1__.snapshot(),rect:document.querySelector('.canvas-host').getBoundingClientRect().toJSON(),at:new Date().toISOString()}))
 const image=await page.cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,clip:{x:meta.rect.x,y:meta.rect.y,width:meta.rect.width,height:meta.rect.height,scale:1}})
 const file=enabled?'batch-on.png':'batch-off.png';await fs.writeFile(base+file,Buffer.from(image.data,'base64'));shots.push({file,enabled,stats,...meta})
}
await fs.writeFile(base+'shots.json',JSON.stringify({build_id:identity.build_id,shots},null,2)+'\n')
await page.evaluate(()=>{__SW_M1__.pause(false);__SW_M1__.setWaterPhase(null)})
for(const [i,enabled] of [false,true,false,true].entries()){
 const stats=await page.evaluate(e=>__SW_M1__.setBatching(e),enabled)
 const before=await page.evaluate(()=>__SW_M1__.snapshot())
 await page.evaluate(()=>{const t={done:false};window.__BATCH_COMPARE__=t;void __SW_M1__.measurePerformance(10).then(measurement=>Object.assign(t,{done:true,measurement})).catch(error=>Object.assign(t,{done:true,error:String(error)}))})
 await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false})
 for(let n=0;n<24;n++){await new Promise(r=>setTimeout(r,5000));const done=await page.evaluate(()=>__BATCH_COMPARE__.done);await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false});if(done)break}
 const result=await page.evaluate(()=>({result:__BATCH_COMPARE__,after:__SW_M1__.snapshot()}))
 const record={index:i+1,enabled,stats,before,...result,build_id:identity.build_id,conditions:'Same document/materials/triangles/viewport/DPR/light/camera; full data and charts. No profiler, CDP metrics or lightweight telemetry. Batches built once; only original/batch visibility changes. Short exploratory test, not formal score.'}
 await fs.writeFile(base+`trial-${i+1}.json`,JSON.stringify(record,null,2)+'\n');results.push({index:i+1,enabled,stats,fps:result.result.measurement?.average_fps,p95:result.result.measurement?.p95_frame_ms,calls:result.after.calls,triangles:result.after.triangles,done:result.result.done});console.log(JSON.stringify(results.at(-1)))
 if(!result.result.done)throw new Error('Batch trial did not finish; stop before another test')
}
await fs.writeFile(base+'summary.json',JSON.stringify(results,null,2)+'\n')
