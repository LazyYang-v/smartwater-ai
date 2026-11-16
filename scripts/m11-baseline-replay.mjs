const task=await taskSpace(62),page=task.page('p1'),fs=await import('node:fs/promises')
const base='/Users/leizhenyang/projects/smartwater-ai/docs/acceptance/m1-stability-r1/baseline-replay/'
await fs.mkdir(base,{recursive:false})
const trials=[]
for(const p of await task.pages())await p.cdp('Emulation.setFocusEmulationEnabled',{enabled:false})
await task.cdp('Target.activateTarget',{targetId:(await task.tabs()).find(t=>t.label==='p1').targetId})
const nativeDpr=await page.evaluate(()=>devicePixelRatio)
for(let round=1;round<=3;round++)for(const mode of ['CAMERA_ONLY','CAMERA_DATA_CHARTS','COMMANDS_PANELS']){
 await page.goto('http://127.0.0.1:4173/?qa=1');await page.waitForFunction(()=>window.__SW_M1__?.snapshot().status==='ready',undefined,{timeout:20000})
 await page.cdp('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:nativeDpr,mobile:false})
 await page.waitForFunction(()=>document.querySelectorAll('.trend-chart svg').length===2&&window.__SW_M1__.snapshot().canvas.width>1000,undefined,{timeout:6000})
 await page.evaluate(mode=>{const a=window.__SW_M1__;a.setPixelRatio(1);a.setWaterPhase(null);a.scenario('NORMAL');a.pause(mode==='CAMERA_ONLY')},mode)
 await page.click('#command',{label:'Focusing full dashboard performance test'})
 const conditions=await page.evaluate(()=>{
  const a=window.__SW_M1__,s=a.snapshot(),gl=document.querySelector('.canvas-host canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info')
  return {url:location.href,measured_at:new Date().toISOString(),viewport:{width:innerWidth,height:innerHeight},nativeDpr:devicePixelRatio,rendererDpr:s.rendererDpr,cssCanvas:s.canvas,drawingBuffer:s.drawingBuffer,documentVisible:document.visibilityState,documentHasFocus:document.hasFocus(),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),userAgent:navigator.userAgent,initialScene:s,initialDashboard:a.diagnostics(),initialData:{snapshotId:a.data().snapshotId,tick:a.data().tick},initialToolCount:a.records().length}
 })
 conditions.pageAgeMs=await page.evaluate(()=>performance.now());conditions.tabs=(await task.tabs()).map(({label,targetId,url,active,openedBy})=>({label,targetId,url,active,openedBy}));conditions.reloadPolicy='goto before each load, same browser';
 const identity=await page.evaluate(()=>fetch('/build-id.json',{cache:'no-store'}).then(r=>r.json()))
 await page.evaluate(mode=>{
  window.__M1_PERF__={done:false,result:null,error:null}
  const api=window.__SW_M1__
  const execute=async()=>{
   if(mode!=='COMMANDS_PANELS')return {measurement:await api.measurePerformance(61),actions:[]}
   // Warm the focus/reset shaders and UI before the measured command sequence.
   await api.send('定位一号曝气池');await api.send('回到总览')
   api.beginFrameSample();const started=performance.now(),actions=[];let index=0
   while(performance.now()-started<61500){
    api.range([1,6,24][index%3]);api.panels({tab:index%2?'blower_power':'do'})
    const fold=document.querySelector('.process-panel .text-button');if(fold)fold.click()
    const record=await api.send(index%2?'回到总览':'定位一号曝气池')
    actions.push({action_id:record.action_id,status:record.status,tool_name:record.tool_name,result:record.result,error:record.error});index++
   }
   return {measurement:api.endFrameSample(),actions}
  }
  void execute().then(result=>{window.__M1_PERF__={done:true,result,error:null}}).catch(error=>{window.__M1_PERF__={done:true,result:null,error:String(error)}})
 },mode)
 await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false});
 for(let wait=0;wait<3;wait++){await new Promise(r=>setTimeout(r,25000));console.log(`Round ${round} ${mode}: passive wait ${(wait+1)*25}s`)}
 const result=await page.evaluate(()=>window.__M1_PERF__)
 await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false});
 const final=await page.evaluate(()=>({dashboard:window.__SW_M1__.diagnostics(),data:{snapshotId:window.__SW_M1__.data().snapshotId,tick:window.__SW_M1__.data().tick},toolCount:window.__SW_M1__.records().length,records:window.__SW_M1__.records(),renderedRecordNodes:document.querySelectorAll('.action-record').length,scene:window.__SW_M1__.snapshot()}))
 const m=result.result?.measurement
 const dataClockCorrect=mode==='CAMERA_ONLY'?final.data.tick===conditions.initialData.tick:final.data.tick>conditions.initialData.tick
 const actionReceiptsCorrect=mode!=='COMMANDS_PANELS'||(result.result?.actions?.length>20&&result.result.actions.every(a=>a.status==='SUCCEEDED'&&a.result?.arrival_verified===true)&&final.records.length>20&&final.renderedRecordNodes===20)
 const valid=dataClockCorrect&&actionReceiptsCorrect&&final.dashboard.chartStats.active===2&&final.dashboard.chartStats.created===2&&final.scene.loadGeneration===conditions.initialScene.loadGeneration&&!!m&&result.done&&m.sampled_duration_ms>=60000&&m.page_visible_throughout&&m.loadedModelSha256===identity.glb_sha256&&m.rendererDpr===1&&m.canvas.width===conditions.cssCanvas.width&&m.canvas.height===conditions.cssCanvas.height&&final.dashboard.sceneInstances===1&&final.dashboard.renderLoops===1
 const report={round,mode,build_id:identity.build_id,nativeDprBeforeTest:nativeDpr,conditions,result,final,dataClockCorrect,actionReceiptsCorrect,valid,target:{average_fps:45,p95_frame_ms:40,passed:valid&&m.average_fps>=45&&m.p95_frame_ms<=40},interpretation:'Full M1 page, fixed 1920x1080 CSS viewport and renderer DPR1. Native DOM/SVG DPR retained. Document visibility tracked; OS occlusion cannot be inferred. No screenshot or page polling during sample. Camera-only pauses mock updates; second mode runs five-second snapshots; third adds actual commands and process/range switches.'}
 const filename=`round-${round}-${mode.toLowerCase()}.json`
 await fs.writeFile(base+filename,JSON.stringify(report,null,2)+'\n')
 trials.push({file:filename,round,mode,valid,average_fps:m?.average_fps,p95_frame_ms:m?.p95_frame_ms,p99_frame_ms:m?.p99_frame_ms,frames_over_50_ms:m?.frames_over_50_ms,sampled_duration_ms:m?.sampled_duration_ms,sample_count:m?.sample_count,passed:report.target.passed,error:result.error})
 await fs.writeFile(base+'summary.json',JSON.stringify(trials,null,2)+'\n')
 console.log(JSON.stringify(trials.at(-1)))
}
console.log(JSON.stringify({trials:trials.length,valid:trials.filter(t=>t.valid).length,meeting_target:trials.filter(t=>t.passed).length,all_results_preserved:true}))

await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false});
