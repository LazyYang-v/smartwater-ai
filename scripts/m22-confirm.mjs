const task=await taskSpace(62),page=task.page('p1'),fs=await import('node:fs/promises'),base='/Users/leizhenyang/projects/smartwater-ai/docs/acceptance/m2-equipment/'
const result={kind:'One four-unit foreground candidate confirmation;720s requested active camera sample covers earlier approximately11-minute regression window. No original full-effects investigation.',done:false}
const save=()=>fs.writeFile(base+'confirmation.json',JSON.stringify(result,null,2)+'\n')
await page.goto('http://127.0.0.1:4173/?qa=1');await page.cdp('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:2,mobile:false});await task.cdp('Target.activateTarget',{targetId:(await task.tabs()).find(t=>t.label==='p1').targetId});await page.waitForFunction(()=>__SW_M1__?.snapshot().firstRenderMs>0,undefined,{timeout:20000});await page.selectOption('.view-mode-select','plant4');await page.waitForFunction(()=>__SW_M1__.snapshot().loadedIds.length===4,undefined,{timeout:30000})
result.build=await page.evaluate(()=>fetch('/build-id.json').then(r=>r.json()));result.initial=await page.evaluate(()=>({at:new Date().toISOString(),scene:__SW_M1__.snapshot(),stats:__SW_M1__.lightDiagnostics(),browser:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight}}))
// Actual browser tab hiding is an interaction check, never mixed into foreground sample.
const blank=await task.newPage();await blank.goto('about:blank');const tabs=await task.tabs(),mainId=tabs.find(t=>t.label==='p1').targetId,blankId=tabs.find(t=>t.label===blank.label).targetId;await task.cdp('Target.activateTarget',{targetId:mainId});await page.evaluate(()=>{window.__M22_VIS__=[];document.addEventListener('visibilitychange',e=>__M22_VIS__.push({state:document.visibilityState,trusted:e.isTrusted,at:performance.now()}));void __SW_M1__.send('定位一号鼓风机')});const running=await page.evaluate(()=>__SW_M1__.records().at(-1));await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false});await task.cdp('Target.activateTarget',{targetId:blankId});await new Promise(r=>setTimeout(r,1800));await task.cdp('Target.activateTarget',{targetId:mainId});result.hidden=await page.evaluate(id=>({record:__SW_M1__.records().find(r=>r.action_id===id),events:__M22_VIS__,scene:__SW_M1__.snapshot()}),running.action_id);result.hidden.passed=running.status==='RUNNING'&&result.hidden.record.status==='CANCELLED'&&result.hidden.record.error.code==='PAGE_HIDDEN'&&result.hidden.scene.roofStates.SW_AIR_BLOWER_001===true&&result.hidden.events.some(e=>e.state==='hidden'&&e.trusted)&&result.hidden.events.some(e=>e.state==='visible'&&e.trusted);await blank.close();await save();if(!result.hidden.passed)throw new Error('True hidden/restore roof semantics failed')
await page.evaluate(async()=>{__SW_M1__.context('SW_BIO_AERATION_001');__SW_M1__.pause(false);await __SW_M1__.send('回到总览')})
await page.evaluate(()=>{
 const a=__SW_M1__,state=window.__M22_CONFIRM__={start:new Date().toISOString(),startMono:performance.now(),done:false,resources:[]}
 let scenario=0
 const side=setInterval(()=>{state.resources.push(a.lightDiagnostics());a.scenario(['NORMAL','LOW_DO','MISSING_DATA'][scenario%3]);a.range([1,6,24][scenario%3]);scenario++},30000)
 const run=async()=>{
  state.camera=await a.measurePerformance(720)
  if(state.camera.workload_error){state.error='Continuous camera workload failed: '+state.camera.workload_error;return}
  a.beginFrameSample();state.actions=[]
  const commands=['定位一号曝气池','定位一号二沉池','定位一号鼓风机','定位一号提升泵']
  for(let i=0;i<12;i++){
   const focus=a.send(commands[i%4]);if(i%3===0){await new Promise(r=>setTimeout(r,130));a.cancel()}
   state.actions.push(await focus);state.actions.push(await a.send('回到总览'))
  }
  state.interaction=a.endFrameSample()
 }
 void run().catch(error=>state.error=String(error)).finally(()=>{clearInterval(side);state.end=new Date().toISOString();state.totalMs=performance.now()-state.startMono;state.done=true})
})
for(let i=0;i<65;i++){
 await new Promise(r=>setTimeout(r,15000))
 const status=await page.evaluate(()=>({done:__M22_CONFIRM__.done,elapsedMs:performance.now()-__M22_CONFIRM__.startMono,error:__M22_CONFIRM__.error,stats:__SW_M1__.lightDiagnostics()}));result.progress=status;await save()
 if(status.done){result.performance=await page.evaluate(()=>__M22_CONFIRM__);result.done=true;break}
}
await save();console.log(JSON.stringify({done:result.done,error:result.performance?.error,totalMs:result.performance?.totalMs,cameraFps:result.performance?.camera?.average_fps,p95:result.performance?.camera?.p95_frame_ms,over50:result.performance?.camera?.frames_over_50_ms,over100:result.performance?.camera?.frames_over_100_ms}))
