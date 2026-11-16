const task=await taskSpace(62),page=(await task.pages())[0],fs=await import('node:fs/promises')
const base='/Users/leizhenyang/projects/smartwater-ai/docs/acceptance/m1/'
const results=[]
function assert(v,message){if(!v)throw new Error(message)}
async function test(name,run){try{const evidence=await run();results.push({name,status:'PASS',evidence});console.log('PASS '+name)}catch(e){results.push({name,status:'FAIL',error:String(e)});console.log('FAIL '+name+': '+e)}}
await page.goto('http://127.0.0.1:4173/?qa=1');await page.waitForFunction(()=>window.__SW_M1__?.snapshot().status==='ready',undefined,{timeout:20000})
await page.cdp('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
await page.waitForFunction(()=>document.querySelectorAll('.trend-chart svg').length===2,undefined,{timeout:5000})
await page.evaluate(()=>window.__SW_M1__.pause(true))
await test('three scenarios atomically bind KPI, details, chart endpoints and alarms',async()=>{
 const result=[]
 for(const scenario of ['NORMAL','LOW_DO','MISSING_DATA']){
  await page.selectOption('#scenario',scenario)
  const e=await page.evaluate(()=>{
   const api=window.__SW_M1__,s=api.data(),kp=[...document.querySelectorAll('.kpi-card')].map(el=>({key:el.dataset.metric,value:el.dataset.value,text:el.textContent,quality:el.dataset.quality})),trend=[...document.querySelectorAll('[data-trend]')].map(el=>({key:el.dataset.trend,value:el.dataset.lastValue,id:el.dataset.snapshotId}))
   return {data:s,kpi:kp,trend,detailId:document.querySelector('.device-summary').dataset.snapshotId,alarmCount:document.querySelectorAll('.alarm-item').length}
  })
  assert(e.data.scenario===scenario&&e.detailId===e.data.snapshotId,'Snapshot mixed')
  for(const key of ['do','blower_power']){const raw=e.data.readings[key].value;assert(e.data.history[key].at(-1).value===raw,'Trend raw mismatch');assert(e.trend.find(x=>x.key===key).id===e.data.snapshotId,'Trend snapshot mismatch');assert(raw===null?e.kpi.find(x=>x.key===key).value===undefined:e.kpi.find(x=>x.key===key).value===String(raw),'KPI raw mismatch')}
  assert(e.alarmCount===e.data.alarms.length&&Number(e.kpi.find(x=>x.key==='alarm_count').value)===e.alarmCount,'Alarm counts differ')
  if(scenario==='MISSING_DATA'){assert(e.kpi.find(x=>x.key==='do').text.includes('—'),'Missing represented as number');assert(e.kpi.find(x=>x.key==='blower_power').quality==='STALE','Stale not distinguished');assert(e.data.alarms[0].status==='AWAITING_DATA','Alarm silently cleared')}
  result.push({scenario,snapshotId:e.data.snapshotId,kpi:e.kpi,alarmCount:e.alarmCount})
 }
 return result
})
await test('range switch uses same history and never moves camera or reloads GLB',async()=>{
 const before=await page.evaluate(()=>window.__SW_M1__.snapshot()),ranges=[]
 for(const h of [6,24,1]){
  await page.click(`.trend-slot:first-child .range-switch button:nth-child(${h===1?1:h===6?2:3})`,{label:'Switching shared demo time range'})
  const e=await page.evaluate(()=>({hours:window.__SW_M1__.diagnostics().hours,dom:[...document.querySelectorAll('[data-hours]')].map(el=>el.dataset.hours),snapshot:window.__SW_M1__.snapshot()}))
  assert(e.hours===h&&e.dom.every(v=>v===String(h)),'Range switch not shared');assert(e.snapshot.loadGeneration===before.loadGeneration&&JSON.stringify(e.snapshot.camera)===JSON.stringify(before.camera),'Chart took camera or reloaded asset');ranges.push(h)
 }
 return {ranges}
})
await test('alarm detail chooses DO context; explicit locate dispatches USER action and actual render',async()=>{
 await page.selectOption('#scenario','LOW_DO');await page.click('.alarm-select',{label:'Opening demo alarm details'})
 const before=await page.evaluate(()=>({records:window.__SW_M1__.records().length,snapshot:window.__SW_M1__.snapshot(),diag:window.__SW_M1__.diagnostics()}))
 assert(before.diag.activeTrend==='do','Alarm context not DO')
 await page.click('.alarm-locate',{label:'Locating alarm device explicitly'})
 await page.waitForFunction(()=>window.__SW_M1__.records().at(-1)?.status==='SUCCEEDED',undefined,{timeout:6000})
 const e=await page.evaluate(()=>({record:window.__SW_M1__.records().at(-1),scene:window.__SW_M1__.snapshot(),diag:window.__SW_M1__.diagnostics()}))
 assert(e.record.source==='USER'&&e.record.trigger==='告警定位','UI origin missing');assert(e.scene.selectedId==='SW_BIO_AERATION_001'&&e.record.result.rendered_frame>before.snapshot.frame,'False locate result');assert(e.diag.contextId===e.scene.selectedId,'Context inconsistent');return e
})
await test('DATA_ONLY and schematic nodes cannot locate or fabricate tools',async()=>{
 const before=await page.evaluate(()=>({scene:window.__SW_M1__.snapshot(),count:window.__SW_M1__.records().length}))
 await page.click('.linked-blower',{label:'Inspecting data-only linked blower'})
 const e=await page.evaluate(()=>({diag:window.__SW_M1__.diagnostics(),text:document.querySelector('.device-summary').textContent,disabled:document.querySelector('.locate-context').disabled,result:window.__SW_M1__.locate('SW_AIR_BLOWER_001'),count:window.__SW_M1__.records().length,scene:window.__SW_M1__.snapshot()}))
 assert(e.disabled&&e.text.includes('暂无三维模型')&&e.result.status==='UNAVAILABLE','Data-only can locate');assert(e.count===before.count&&JSON.stringify(e.scene.camera)===JSON.stringify(before.scene.camera),'Unmodelled changed camera/log')
 await page.click('.process-panel .text-button',{label:'Expanding process schematic'})
 await page.click('[data-process-id="PROCESS_primary"]',{label:'Inspecting unmodelled process node'})
 const schematic=await page.evaluate(()=>({disabled:document.querySelector('.locate-context').disabled,text:document.querySelector('.device-summary').textContent,count:window.__SW_M1__.records().length}))
 assert(schematic.disabled&&schematic.text.includes('未建模')&&schematic.count===before.count,'Schematic pretended to locate');return {dataOnly:e,schematic}
})
await test('manual model selection and both parser shortcuts share context and records',async()=>{
 await page.click('[data-process-id="SW_BIO_AERATION_001"]',{label:'Selecting modelled process device'})
 await page.click('.command-suggestions button:first-child',{label:'Running deterministic locate shortcut'})
 await page.waitForFunction(()=>window.__SW_M1__.records().at(-1)?.status==='SUCCEEDED',undefined,{timeout:6000})
 const focus=await page.evaluate(()=>({record:window.__SW_M1__.records().at(-1),context:window.__SW_M1__.diagnostics().contextId,selection:window.__SW_M1__.snapshot().selectedId}))
 assert(focus.record.source==='DEMO_AGENT'&&focus.selection===focus.context,'Shortcut bypassed parser/context')
 await page.fill('#command','回到总览');await page.press('#command','Enter')
 await page.waitForFunction(()=>window.__SW_M1__.records().at(-1)?.tool_name==='scene.reset_view'&&window.__SW_M1__.records().at(-1)?.status==='SUCCEEDED',undefined,{timeout:6000})
 const reset=await page.evaluate(()=>window.__SW_M1__.snapshot());assert(reset.selectedId===null&&reset.selectionEffects===0,'Reset cleanup failed');return {focus,reset}
})
await test('scenario switch preserves tool history and camera',async()=>{
 const before=await page.evaluate(()=>({count:window.__SW_M1__.records().length,scene:window.__SW_M1__.snapshot()}))
 await page.selectOption('#scenario','NORMAL');await page.selectOption('#scenario','LOW_DO')
 const after=await page.evaluate(()=>({count:window.__SW_M1__.records().length,scene:window.__SW_M1__.snapshot()}))
 assert(before.count===after.count&&JSON.stringify(before.scene.camera)===JSON.stringify(after.scene.camera),'Scenario reset scene/logs');return {before,after}
})
await test('pause holds demo time while system clock advances; resume publishes once',async()=>{
 const before=await page.evaluate(()=>({data:window.__SW_M1__.data(),clock:document.querySelector('.header-clocks').textContent}))
 await new Promise(r=>setTimeout(r,6200))
 const paused=await page.evaluate(()=>({data:window.__SW_M1__.data(),clock:document.querySelector('.header-clocks').textContent}))
 assert(before.data.snapshotId===paused.data.snapshotId&&before.clock!==paused.clock,'Pause affected wrong clock')
 await page.click('.pause-demo',{label:'Resuming central simulation clock'})
 await page.waitForFunction(()=>window.__SW_M1__.data().tick===1,undefined,{timeout:7500})
 const resumed=await page.evaluate(()=>window.__SW_M1__.data());assert(resumed.tick===1,'Resume catch-up burst')
 await page.click('.pause-demo',{label:'Pausing reproducible demo time'})
 return {before:before.data.snapshotId,paused:paused.data.snapshotId,resumed:resumed.snapshotId}
})
await test('repeated panels and 1366 layout reuse charts, scene and correct drawing buffer',async()=>{
 const before=await page.evaluate(()=>({s:window.__SW_M1__.snapshot(),d:window.__SW_M1__.diagnostics()}))
 for(let i=0;i<6;i++){await page.click('.sidebar-toggle',{label:'Toggling information panel layout'});await page.evaluate(i=>window.__SW_M1__.range(i%2?1:24),i)}
 await page.cdp('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:2,mobile:false})
 await page.evaluate(()=>window.__SW_M1__.panels({trends:true,tab:'do'}))
 await page.waitForFunction(()=>document.querySelector('.trend-slot.active-trend .trend-chart').clientHeight>50,undefined,{timeout:5000})
 await page.click('[role=tab]:nth-child(2)',{label:'Switching compact power trend tab'})
 const e=await page.evaluate(()=>({s:window.__SW_M1__.snapshot(),d:window.__SW_M1__.diagnostics(),width:innerWidth,height:innerHeight,bodyWidth:document.documentElement.scrollWidth,bodyHeight:document.documentElement.scrollHeight,input:document.querySelector('.agent-input').getBoundingClientRect().toJSON(),chart:[...document.querySelectorAll('.trend-chart')].map(x=>({width:x.clientWidth,height:x.clientHeight}))}))
 assert(e.d.sceneInstances===1&&e.d.renderLoops===1&&e.s.loadGeneration===before.s.loadGeneration,'Duplicate scene/asset')
 assert(e.d.chartStats.created===2&&e.d.chartStats.active===2,'Chart recreated on updates')
 assert(e.s.rendererDpr===1&&e.s.nativeDpr===2&&e.s.drawingBuffer.width===e.s.canvas.width,'3D DPR lowered entire page or mismatched buffer')
 assert(e.bodyWidth===1366&&e.bodyHeight===768&&e.input.bottom<=768,'Compact layout hides input')
 assert(e.chart.some(x=>x.width>0&&x.height>0),'No visible chart');return e
})
await test('model load failure leaves data, charts and demo controls available',async()=>{
 await page.evaluate(()=>window.__SW_M1__.load('/models/m1-missing.glb'))
 await page.selectOption('#scenario','MISSING_DATA')
 const e=await page.evaluate(()=>({s:window.__SW_M1__.snapshot(),d:window.__SW_M1__.data(),text:document.querySelector('.kpi-overview').textContent,record:window.__SW_M1__.records().at(-1)}))
 assert(e.s.status==='missing'&&e.d.scenario==='MISSING_DATA'&&e.text.includes('—'),'Model failure broke independent panels')
 const action=await page.evaluate(()=>window.__SW_M1__.send('定位一号曝气池'));assert(action.status==='FAILED','Failed model returned success')
 await page.click('.load-state button',{label:'Retrying unchanged model asset'});await page.waitForFunction(()=>window.__SW_M1__.snapshot().status==='ready',undefined,{timeout:20000});return {failure:e,action}
})
await test('component unmount disposes chart instances and the single 3D render loop',async()=>{
 const before=await page.evaluate(()=>window.__SW_M1__.diagnostics())
 const after=await page.evaluate(()=>{window.__SW_QA_UNMOUNT__();return window.__SW_M1__.diagnostics()})
 assert(before.chartStats.active===2&&after.chartStats.active===0&&after.chartStats.disposed===2,'Charts not disposed')
 assert(after.renderLoops===0,'3D loop retained after unmount');return {before,after}
})
await fs.writeFile(base+'feature-tests.json',JSON.stringify({tested_at:new Date().toISOString(),results},null,2)+'\n')
console.log(JSON.stringify({pass:results.filter(x=>x.status==='PASS').length,fail:results.filter(x=>x.status==='FAIL').map(x=>x.name)}))
