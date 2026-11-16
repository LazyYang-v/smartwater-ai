const task=await taskSpace(62),page=(await task.pages())[0],fs=await import('node:fs/promises'),crypto=await import('node:crypto')
const base='/Users/leizhenyang/projects/smartwater-ai/docs/acceptance/m1/'
await fs.mkdir(base+'screenshots',{recursive:false})
const captures=[];let identity
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
await page.goto('http://127.0.0.1:4173/?qa=1');await page.waitForFunction(()=>window.__SW_M1__?.snapshot().status==='ready',undefined,{timeout:20000});await view()
identity=await page.evaluate(()=>fetch('/build-id.json',{cache:'no-store'}).then(r=>r.json()))
await page.evaluate(()=>{window.__SW_M1__.pause(true);window.__SW_M1__.setWaterPhase(0)})
await page.waitForFunction(()=>document.querySelectorAll('.trend-chart svg').length===2,undefined,{timeout:5000})
await capture('normal-1920.png')
await page.selectOption('#scenario','LOW_DO');await page.click('.alarm-select',{label:'Opening reproducible low DO event'});await capture('low-do.png')
await page.click('.alarm-locate',{label:'Locating alarm target through dispatcher'});await page.waitForFunction(()=>window.__SW_M1__.records().at(-1)?.status==='SUCCEEDED',undefined,{timeout:6000});await capture('alarm-located.png')
await page.selectOption('#scenario','MISSING_DATA');await page.click('.alarm-select',{label:'Showing retained missing-data alarm'});await capture('missing-data.png')
await page.click('.scene-actions button:nth-child(2)',{label:'Returning model to overview'});await page.waitForFunction(()=>window.__SW_M1__.snapshot().selectedId===null&&!window.__SW_M1__.snapshot().cameraBusy,undefined,{timeout:6000})
await page.click('.linked-blower',{label:'Showing unmodelled blower details'});await capture('data-only-blower.png')
await page.selectOption('#scenario','NORMAL');await page.fill('#command','定位一号曝气池');await page.press('#command','Enter');await page.waitForFunction(()=>window.__SW_M1__.records().at(-1)?.source==='DEMO_AGENT'&&window.__SW_M1__.records().at(-1)?.status==='SUCCEEDED',undefined,{timeout:6000});await capture('agent-focused.png')
await page.click('.scene-actions button:first-child',{label:'Checking preserved submerged aerators'});await capture('water-hidden.png')
await page.click('.scene-actions button:first-child',{label:'Restoring model water surface'});await page.fill('#command','回到总览');await page.press('#command','Enter');await page.waitForFunction(()=>window.__SW_M1__.records().at(-1)?.tool_name==='scene.reset_view'&&window.__SW_M1__.records().at(-1)?.status==='SUCCEEDED',undefined,{timeout:6000});await capture('agent-reset.png')
await view(1366,768);await page.evaluate(()=>window.__SW_M1__.panels({left:true,trends:false}));await capture('compact-1366.png')
await page.click('[role=tab]:first-child',{label:'Expanding compact oxygen trend'});await capture('compact-trend-expanded.png')
console.log(JSON.stringify({build:identity.build_id,screenshots:captures.length,all_resource_associations_passed:true}))
