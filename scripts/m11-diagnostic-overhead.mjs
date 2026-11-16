const task=await taskSpace(62),page=task.page('p1'),fs=await import('node:fs/promises')
const base='/Users/leizhenyang/projects/smartwater-ai/docs/acceptance/m1-stability-r1/diagnostic-overhead/'
await fs.mkdir(base,{recursive:true})
const results=[]
for(const [label,light,metrics] of [['OFF',false,false],['LIGHT_ONLY',true,false],['LIGHT_AND_CDP_METRICS',true,true],['OFF_REVERSAL',false,false]]){
 if(light)await page.evaluate(()=>__SW_M1__.startDiagnostics());else await page.evaluate(()=>__SW_M1__.stopDiagnostics())
 if(metrics)await page.cdp('Performance.enable',{});else await page.cdp('Performance.disable',{})
 const before=await page.evaluate(()=>__SW_M1__.lightDiagnostics())
 await page.evaluate(()=>{const trial={done:false};window.__OVERHEAD__=trial;void __SW_M1__.measurePerformance(10).then(measurement=>Object.assign(trial,{done:true,measurement})).catch(error=>Object.assign(trial,{done:true,error:String(error)}))})
 await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false})
 for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,5000));const done=await page.evaluate(()=>__OVERHEAD__.done);await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false});if(done)break}
 const result=await page.evaluate(()=>({result:__OVERHEAD__,after:__SW_M1__.lightDiagnostics()}))
 results.push({label,light,metrics,before,...result,kind:'Paired diagnostic overhead test; same document, same 20-move camera path, no profile or screenshot; not a formal score'})
 await fs.writeFile(base+label+'.json',JSON.stringify(results.at(-1),null,2)+'\n');console.log(label+' '+result.result.measurement?.average_fps)
 if(!result.result.done)throw new Error('Do not overlap unfinished overhead workloads')
}
await page.cdp('Performance.disable',{});await page.evaluate(()=>__SW_M1__.stopDiagnostics())
await fs.writeFile(base+'summary.json',JSON.stringify(results.map(x=>({label:x.label,average_fps:x.result.measurement?.average_fps,p95_frame_ms:x.result.measurement?.p95_frame_ms})),null,2)+'\n')
