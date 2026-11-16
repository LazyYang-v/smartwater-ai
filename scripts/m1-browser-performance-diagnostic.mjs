// Diagnostic only, never replaces any of the nine benchmark trials.
const task=await taskSpace(62),page=(await task.pages())[0],fs=await import('node:fs/promises')
const base='/Users/leizhenyang/projects/smartwater-ai/docs/acceptance/m1/'
await page.goto('http://127.0.0.1:4173/?qa=1');await page.waitForFunction(()=>window.__SW_M1__?.snapshot().status==='ready',undefined,{timeout:20000})
await page.cdp('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:2,mobile:false})
await page.evaluate(()=>{const a=window.__SW_M1__;a.scenario('NORMAL');a.pause(true);a.setPixelRatio(1)})
await page.click('#command',{label:'Focusing unchanged diagnostic viewport'})
let cpuAvailable=true,cpuError=null,metricsBefore=null
try{await page.cdp('Performance.enable',{});metricsBefore=await page.cdp('Performance.getMetrics',{});await page.cdp('Profiler.enable',{});await page.cdp('Profiler.setSamplingInterval',{interval:1000});await page.cdp('Profiler.start',{})}catch(e){cpuAvailable=false;cpuError=String(e)}
const start=await page.evaluate(()=>{
 window.__M1_DIAG__={events:[{event:'start',at:performance.now(),focused:document.hasFocus(),visible:document.visibilityState}],longTasks:[],done:false,result:null,error:null}
 const record=e=>window.__M1_DIAG__.events.push({event:e.type,at:performance.now(),focused:document.hasFocus(),visible:document.visibilityState})
 addEventListener('focus',record);addEventListener('blur',record);document.addEventListener('visibilitychange',record)
 let observer
 try{observer=new PerformanceObserver(list=>{for(const e of list.getEntries())window.__M1_DIAG__.longTasks.push({startTime:e.startTime,duration:e.duration,name:e.name})});observer.observe({type:'longtask',buffered:false})}catch(e){window.__M1_DIAG__.longTaskError=String(e)}
 void window.__SW_M1__.measurePerformance(61).then(result=>{window.__M1_DIAG__.result=result;window.__M1_DIAG__.done=true}).catch(e=>{window.__M1_DIAG__.error=String(e);window.__M1_DIAG__.done=true}).finally(()=>{observer?.disconnect();removeEventListener('focus',record);removeEventListener('blur',record);document.removeEventListener('visibilitychange',record)})
 return {at:performance.now(),scene:window.__SW_M1__.snapshot(),dashboard:window.__SW_M1__.diagnostics(),userAgent:navigator.userAgent}
})
for(let i=0;i<3;i++){await new Promise(r=>setTimeout(r,25000));console.log('Diagnostic passive wait '+(i+1)+'/3')}
let metricsAfter=null,profile=null
if(cpuAvailable){metricsAfter=await page.cdp('Performance.getMetrics',{});profile=(await page.cdp('Profiler.stop',{})).profile;await page.cdp('Profiler.disable',{});await page.cdp('Performance.disable',{})}
const result=await page.evaluate(()=>window.__M1_DIAG__)
let metricDeltas={},topSamples=[]
if(metricsBefore&&metricsAfter){const before=Object.fromEntries(metricsBefore.metrics.map(m=>[m.name,m.value]));for(const m of metricsAfter.metrics)metricDeltas[m.name]=m.value-(before[m.name]??0)}
if(profile){
 const counts=new Map();for(let i=0;i<profile.samples.length;i++){const id=profile.samples[i];counts.set(id,(counts.get(id)??0)+(profile.timeDeltas[i]??0))}
 topSamples=profile.nodes.map(n=>({function:n.callFrame.functionName,url:n.callFrame.url,sampled_ms:(counts.get(n.id)??0)/1000})).sort((a,b)=>b.sampled_ms-a.sampled_ms).slice(0,30)
 await fs.writeFile(base+'diagnostic-cpu-profile.json',JSON.stringify(profile)+'\n')
}
const report={kind:'DIAGNOSTIC_NOT_A_BENCHMARK_REPLACEMENT',build_id:await page.evaluate(()=>fetch('/build-id.json').then(r=>r.json()).then(x=>x.build_id)),start,cpuAvailable,cpuError,metricDeltas,topSamples,result,notes:'Profiler and long-task observation add overhead. Data paused, same geometry/viewport/DPR. Focus/visibility events logged during sample. Performance metrics include the passive wait after camera sampling. No score is substituted for any benchmark trial.'}
await fs.writeFile(base+'performance-diagnostic.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({cpuAvailable,cpuError,metricDeltas,topSamples:topSamples.slice(0,12),events:result.events,longTasks:result.longTasks.length,average_fps:result.result?.average_fps,p95_frame_ms:result.result?.p95_frame_ms,error:result.error}))
