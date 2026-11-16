const task=await taskSpace(62),page=task.page('p1'),fs=await import('node:fs/promises')
const base='/Users/leizhenyang/projects/smartwater-ai/docs/acceptance/m1-stability-r1/m2-overview/'
const result={kind:'One final candidate continuous operation confirmation, original full-effects mode not investigated',checks:[],screenshots:[],done:false}
async function save(){await fs.writeFile(base+'confirmation.json',JSON.stringify(result,null,2)+'\n')}
async function check(name,ok,detail){result.checks.push({name,passed:!!ok,detail});await save();if(!ok)throw new Error(name)}
await page.goto('http://127.0.0.1:4173/?qa=1');await page.cdp('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:2,mobile:false});await task.cdp('Target.activateTarget',{targetId:(await task.tabs()).find(t=>t.label==='p1').targetId});await page.waitForFunction(()=>window.__SW_M1__,undefined,{timeout:20000})
const race=await page.evaluate(async()=>{const a=__SW_M1__,one=a.switchView('plant'),two=a.switchView('plant');await a.switchUnit('SW_BIO_AERATION_001');await Promise.all([one,two]);return {scene:a.snapshot(),stats:a.lightDiagnostics(),nodes:a.assetReport().filter(n=>n.device_id),labels:document.querySelectorAll('[data-device-label]').length}})
await check('cold concurrent loading deduplicates GLBs; late result cannot replace latest single mode',race.scene.viewMode==='unit'&&race.nodes.length===1&&race.nodes[0].device_id==='SW_BIO_AERATION_001'&&race.labels===0&&Object.values(race.scene.assetRequests).every(n=>n===1),race)
await page.selectOption('.view-mode-select','plant');await page.waitForFunction(()=>__SW_M1__.snapshot().loadedIds.length===2&&__SW_M1__.snapshot().firstRenderMs>0,undefined,{timeout:20000});await page.evaluate(()=>__SW_M1__.context('SW_BIO_AERATION_001'))
result.build=await page.evaluate(()=>fetch('/build-id.json').then(r=>r.json()));result.before=await page.evaluate(()=>({scene:__SW_M1__.snapshot(),stats:__SW_M1__.lightDiagnostics(),browser:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight}}))
async function shot(file){const metadata=await page.evaluate(()=>({at:new Date().toISOString(),scene:__SW_M1__.snapshot(),context:__SW_M1__.diagnostics().contextId,viewport:{width:innerWidth,height:innerHeight}}));await page.screenshot({path:base+file});result.screenshots.push({file,...metadata});await save()}
await shot('overview-final.png')
await page.evaluate(()=>__SW_M1__.send('定位一号曝气池'));await shot('aeration-focused-final.png')
await page.evaluate(()=>__SW_M1__.send('定位一号二沉池'));await shot('clarifier-focused-final.png')
await check('final clarifier panels have no borrowed metrics, curves or aeration threshold',await page.evaluate(()=>document.querySelectorAll('.trend-unavailable').length===2&&document.querySelectorAll('.device-summary [data-detail-metric]').length===0&&document.querySelectorAll('.alarm-panel .panel-caption').length===0),await page.evaluate(()=>document.querySelector('.device-summary').textContent))
await page.evaluate(()=>__SW_M1__.send('回到总览'));await shot('reset-overview-final.png')
// Real hidden/restore is separate from the foreground performance sample.
const blank=await task.newPage();await blank.goto('about:blank');const tabs=await task.tabs(),mainId=tabs.find(t=>t.label==='p1').targetId,blankId=tabs.find(t=>t.label===blank.label).targetId
await task.cdp('Target.activateTarget',{targetId:mainId});await page.evaluate(()=>{window.__M21_VIS__=[];document.addEventListener('visibilitychange',e=>__M21_VIS__.push({state:document.visibilityState,trusted:e.isTrusted,at:performance.now()}));void __SW_M1__.send('定位一号曝气池')});const running=await page.evaluate(()=>__SW_M1__.records().at(-1));await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false});await task.cdp('Target.activateTarget',{targetId:blankId});await new Promise(r=>setTimeout(r,1800));await task.cdp('Target.activateTarget',{targetId:mainId});const visibility=await page.evaluate(id=>({record:__SW_M1__.records().find(r=>r.action_id===id),events:__M21_VIS__,scene:__SW_M1__.snapshot()}),running.action_id);await blank.close();await check('true page hide cancels active plant motion with PAGE_HIDDEN',running.status==='RUNNING'&&visibility.record.status==='CANCELLED'&&visibility.record.error.code==='PAGE_HIDDEN'&&visibility.events.some(e=>e.state==='hidden'&&e.trusted)&&visibility.events.some(e=>e.state==='visible'&&e.trusted),visibility)
await page.evaluate(async()=>{__SW_M1__.context('SW_BIO_AERATION_001');await __SW_M1__.send('回到总览')})
// No reload, screenshots, tracing, Blender, or parallel browser tests during this sample.
await page.evaluate(()=>{
 const a=__SW_M1__,state=window.__M21_CONFIRM__={start:new Date().toISOString(),startMono:performance.now(),done:false,resources:[]}
 const resourceTimer=setInterval(()=>state.resources.push(a.lightDiagnostics()),10000)
 let scenarioIndex=0
 const dataTimer=setInterval(()=>{a.scenario(['NORMAL','LOW_DO','MISSING_DATA'][scenarioIndex%3]);a.range([1,6,24][scenarioIndex%3]);scenarioIndex++},10000)
 const run=async()=>{
  state.camera=await a.measurePerformance(120)
  clearInterval(dataTimer)
  a.beginFrameSample();state.actions=[]
  for(let i=0;i<12;i++){
   const focus=a.send(i%2?'定位一号二沉池':'定位一号曝气池')
   if(i%3===0){await new Promise(r=>setTimeout(r,130));a.cancel()}
   state.actions.push(await focus);state.actions.push(await a.send('回到总览'))
   if(i%3===2){a.panels({left:i%2===0});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));a.panels({left:false})}
  }
  state.interaction=a.endFrameSample();state.end=new Date().toISOString();state.totalMs=performance.now()-state.startMono
 }
 void run().catch(error=>state.error=String(error)).finally(()=>{clearInterval(resourceTimer);clearInterval(dataTimer);state.done=true})
})
for(let i=0;i<30;i++){
 await new Promise(r=>setTimeout(r,7000))
 const status=await page.evaluate(()=>({done:__M21_CONFIRM__.done,elapsed:performance.now()-__M21_CONFIRM__.startMono,error:__M21_CONFIRM__.error}))
 if(status.done){result.performance=await page.evaluate(()=>__M21_CONFIRM__);break}
}
if(!result.performance)result.performance=await page.evaluate(()=>__M21_CONFIRM__)
result.done=result.performance.done;await save()
await check('foreground active continuous camera confirmation completed',result.done&&!result.performance.error&&!result.performance.camera.workload_error&&result.performance.camera.page_visible_throughout,result.performance.camera)
await check('continuous tool sequence has no unexpected terminal state',result.performance.actions.every((r,i)=>i%2===1?r.status==='SUCCEEDED':r.status===((i/2)%3===0?'CANCELLED':'SUCCEEDED')),result.performance.actions.map(r=>({status:r.status,tool:r.tool_name,error:r.error})))
result.resources=await page.evaluate(async()=>{const manifest=await fetch('/build-id.json').then(r=>r.json()),names=[...new Set(performance.getEntriesByType('resource').map(e=>e.name).filter(n=>new URL(n).pathname.startsWith('/assets/')))];const loaded=[];for(const url of names){const b=await fetch(url).then(r=>r.arrayBuffer()),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(v=>v.toString(16).padStart(2,'0')).join('');loaded.push({url,sha256:hash,matches:manifest.files[new URL(url).pathname.slice(1)]?.sha256===hash})}const canvas=document.querySelector('.canvas-host canvas'),gl=canvas.getContext('webgl2');return {loaded,scene:__SW_M1__.snapshot(),actualBuffer:{width:gl.drawingBufferWidth,height:gl.drawingBufferHeight},contextLost:gl.isContextLost(),diagnostics:__SW_M1__.diagnostics()}})
await check('fixed final build actually loaded and still one scene/two charts',result.resources.loaded.every(r=>r.matches)&&result.resources.diagnostics.sceneInstances===1&&result.resources.diagnostics.chartStats.active===2&&!result.resources.contextLost,result.resources)
await page.evaluate(async()=>{__SW_M1__.scenario('NORMAL');__SW_M1__.context('SW_BIO_AERATION_001');await __SW_M1__.send('回到总览')});await save();console.log(JSON.stringify({checks:result.checks.map(x=>({name:x.name,passed:x.passed})),cameraFps:result.performance.camera.average_fps,p95:result.performance.camera.p95_frame_ms,duration:result.performance.totalMs,interactionFps:result.performance.interaction.average_fps,interactionP95:result.performance.interaction.p95_frame_ms}))
