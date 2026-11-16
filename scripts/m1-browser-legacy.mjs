// Execute with: ego-browser nodejs < scripts/browser-acceptance.mjs
const entry = (await listTaskSpaces()).find(s => s.name === 'SmartWater M0 implementation')
const task = !entry ? await taskSpace('SmartWater M0 implementation') : entry.ownership === 'user' ? await claimTaskSpace(entry.id) : entry.ownership === 'agentDelegatedToUser' ? await takeOverTaskSpace(entry.id) : await taskSpace(entry.id)
const page = (await task.pages())[0] ?? await task.adopt((await task.tabs())[0].page)
const fs = await import('node:fs/promises')
const base = '/Users/leizhenyang/projects/smartwater-ai/docs/acceptance/m1/legacy/'
const crypto = await import('node:crypto')
const screenshotRecords = []
let identity
const results = []
function assert(condition, message) { if (!condition) throw new Error(message) }
async function test(name, fn) {
  try { const evidence = await fn(); results.push({name,status:'PASS',evidence}); console.log('PASS '+name) }
  catch(error) { results.push({name,status:'FAIL',error:String(error)}); console.log('FAIL '+name+': '+error) }
}
async function view(width=1920,height=1080) {
  await page.cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false})
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
}
async function capture(filename) {
  const evidence=await page.evaluate(async()=>{
    const hashes={}
    const urls=[...document.querySelectorAll('script[src],link[rel="stylesheet"][href]')].map(el=>el.src||el.href)
    for(const url of urls){const response=await fetch(url,{cache:'no-store'});const data=await response.arrayBuffer();hashes[new URL(url).pathname]=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(v=>v.toString(16).padStart(2,'0')).join('')}
    return {captured_at_utc:new Date().toISOString(),viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},snapshot:window.__SW_M0__.snapshot(),loadedEntryUrls:urls,browserResponseHashes:hashes,selectedLabels:document.querySelectorAll('.selected-tag').length}
  })
  for(const [url,hash] of Object.entries(evidence.browserResponseHashes))assert(identity.files[url.slice(1)]?.sha256===hash,'Browser entry does not match fixed build: '+url)
  if(evidence.snapshot.loadedModelUrl){
    const modelPath=new URL(evidence.snapshot.loadedModelUrl).pathname.slice(1)
    assert(identity.files[modelPath]?.sha256===evidence.snapshot.loadedModelSha256,'Actual GLB response differs from fixed build')
  }else assert(evidence.snapshot.status!=='ready','A ready scene has no verifiable GLB response')
  const shot=await page.cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  const bytes=Buffer.from(shot.data,'base64')
  await fs.writeFile(base+filename,bytes)
  screenshotRecords.push({file:filename,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),build_id:identity.build_id,...evidence})
  await fs.writeFile(base+'screenshots-manifest.json',JSON.stringify(screenshotRecords,null,2)+'\n')
}
await fs.mkdir(base,{recursive:true});
await page.goto('http://127.0.0.1:4173/?qa=1',{timeout:20000})
await page.waitForFunction(()=>window.__SW_M0__?.snapshot().status==='ready',undefined,{timeout:20000})
await view()
identity=await page.evaluate(()=>fetch('/build-id.json',{cache:'no-store'}).then(response=>response.json()))
const browser=await page.evaluate(async()=>({userAgent:navigator.userAgent,details:navigator.userAgentData ? await navigator.userAgentData.getHighEntropyValues(['fullVersionList','platformVersion','architecture','bitness']) : null,source:'Browser-reported navigator values; Browser.getVersion unavailable'}))
const initial=await page.evaluate(()=>({snapshot:window.__SW_M0__.snapshot(),assets:window.__SW_M0__.assetReport(),userAgent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},resources:performance.getEntriesByType('resource').filter(x=>x.name.includes('.glb')||x.name.includes('.hdr')).map(x=>({url:x.name,duration:x.duration,transferSize:x.transferSize,decodedBodySize:x.decodedBodySize}))}))
await test('GLB / HDR loaded with unique device and independent water',async()=>{
  assert(initial.snapshot.status==='ready','Scene not ready')
  assert(initial.assets.filter(x=>x.device_id==='SW_BIO_AERATION_001').length===1,'Device id not unique')
  assert(initial.assets.some(x=>x.name==='WATER_Surface'),'Water missing')
  assert(!initial.assets.some(x=>['Cube','Camera','Light'].includes(x.name)),'Unmanaged objects exported')
  return initial
})
await test('unknown command creates no tool record',async()=>{
  const e=await page.evaluate(async()=>{const before=window.__SW_M0__.records().length;const result=await window.__SW_M0__.send('开启真实鼓风机');return {before,after:window.__SW_M0__.records().length,result}})
  assert(e.result===null&&e.before===e.after,'Unknown command dispatched');return e
})
await test('focus and reset verify camera, selection and actual render',async()=>{
  const e=await page.evaluate(async()=>{const before=window.__SW_M0__.snapshot();const focus=await window.__SW_M0__.send('定位一号曝气池');const focused=window.__SW_M0__.snapshot();const reset=await window.__SW_M0__.send('回到总览');return {before,focus,focused,reset,after:window.__SW_M0__.snapshot()}})
  assert(e.focus.status==='SUCCEEDED'&&e.reset.status==='SUCCEEDED','Tools did not succeed')
  assert(e.focused.selectedId==='SW_BIO_AERATION_001'&&e.after.selectedId===null,'Selection not updated')
  assert(Math.hypot(...e.focused.camera.map((v,i)=>v-e.before.camera[i]))>5,'Focus not distinct')
  assert(Math.hypot(...e.after.camera.map((v,i)=>v-e.before.camera[i]))<1e-5,'Reset position mismatch')
  assert(e.focus.result.rendered_frame>e.before.frame&&e.reset.result.rendered_frame>e.focus.result.rendered_frame,'Missing render receipt');return e
})
await test('duplicate action id has no second side effect',async()=>{
  const e=await page.evaluate(async()=>{const call={tool_name:'scene.focus_device',arguments:{device_id:'SW_BIO_AERATION_001'}};const before=window.__SW_M0__.records().length;const first=await window.__SW_M0__.dispatch(call,'browser-repeat');const second=await window.__SW_M0__.dispatch(call,'browser-repeat');return {before,after:window.__SW_M0__.records().length,first,second}})
  assert(e.after-e.before===1&&e.first.result.rendered_frame===e.second.result.rendered_frame,'Repeated side effect');return e
})
await test('missing device explicitly fails',async()=>{
  const e=await page.evaluate(()=>window.__SW_M0__.dispatch({tool_name:'scene.focus_device',arguments:{device_id:'SW_MISSING'}},'missing-device'))
  assert(e.status==='FAILED'&&e.error.code==='DEVICE_NOT_FOUND','Missing id returned success');return e
})
await test('real in-progress reload rejects commands',async()=>{
  const e=await page.evaluate(async()=>{const pending=window.__SW_M0__.load();const result=await window.__SW_M0__.send('定位一号曝气池');await pending;return result})
  assert(e.status==='FAILED'&&e.error.code==='SCENE_NOT_READY','Loading returned success');return e
})
await test('missing GLB fails and ordinary retry recovers',async()=>{
  const e=await page.evaluate(async()=>{await window.__SW_M0__.load('/models/not-present.glb');return {snapshot:window.__SW_M0__.snapshot(),action:await window.__SW_M0__.send('定位一号曝气池')}})
  assert(e.action.status==='FAILED'&&e.action.error.code==='LOAD_FAILED','Missing model returned success')
  await page.click('loc=css:.load-state button',{label:'Retrying actual model load'})
  await page.waitForFunction(()=>window.__SW_M0__.snapshot().status==='ready',undefined,{timeout:15000});return e
})
await test('invalid GLB enters load failure and blocks tools',async()=>{
  const e=await page.evaluate(async()=>{await window.__SW_M0__.load('/favicon.svg');return {snapshot:window.__SW_M0__.snapshot(),action:await window.__SW_M0__.send('回到总览')}})
  assert(e.snapshot.status==='error'&&e.action.status==='FAILED','Invalid GLB did not fail')
  await view();await capture('load-failure.png')
  await page.click('loc=css:.load-state button',{label:'Recovering from invalid asset'})
  await page.waitForFunction(()=>window.__SW_M0__.snapshot().status==='ready',undefined,{timeout:15000});return e
})
await test('rapid commands cancel the old action',async()=>{
  const e=await page.evaluate(async()=>{const old=window.__SW_M0__.send('定位一号曝气池');await new Promise(requestAnimationFrame);const current=window.__SW_M0__.send('回到总览');return Promise.all([old,current])})
  assert(e[0].status==='CANCELLED'&&e[1].status==='SUCCEEDED','Superseded action returned success');return e
})
await test('manual camera drag cancels the running action',async()=>{
  await page.evaluate(()=>{window.__pendingAction=window.__SW_M0__.send('定位一号曝气池');return true})
  await page.mouse.move(620,500);await page.mouse.down();await page.mouse.move(710,535);await page.mouse.up()
  const e=await page.evaluate(()=>window.__pendingAction)
  assert(e.status==='CANCELLED','User interruption did not cancel');return e
})
await test('timeout cannot return success',async()=>{
  const e=await page.evaluate(async()=>{window.__SW_M0__.fault('timeout');const result=await window.__SW_M0__.send('定位一号曝气池');window.__SW_M0__.fault('restore');return result})
  assert(e.status==='FAILED'&&e.error.code==='TIMEOUT','Timeout returned success');return e
})
await test('ordinary device click shares selection with tools',async()=>{
  await page.evaluate(()=>window.__SW_M0__.send('回到总览'))
  const point=await page.evaluate(()=>window.__SW_M0__.project([-10,.5,0]))
  await page.mouse.click(point.x,point.y,{label:'Selecting actual basin mesh'})
  const e=await page.evaluate(()=>window.__SW_M0__.snapshot())
  assert(e.selectedId==='SW_BIO_AERATION_001','Click did not select registered device');return {point,snapshot:e}
})
await test('ordinary water toggle changes independent mesh state',async()=>{
  await page.click('loc=css:.scene-actions button:first-child',{label:'Hiding independent water surface'})
  const hidden=await page.evaluate(()=>window.__SW_M0__.snapshot())
  await page.click('loc=css:.scene-actions button:first-child',{label:'Restoring basin water surface'})
  const shown=await page.evaluate(()=>window.__SW_M0__.snapshot())
  assert(hidden.waterVisible===false&&shown.waterVisible===true,'Water toggle failed');return {hidden,shown}
})
await test('foreground road occludes the buried device when clicking',async()=>{
  const point=await page.evaluate(()=>window.__SW_M0__.project([5,.04,16.4]))
  await page.mouse.click(point.x,point.y,{label:'Checking road selection occlusion'})
  const snapshot=await page.evaluate(()=>window.__SW_M0__.snapshot())
  assert(snapshot.selectedId===null,'Ground click selected an occluded device');return {point,snapshot}
})
await test('repeated focus / supersession / reset do not duplicate or leak selection effects',async()=>{
  const e=await page.evaluate(async()=>{
    const snapshots=[]
    for(let i=0;i<4;i++){await window.__SW_M0__.send('定位一号曝气池');snapshots.push(window.__SW_M0__.snapshot());await window.__SW_M0__.send('回到总览');snapshots.push(window.__SW_M0__.snapshot())}
    const old=window.__SW_M0__.send('定位一号曝气池');await new Promise(requestAnimationFrame);const current=window.__SW_M0__.send('定位一号曝气池');const repeated=await Promise.all([old,current]);const selected=window.__SW_M0__.snapshot();await window.__SW_M0__.send('回到总览');return {snapshots,repeated,selected,clean:window.__SW_M0__.snapshot()}
  })
  assert(e.repeated[0].status==='CANCELLED'&&e.repeated[1].status==='SUCCEEDED','Same-device supersession is incorrect')
  assert(e.selected.selectionEffects===1&&e.clean.selectionEffects===0,'Selection effects duplicated or retained')
  assert(e.snapshots.every((s,i)=>s.selectionEffects===(i%2===0?1:0)),'Selection cleanup failed')
  assert(e.snapshots.filter((_,i)=>i%2===1).every(s=>s.sceneGeometryCount===50),'Effect geometry leaked after reset')
  return e
})
await fs.writeFile(base+'browser-tests.json',JSON.stringify({browser,initial,results},null,2)+'\n')
console.log(JSON.stringify({passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').map(x=>x.name)}))

