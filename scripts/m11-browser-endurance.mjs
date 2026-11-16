const task=await taskSpace(62),page=task.page('p1'),fs=await import('node:fs/promises')
const base='/Users/leizhenyang/projects/smartwater-ai/docs/acceptance/m1-stability-r1/endurance/'
await fs.mkdir(base,{recursive:true})
// Independent fresh fixed-build page after the archived/reverted batch experiment. No reload within endurance.
await page.goto('http://127.0.0.1:4173/?qa=1')
await page.cdp('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:2,mobile:false})
await page.waitForFunction(()=>window.__SW_M1__?.snapshot().status==='ready'&&document.querySelectorAll('.trend-chart svg').length===2,undefined,{timeout:20000})
await task.cdp('Target.activateTarget',{targetId:(await task.tabs()).find(t=>t.label==='p1').targetId})
await page.evaluate(()=>{__SW_M1__.stopDiagnostics();__SW_M1__.pause(false);__SW_M1__.diagnosticSwitch({chartsPaused:false,scenePaused:false});__SW_M1__.panels({left:false,trends:false,tab:'do'})})
const identity=await page.evaluate(()=>fetch('/build-id.json').then(r=>r.json()))
const start=await page.evaluate(()=>({at:new Date().toISOString(),scene:__SW_M1__.snapshot(),dashboard:__SW_M1__.lightDiagnostics(),viewport:[innerWidth,innerHeight]}))
await fs.writeFile(base+'start.json',JSON.stringify({build_id:identity.build_id,fresh_document_after_reverted_experiment:true,start,tabs:await task.tabs().then(ts=>ts.map(({label,url,active})=>({label,url,active})))},null,2)+'\n')
await page.evaluate(()=>{
 window.__ENDURANCE__={done:false,windows:[],error:null,longTasks:[],longTaskAvailable:false}
 let observer
 try{observer=new PerformanceObserver(list=>{for(const e of list.getEntries())__ENDURANCE__.longTasks.push({at:e.startTime,duration:e.duration})});observer.observe({type:'longtask',buffered:false});__ENDURANCE__.longTaskAvailable=true}catch{}
 const api=__SW_M1__
 const run=async()=>{
  for(let i=0;i<15;i++){
   api.scenario(['NORMAL','LOW_DO','MISSING_DATA'][i%3]);api.range([1,6,24][i%3]);api.panels({tab:i%2?'do':'blower_power'})
   document.querySelector('.process-panel .text-button')?.click()
   const before=api.lightDiagnostics(),measurement=await api.measurePerformance(61),after=api.lightDiagnostics()
   window.__ENDURANCE__.windows.push({index:i+1,before,measurement,after})
   // Normal UI context changes, without stealing the camera on every data refresh.
   if(i%3===0){await api.send('定位一号曝气池');await api.send('回到总览')}
  }
 }
 void run().then(()=>{window.__ENDURANCE__.done=true}).catch(e=>{window.__ENDURANCE__.error=String(e);window.__ENDURANCE__.done=true}).finally(()=>observer?.disconnect())
})
await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false})
let saved=0
for(let wait=0;wait<160;wait++){
 await new Promise(r=>setTimeout(r,15000))
 const state=await page.evaluate(()=>({done:__ENDURANCE__.done,error:__ENDURANCE__.error,count:__ENDURANCE__.windows.length}))
 const completed=state.count>saved?await page.evaluate(start=>__ENDURANCE__.windows.slice(start),saved):[]
 await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false})
 for(const w of completed){await fs.writeFile(base+`window-${String(w.index).padStart(2,'0')}.json`,JSON.stringify({build_id:identity.build_id,glb_sha256:identity.glb_sha256,...w},null,2)+'\n');console.log('Endurance window '+w.index+' '+w.measurement.average_fps.toFixed(2)+' FPS');saved++}
 await fs.writeFile(base+'progress.json',JSON.stringify({saved,done:state.done,error:state.error},null,2)+'\n')
 if(state.done)break
}
const end=await page.evaluate(()=>({at:new Date().toISOString(),scene:__SW_M1__.snapshot(),dashboard:__SW_M1__.lightDiagnostics(),records:__SW_M1__.records(),done:__ENDURANCE__.done,error:__ENDURANCE__.error,longTaskAvailable:__ENDURANCE__.longTaskAvailable,longTasks:__ENDURANCE__.longTasks}))
await fs.writeFile(base+'end.json',JSON.stringify({build_id:identity.build_id,end},null,2)+'\n')
await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false})
