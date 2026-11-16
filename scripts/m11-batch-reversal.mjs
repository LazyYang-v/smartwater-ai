const task=await taskSpace(62),page=task.page('p1'),fs=await import('node:fs/promises')
const base='/Users/leizhenyang/projects/smartwater-ai/docs/acceptance/m1-stability-r1/batch-experiment/'
const identity=await page.evaluate(()=>fetch('/build-id.json').then(r=>r.json())),results=[]
for(const [i,enabled] of [true,false,true,false].entries()){
 const stats=await page.evaluate(e=>__SW_M1__.setBatching(e),enabled)
 const before=await page.evaluate(()=>__SW_M1__.snapshot())
 await page.evaluate(()=>{const t={done:false};window.__BATCH_COMPARE__=t;void __SW_M1__.measurePerformance(10).then(measurement=>Object.assign(t,{done:true,measurement})).catch(error=>Object.assign(t,{done:true,error:String(error)}))})
 await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false})
 for(let n=0;n<24;n++){await new Promise(r=>setTimeout(r,5000));const done=await page.evaluate(()=>__BATCH_COMPARE__.done);await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false});if(done)break}
 const result=await page.evaluate(()=>({result:__BATCH_COMPARE__,after:__SW_M1__.snapshot()}))
 const record={index:i+5,enabled,stats,before,...result,build_id:identity.build_id,conditions:'Same document/materials/triangles/viewport/DPR/light/camera; full data and charts. No profiler, CDP metrics or lightweight telemetry. Batches built once; only original/batch visibility changes. Short exploratory test, not formal score.'}
 await fs.writeFile(base+`trial-${i+5}.json`,JSON.stringify(record,null,2)+'\n');results.push({index:i+5,enabled,stats,fps:result.result.measurement?.average_fps,p95:result.result.measurement?.p95_frame_ms,calls:result.after.calls,triangles:result.after.triangles,done:result.result.done});console.log(JSON.stringify(results.at(-1)))
 if(!result.result.done)throw new Error('Batch trial did not finish; stop before another test')
}
await fs.writeFile(base+'reversal-summary.json',JSON.stringify(results,null,2)+'\n')
