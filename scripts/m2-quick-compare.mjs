const task=await taskSpace(62),page=task.page('p1'),fs=await import('node:fs/promises')
const path='/Users/leizhenyang/projects/smartwater-ai/docs/acceptance/m1-stability-r1/m2-quickchecks.json'
const evidence={kind:'Direction-only short checks, not formal performance acceptance',at:new Date().toISOString(),oldUiOnlyEvidence:'diagnostics-r2/THREE_PAUSED.json',results:[]}
const save=()=>fs.writeFile(path,JSON.stringify(evidence,null,2)+'\n')
let before=await page.evaluate(()=>__SW_M1__.snapshot());await new Promise(r=>setTimeout(r,2500));let after=await page.evaluate(()=>__SW_M1__.snapshot())
evidence.idle={before,after,extra_draws:after.frame-before.frame,interpretation:'Idle draw count, not FPS'}
evidence.tools=await page.evaluate(async()=>{const a=__SW_M1__,before=a.snapshot();const focus=await a.send('定位一号曝气池'),focused=a.snapshot(),reset=await a.send('回到总览'),restored=a.snapshot();a.setWater(false);return {before,focus,focused,reset,restored,water:a.snapshot()}})
await page.evaluate(()=>{__SW_M1__.setWater(true);__SW_M1__.setRenderMode('full')})
await page.evaluate(()=>{const t={done:false};window.__SHORT__=t;void __SW_M1__.measurePerformance(12).then(result=>Object.assign(t,{done:true,result})).catch(e=>Object.assign(t,{done:true,error:String(e)}))})
for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,5000));if(await page.evaluate(()=>__SHORT__.done))break}
evidence.results.push({case:'FULL_DASHBOARD_FULL_EFFECTS',...await page.evaluate(()=>__SHORT__)});await save()
await page.evaluate(()=>{__SW_M1__.setRenderMode('interactive');__SW_M1__.diagnosticSwitch({scenePaused:true})})
const uiBefore=await page.evaluate(()=>__SW_M1__.lightDiagnostics());await page.selectOption('#scenario','LOW_DO');await new Promise(r=>setTimeout(r,6000));const uiAfter=await page.evaluate(()=>__SW_M1__.lightDiagnostics())
evidence.uiOnly={before:uiBefore,after:uiAfter,extra_draws:uiAfter.frame-uiBefore.frame,data_refreshed:uiAfter.snapshotId!==uiBefore.snapshotId};await page.evaluate(()=>__SW_M1__.diagnosticSwitch({scenePaused:false}));await save()
await page.goto('http://127.0.0.1:4173/viewer.html?qa=1&benchmark=1');await page.cdp('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:2,mobile:false});await page.waitForFunction(()=>window.__SW_VIEWER__?.snapshot().status==='ready',undefined,{timeout:20000})
await task.cdp('Target.activateTarget',{targetId:(await task.tabs()).find(t=>t.label==='p1').targetId})
await page.evaluate(()=>{__SW_VIEWER__.mode('full');const t={done:false};window.__SHORT__=t;void __SW_VIEWER__.measure(12).then(result=>Object.assign(t,{done:true,result})).catch(e=>Object.assign(t,{done:true,error:String(e)}))})
for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,5000));if(await page.evaluate(()=>__SHORT__.done))break}
evidence.results.push({case:'INDEPENDENT_SAME_GLB_FULL_EFFECTS',...await page.evaluate(()=>__SHORT__)});await page.evaluate(()=>__SW_VIEWER__.mode('interactive'));await save()
console.log(JSON.stringify({idleDraws:evidence.idle.extra_draws,tools:[evidence.tools.focus.status,evidence.tools.reset.status],uiOnly:evidence.uiOnly.extra_draws,results:evidence.results.map(x=>({case:x.case,fps:x.result?.average_fps,p95:x.result?.p95_frame_ms,canvas:x.result?.canvas,buffer:x.result?.drawingBuffer}))}))
