const task=await taskSpace(62),page=(await task.pages())[0],fs=await import('node:fs/promises'),crypto=await import('node:crypto')
const base='/Users/leizhenyang/projects/smartwater-ai/docs/acceptance/m1/'

const captures=JSON.parse(await fs.readFile(base+'screenshots-manifest.json','utf8'));let identity
function assert(v,msg){if(!v)throw new Error(msg)}
async function view(width=1920,height=1080){await page.cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))}
async function capture(file){
 await page.waitForFunction(()=>{const s=window.__SW_M1__.snapshot();return s.status==='ready'&&s.firstRenderMs>0&&s.calls>0&&document.querySelector('.statusbar').textContent.includes(s.calls+' DRAW CALLS')},undefined,{timeout:8000})
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))
 const meta=await page.evaluate(async()=>{
  const api=window.__SW_M1__,data=api.data(),hashes={}
  for(const el of document.querySelectorAll('script[src],link[rel=stylesheet][href]')){
   const url=el.src||el.href,res=await fetch(url,{cache:'no-store'}),bytes=await res.arrayBuffer()
   hashes[new URL(url).pathname]=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('')
  }
  return {captured_at_utc:new Date().toISOString(),url:location.href,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},scene:api.snapshot(),dashboard:api.diagnostics(),data:{snapshotId:data.snapshotId,scenario:data.scenario,demoTime:data.demoTime,updatedAt:data.updatedAt,readings:data.readings,alarms:data.alarms},records:api.records(),browserResponseHashes:hashes,modelRequests:performance.getEntriesByType('resource').filter(e=>e.name.includes('.glb')).map(e=>({url:e.name,duration:e.duration,transferSize:e.transferSize}))}
 })
 for(const [p,h] of Object.entries(meta.browserResponseHashes))assert(identity.files[p.slice(1)]?.sha256===h,'Actual entry differs from fixed build')
 assert(meta.scene.loadedModelSha256===identity.glb_sha256,'Actually loaded GLB differs')
 const image=await page.cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}),bytes=Buffer.from(image.data,'base64')
 await fs.writeFile(base+'screenshots/'+file,bytes);captures.push({file:'screenshots/'+file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),build_id:identity.build_id,...meta})
 await fs.writeFile(base+'screenshots-manifest.json',JSON.stringify(captures,null,2)+'\n');console.log('Captured '+file)
}

