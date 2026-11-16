const task=await taskSpace(62),page=task.page('p1'),fs=await import('node:fs/promises')
const base='/Users/leizhenyang/projects/smartwater-ai/docs/acceptance/m1-stability-r1/old-new-pair/'
await fs.mkdir(base,{recursive:true})
const trials=[]
for(const [index,port] of [4180,4173,4180,4173].entries()){
 await page.cdp('Performance.disable',{});await page.cdp('Profiler.disable',{})
 await page.goto(`http://127.0.0.1:${port}/?qa=1`)
 await page.cdp('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:2,mobile:false})
 await page.waitForFunction(()=>window.__SW_M1__?.snapshot().status==='ready',undefined,{timeout:20000})
 await task.cdp('Target.activateTarget',{targetId:(await task.tabs()).find(t=>t.label==='p1').targetId})
 const before=await page.evaluate(()=>{__SW_M1__.pause(false);__SW_M1__.scenario('NORMAL');const gl=document.querySelector('.canvas-host canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return {scene:__SW_M1__.snapshot(),at:performance.now(),gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),entry:[...document.querySelectorAll('script[src]')].map(x=>x.src)}})
 const identity=await page.evaluate(()=>fetch('/build-id.json').then(r=>r.json()))
 await page.evaluate(()=>{const trial={done:false};window.__PAIR__=trial;void __SW_M1__.measurePerformance(10).then(measurement=>Object.assign(trial,{done:true,measurement})).catch(error=>Object.assign(trial,{done:true,error:String(error)}))})
 await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false})
 for(let i=0;i<16;i++){await new Promise(r=>setTimeout(r,5000));const done=await page.evaluate(()=>__PAIR__.done);await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false});if(done)break}
 const result=await page.evaluate(()=>({result:__PAIR__,after:__SW_M1__.snapshot(),at:performance.now()}))
 const report={index:index+1,version:port===4180?'M1_BEFORE':'M11_FIXED',build_id:identity.build_id,before,...result,conditions:'Same actual page, navigate before each paired load. No profiler, metrics, light diagnostics, capture or other performance task. Same viewport1218x427, Three DPR1, full data/charts, same20-move camera path. Short diagnosis, not formal score.'}
 await fs.writeFile(base+`pair-${index+1}.json`,JSON.stringify(report,null,2)+'\n');trials.push({index:index+1,version:report.version,average_fps:result.result.measurement?.average_fps,p95_frame_ms:result.result.measurement?.p95_frame_ms,done:result.result.done});console.log(JSON.stringify(trials.at(-1)))
 if(!result.result.done)throw new Error('Unfinished pair; stop to avoid overlap')
}
await fs.writeFile(base+'summary.json',JSON.stringify(trials,null,2)+'\n')
