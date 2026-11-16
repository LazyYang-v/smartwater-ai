const task=await taskSpace(62),page=task.page('p1'),fs=await import('node:fs/promises')
const base='/Users/leizhenyang/projects/smartwater-ai/docs/acceptance/m1-stability-r1/diagnostics-r2/'
await fs.mkdir(base,{recursive:true})
await page.goto('http://127.0.0.1:4173/?qa=1');await page.cdp('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:2,mobile:false})
await page.waitForFunction(()=>window.__SW_M1__?.snapshot().status==='ready',undefined,{timeout:20000})
await task.cdp('Target.activateTarget',{targetId:(await task.tabs()).find(t=>t.label==='p1').targetId})
const identity=await page.evaluate(()=>fetch('/build-id.json').then(r=>r.json()))
const trials=[]
for(const mode of ['FULL','PROFILER_ON','FULL_AFTER_PROFILE','DATA_PAUSED','CHART_SUBMISSION_PAUSED','THREE_PAUSED','PANEL_OPERATIONS','CSS_EFFECTS_OFF','CONTROLLED_CPU_PRESSURE']){
 await page.evaluate(mode=>{
  const a=__SW_M1__;a.pause(mode==='DATA_PAUSED');a.diagnosticSwitch({chartsPaused:mode==='CHART_SUBMISSION_PAUSED',scenePaused:mode==='THREE_PAUSED'});a.startDiagnostics()
  document.querySelector('#diagnostic-css')?.remove()
  if(mode==='CSS_EFFECTS_OFF'){const el=document.createElement('style');el.id='diagnostic-css';el.textContent='*{animation:none!important;transition:none!important;box-shadow:none!important;filter:none!important;backdrop-filter:none!important}';document.head.append(el)}
  if(mode==='CONTROLLED_CPU_PRESSURE')window.__diagPressure=setInterval(()=>{const until=performance.now()+25;while(performance.now()<until){}},80)
 },mode)
 const before=await page.evaluate(()=>__SW_M1__.lightDiagnostics())
 await page.cdp('Performance.enable',{});const metricsBefore=await page.cdp('Performance.getMetrics',{})
 const profiling=mode==='PROFILER_ON'||mode==='CONTROLLED_CPU_PRESSURE'
 if(profiling){await page.cdp('Profiler.enable',{});await page.cdp('Profiler.setSamplingInterval',{interval:2000});await page.cdp('Profiler.start',{})}
 await page.evaluate(mode=>{
  const trial={done:false};window.__SHORT_DIAG__=trial
  const a=__SW_M1__
  if(mode==='THREE_PAUSED'){setTimeout(()=>{Object.assign(trial,{done:true,measurement:null,note:'Three loop intentionally stopped, not a performance score'})},20000);return}
  let operations
  if(mode==='PANEL_OPERATIONS')operations=setInterval(()=>{a.range([1,6,24][Math.floor(performance.now()/1000)%3]);document.querySelector('.process-panel .text-button')?.click()},1000)
  void a.measurePerformance(10).then(measurement=>{Object.assign(trial,{done:true,measurement})}).catch(error=>Object.assign(trial,{done:true,error:String(error)})).finally(()=>clearInterval(operations))
 },mode)
 await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false})
 let done=false
 for(let wait=0;wait<24;wait++){await new Promise(r=>setTimeout(r,5000));done=await page.evaluate(()=>__SHORT_DIAG__.done);await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false});if(done)break}
 if(!done)throw new Error('Diagnostic workload did not finish; preserve records and stop before another workload')
 const result=await page.evaluate(()=>({result:__SHORT_DIAG__,samples:__SW_M1__.diagnosticSamples(),after:__SW_M1__.lightDiagnostics()}))
 const metricsAfter=await page.cdp('Performance.getMetrics',{}),profile=profiling?(await page.cdp('Profiler.stop',{})).profile:null
 if(profiling)await page.cdp('Profiler.disable',{});await page.cdp('Performance.disable',{})
 const prior=Object.fromEntries(metricsBefore.metrics.map(x=>[x.name,x.value])),metricDeltas=Object.fromEntries(metricsAfter.metrics.map(x=>[x.name,x.value-(prior[x.name]??0)]))
 const times=new Map();for(let i=0;i<(profile?.samples.length??0);i++)times.set(profile.samples[i],(times.get(profile.samples[i])??0)+(profile.timeDeltas[i]??0))
 const top=(profile?.nodes??[]).map(n=>({function:n.callFrame.functionName,url:n.callFrame.url,sampled_ms:(times.get(n.id)??0)/1000})).sort((a,b)=>b.sampled_ms-a.sampled_ms).slice(0,30)
 if(profile)await fs.writeFile(base+mode+'-profile.json',JSON.stringify(profile)+'\n')
 const report={mode,build_id:identity.build_id,before,...result,metricDeltas,top,profiling,kind:'Short single-variable diagnosis, profiler enabled only in labelled reference samples; never a formal benchmark',limitations:'No measured GPU duration/VRAM, OS thermal/power/occlusion or external host load. CONTROLLED_CPU_PRESSURE is a synthetic reference and cannot explain historical failures.'}
 await fs.writeFile(base+mode+'.json',JSON.stringify(report,null,2)+'\n');trials.push({mode,average_fps:result.result.measurement?.average_fps,p95_frame_ms:result.result.measurement?.p95_frame_ms,done:result.result.done,top:top.slice(0,6)})
 await page.evaluate(()=>{clearInterval(window.__diagPressure);__SW_M1__.stopDiagnostics();__SW_M1__.diagnosticSwitch({chartsPaused:false,scenePaused:false});document.querySelector('#diagnostic-css')?.remove()})
 await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false});console.log(JSON.stringify(trials.at(-1)))
}
await page.evaluate(()=>__SW_M1__.pause(false))
await fs.writeFile(base+'summary.json',JSON.stringify(trials,null,2)+'\n')