const nativeAttempt=await page.evaluate(()=>({recordCount:window.__SW_M1__.records().length,records:window.__SW_M1__.records(),rendered:document.querySelectorAll('.action-record').length,pendingActionExists:!!window.__cancelTest}))
await fs.writeFile(base+'final-ui-native-pointer-attempt.json',JSON.stringify({observed_at:new Date().toISOString(),outcome:'Native cancellation pointer was not delivered before the 900ms motion finished; target no longer existed. This is not counted as native cancellation passing.',...nativeAttempt},null,2)+'\n')
await page.goto('http://127.0.0.1:4173/?qa=1');await page.waitForFunction(()=>window.__SW_M1__?.snapshot().status==='ready',undefined,{timeout:20000});await view()
await page.evaluate(()=>{window.__SW_M1__.pause(true);window.__REAL_UI_LOGS__={done:false,records:[],error:null};void(async()=>{for(let i=0;i<22;i++)await window.__SW_M1__.send(i%2?'回到总览':'定位一号曝气池');window.__REAL_UI_LOGS__={done:true,records:window.__SW_M1__.records(),error:null}})().catch(e=>{window.__REAL_UI_LOGS__.error=String(e);window.__REAL_UI_LOGS__.done=true})})
for(let i=0;i<4;i++){await new Promise(r=>setTimeout(r,25000));if(await page.evaluate(()=>window.__REAL_UI_LOGS__.done))break}
const prep=await page.evaluate(()=>window.__REAL_UI_LOGS__)
await fs.writeFile(base+'final-ui-real-history.json',JSON.stringify(prep,null,2)+'\n')
if(!prep.done||prep.error||prep.records.length<22)throw new Error('Real history preparation failed')
const tests=[]
function check(name,condition,evidence){tests.push({name,status:condition?'PASS':'FAIL',evidence});if(!condition)console.log('FAIL '+name)}
const count=await page.evaluate(()=>({all:window.__SW_M1__.records().length,dom:document.querySelectorAll('.action-record').length}))
check('many actions keep full history with bounded automatic DOM log list',count.all===22&&count.dom===20,count)
await page.evaluate(()=>{const e=document.querySelector('.agent-body');e.scrollTop=e.scrollHeight})
await page.waitForFunction(()=>{const r=document.querySelector('.action-records>.secondary-button')?.getBoundingClientRect();return r&&r.top>0&&r.bottom<innerHeight},undefined,{timeout:7000})
await page.click('.action-records>.secondary-button',{label:'Paging genuine retained tool records'})
const paged=await page.evaluate(()=>({all:window.__SW_M1__.records().length,dom:document.querySelectorAll('.action-record').length}))
check('explicit history paging exposes earlier records without deleting any',paged.all===22&&paged.dom===22,paged)
const cancelled=await page.evaluate(async()=>{
 const action=window.__SW_M1__.send('定位一号曝气池');await Promise.resolve();await Promise.resolve()
 const button=document.querySelector('.task-state button');if(!button)throw new Error('Cancel DOM control was not rendered')
 button.click();const record=await action;await new Promise(requestAnimationFrame)
 return {method:'DOM click event path; not a native pointer timing claim',record,scene:window.__SW_M1__.snapshot(),labels:document.querySelectorAll('.selected-tag').length}
})
check('workspace cancel DOM event cancels actual action and cleans labels/corners',cancelled.record.status==='CANCELLED'&&cancelled.scene.selectionEffects===0&&cancelled.labels===0,cancelled)
const fonts=await page.evaluate(()=>({tool:getComputedStyle(document.querySelector('.action-record strong')).fontSize,id:getComputedStyle(document.querySelector('.action-record code')).fontSize,status:getComputedStyle(document.querySelector('.record-top span')).fontSize,input:getComputedStyle(document.querySelector('#command')).fontSize}))
check('critical tool text remains at least 14 CSS pixels',Object.values(fonts).every(x=>parseFloat(x)>=14),fonts)
await fs.writeFile(base+'final-ui-after-cancel-history.json',JSON.stringify(await page.evaluate(()=>window.__SW_M1__.records()),null,2)+'\n')
// Start a clean fixed-build page for the expanded process evidence and real chart tooltip.
await page.goto('http://127.0.0.1:4173/?qa=1');await page.waitForFunction(()=>window.__SW_M1__?.snapshot().status==='ready',undefined,{timeout:20000});await view()
identity=await page.evaluate(()=>fetch('/build-id.json',{cache:'no-store'}).then(r=>r.json()))
await page.evaluate(()=>{window.__SW_M1__.pause(true);window.__SW_M1__.setWaterPhase(0)})
await page.click('.process-panel .text-button',{label:'Showing model scope in process schematic'});await capture('process-expanded.png')
const rect=await page.evaluate(()=>document.querySelector('.trend-slot:first-child .trend-chart').getBoundingClientRect().toJSON())
await page.mouse.move(rect.right-20,rect.top+rect.height/2,{label:'Inspecting actual ECharts tooltip'})
await page.waitForFunction(()=>[...document.querySelectorAll('.trend-chart div')].some(e=>e.textContent.includes('质量：有效')&&e.textContent.includes('SIMULATED')),undefined,{timeout:5000})
const tooltip=await page.evaluate(()=>[...document.querySelectorAll('.trend-chart div')].filter(e=>e.textContent.includes('质量：有效')&&e.textContent.includes('SIMULATED')).map(e=>e.textContent))
check('actual pointer tooltip exposes demo time, value, unit, quality and source',tooltip.some(t=>t.includes('mg/L')&&t.includes('溶解氧')&&t.includes('16:00:00')),tooltip)
await fs.writeFile(base+'final-ui-checks.json',JSON.stringify({tested_at_utc:new Date().toISOString(),tests},null,2)+'\n')
console.log(JSON.stringify({passed:tests.filter(t=>t.status==='PASS').length,failed:tests.filter(t=>t.status==='FAIL').map(t=>t.name),screenshots:captures.length}))
