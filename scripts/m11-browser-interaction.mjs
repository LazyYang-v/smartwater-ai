const task=await taskSpace(62),page=task.page('p1'),fs=await import('node:fs/promises')
const base='/Users/leizhenyang/projects/smartwater-ai/docs/acceptance/m1-stability-r1/'
await page.goto('http://127.0.0.1:4173/?qa=1');await page.waitForFunction(()=>window.__SW_M1__?.snapshot().status==='ready',undefined,{timeout:20000})
await page.cdp('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:2,mobile:false})
await page.evaluate(()=>{__SW_M1__.startDiagnostics();__SW_M1__.pause(false)})
console.log(await page.snapshot())
const evaluate=async expression=>(await page.cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.value
async function startNative(){
 const target=await evaluate(`(()=>{const b=document.querySelector('.command-suggestions button:first-child'),r=b.getBoundingClientRect();return {rect:r.toJSON(),disabled:b.disabled,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b}})()`)
 if(target.disabled||!target.hit)throw new Error('Native start target is not actionable')
 const x=target.rect.x+target.rect.width/2,y=target.rect.y+target.rect.height/2
 await page.cdp('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1})
 await page.cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1})
}
const tests=[]
for(const stress of [false,true]){
 await page.evaluate(()=>__SW_M1__.send('回到总览'))
 if(stress)await evaluate(`window.__pressure=setInterval(()=>{const end=performance.now()+25;while(performance.now()<end){}},80);true`)
 const nodeInputAt=new Date().toISOString()
 await startNative()
 const before=await evaluate(`(()=>{const a=__SW_M1__,r=a.records().at(-1),b=document.querySelector('.cancel-task'),x=b.getBoundingClientRect();return {at:performance.now(),record:r,rect:x.toJSON(),disabled:b.disabled,hit:document.elementFromPoint(x.x+x.width/2,x.y+x.height/2)===b,visibility:document.visibilityState}})()`)
 let issued=null
 if(before.record.status==='RUNNING'&&!before.disabled&&before.hit&&before.visibility==='visible'){
  issued=new Date().toISOString();const x=before.rect.x+before.rect.width/2,y=before.rect.y+before.rect.height/2
  await page.cdp('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1})
  await page.cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1})
 }
 await evaluate(`clearInterval(window.__pressure);true`)
 const dragBefore=await evaluate(`({scene:__SW_M1__.snapshot(),rect:document.querySelector('.canvas-host').getBoundingClientRect().toJSON()})`)
 const dragX=dragBefore.rect.x+dragBefore.rect.width*.55,dragY=dragBefore.rect.y+dragBefore.rect.height*.5
 await page.cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:dragX,y:dragY})
 await page.cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:dragX,y:dragY,button:'left',buttons:1,clickCount:1})
 await page.cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:dragX+70,y:dragY+15,button:'left',buttons:1})
 await page.cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:dragX+70,y:dragY+15,button:'left',clickCount:1})
 const dragAfter=await evaluate(`__SW_M1__.snapshot()`)
 const after=await evaluate(`(async()=>{const a=__SW_M1__;await new Promise(r=>setTimeout(r,1200));const scene=a.snapshot(),record=a.records().find(r=>r.action_id===${JSON.stringify(before.record.action_id)});return {at:performance.now(),record,scene,input:a.inputEvents(),cameraEvents:a.cameraEvents()}})()`)
 // A second native click on the now-disabled same control must not create a new terminal state.
 const count=after.input.length
 const x=before.rect.x+before.rect.width/2,y=before.rect.y+before.rect.height/2
 await page.cdp('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await page.cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1})
 const stable=await evaluate(`({scene:__SW_M1__.snapshot(),input:__SW_M1__.inputEvents(),records:__SW_M1__.records()})`)
 const received=after.input.filter(e=>e.event==='cancel_control_received'&&e.at>=before.at)
 const recovered=await page.evaluate(()=>__SW_M1__.send('回到总览'))
 const passed=!!issued&&after.record.status==='CANCELLED'&&received.length===1&&received[0].trusted&&JSON.stringify(dragBefore.scene.camera)!==JSON.stringify(dragAfter.camera)&&JSON.stringify(dragAfter.camera)===JSON.stringify(after.scene.camera)&&JSON.stringify(after.scene.camera)===JSON.stringify(stable.scene.camera)&&stable.input.length===count&&recovered.status==='SUCCEEDED'
 tests.push({kind:stress?'CONTROLLED_PRESSURE':'NORMAL',pressure:stress?'25ms busy wait every80ms, explicitly separate from benchmarks':'none',nodeInputAt,nativeCancelIssuedAt:issued,before,dragBefore,dragAfter,after,stable,recovered,passed})
 await fs.writeFile(base+'native-cancel.json',JSON.stringify(tests,null,2)+'\n');console.log('Native cancel '+(stress?'stress':'normal')+': '+passed)
}
// Use a genuine browser target switch; never replace visibilityState or dispatch visibilitychange.
const blank=await task.newPage();await blank.goto('about:blank')
for(const p of await task.pages())await p.cdp('Emulation.setFocusEmulationEnabled',{enabled:false})
const targets=await task.tabs(),mainId=targets.find(t=>t.label==='p1').targetId,blankId=targets.find(t=>t.label===blank.label).targetId
const visibilityTests=[]
for(const stress of [false,true]){
await task.cdp('Target.activateTarget',{targetId:mainId})
await page.evaluate(()=>{window.__visibilityEvidence=[];if(window.__onVisibility)document.removeEventListener('visibilitychange',window.__onVisibility);window.__onVisibility=e=>__visibilityEvidence.push({at:performance.now(),wall:new Date().toISOString(),state:document.visibilityState,trusted:e.isTrusted,diagnostics:__SW_M1__.lightDiagnostics()});document.addEventListener('visibilitychange',window.__onVisibility);__SW_M1__.pause(false)})
if(stress)await evaluate(`window.__pressure=setInterval(()=>{const end=performance.now()+25;while(performance.now()<end){}},80);true`)
await startNative()
const before=await evaluate(`({record:__SW_M1__.records().at(-1),d:__SW_M1__.lightDiagnostics()})`)
await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false})
const hideIssued=new Date().toISOString();await task.cdp('Target.activateTarget',{targetId:blankId})
// Passive hidden span: no Page wrapper call on p1, which might re-enable focus emulation.
await new Promise(r=>setTimeout(r,8000))
await task.cdp('Target.activateTarget',{targetId:mainId})
await evaluate(`clearInterval(window.__pressure);true`)
const resumed=await evaluate(`({at:performance.now(),events:__visibilityEvidence,record:__SW_M1__.records().find(r=>r.action_id===${JSON.stringify(before.record.action_id)}),d:__SW_M1__.lightDiagnostics()})`)
await new Promise(r=>setTimeout(r,6000))
const later=await evaluate(`({events:__visibilityEvidence,d:__SW_M1__.lightDiagnostics(),scene:__SW_M1__.snapshot(),records:__SW_M1__.records()})`)
const recovered=await page.evaluate(()=>__SW_M1__.send('回到总览'))
const hiddenEvents=resumed.events.filter(e=>e.state==='hidden'&&e.trusted)
const hidden={condition:stress?'CONTROLLED_PRESSURE':'NORMAL',method:'Target.activateTarget to real blank tab with actual target IDs; focus emulation cleared per target; no spoofed property/events',hideIssued,before,resumed,later,recovered,passed:before.record.status==='RUNNING'&&hiddenEvents.length>0&&resumed.events.some(e=>e.state==='visible'&&e.trusted)&&resumed.record.status==='CANCELLED'&&resumed.record.error?.code==='PAGE_HIDDEN'&&later.d.ownership.dataTimers===1&&later.d.loop.active&&later.d.renderer.renderers===1&&recovered.status==='SUCCEEDED'}
visibilityTests.push(hidden);await fs.writeFile(base+'real-visibility.json',JSON.stringify(visibilityTests,null,2)+'\n')
}
await blank.close();await page.evaluate(()=>__SW_M1__.stopDiagnostics());await page.cdp('Emulation.setFocusEmulationEnabled',{enabled:false})
console.log('Real visibility: '+visibilityTests.map(t=>t.passed))
