// Execute with: ego-browser nodejs < scripts/browser-acceptance.mjs
const entry = (await listTaskSpaces()).find(s => s.name === 'SmartWater M0 implementation')
const task = !entry ? await taskSpace('SmartWater M0 implementation') : entry.ownership === 'user' ? await claimTaskSpace(entry.id) : entry.ownership === 'agentDelegatedToUser' ? await takeOverTaskSpace(entry.id) : await taskSpace(entry.id)
const page = (await task.pages())[0] ?? await task.adopt((await task.tabs())[0].page)
const fs = await import('node:fs/promises')
const base = '/Users/leizhenyang/projects/smartwater-ai/docs/acceptance/m0-visual-r1/final/'
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
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  await page.waitForFunction(()=>{const calls=window.__SW_M0__.snapshot().calls;return calls>0 && document.querySelector('.statusbar').textContent.includes(calls+' DRAW CALLS')},undefined,{timeout:6000})
  const evidence=await page.evaluate(async()=>{
    const hashes={}
    const urls=[...document.querySelectorAll('script[src],link[rel="stylesheet"][href]')].map(el=>el.src||el.href)
    for(const url of urls){const response=await fetch(url,{cache:'no-store'});const data=await response.arrayBuffer();hashes[new URL(url).pathname]=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(v=>v.toString(16).padStart(2,'0')).join('')}
    return {captured_at_utc:new Date().toISOString(),viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},snapshot:window.__SW_M0__.snapshot(),loadedEntryUrls:urls,browserResponseHashes:hashes,selectedLabels:document.querySelectorAll('.selected-tag').length,toolRecords:window.__SW_M0__.records()}
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

await fs.mkdir(base,{recursive:false})
await page.goto('http://127.0.0.1:4173/?qa=1')
await page.waitForFunction(()=>window.__SW_M0__?.snapshot().status==='ready',undefined,{timeout:20000})
await view()
identity=await page.evaluate(()=>fetch('/build-id.json',{cache:'no-store'}).then(r=>r.json()))
await page.evaluate(()=>window.__SW_M0__.setWaterPhase(0))
await capture('overview-1920.png')
await page.evaluate(()=>window.__SW_M0__.setView([14,7,-20],[8,1,-8.2]));await capture('connections-closeup.png')
await page.evaluate(()=>{window.__SW_M0__.setWater(false);window.__SW_M0__.setView([13,6,-18],[5,-1.2,-6.7])});await capture('concrete-closeup.png')
await page.evaluate(()=>window.__SW_M0__.setView([10,31,28],[0,-2.3,0]));await capture('aerators-water-hidden.png')
await page.evaluate(()=>{window.__SW_M0__.setWater(true);window.__SW_M0__.setView([-9,5.7,15],[-8,.5,2])});await capture('water-closeup.png')
await page.evaluate(()=>window.__SW_M0__.send('回到总览'))
await page.fill('#command','定位一号曝气池');await page.press('#command','Enter')
await page.waitForFunction(()=>window.__SW_M0__.records().at(-1)?.status==='SUCCEEDED'&&window.__SW_M0__.snapshot().selectedId==='SW_BIO_AERATION_001',undefined,{timeout:6000})
await capture('agent-focused.png')
await page.fill('#command','回到总览');await page.press('#command','Enter')
await page.waitForFunction(()=>window.__SW_M0__.records().at(-1)?.status==='SUCCEEDED'&&window.__SW_M0__.snapshot().selectedId===null,undefined,{timeout:6000})
await capture('agent-reset-overview.png')
await view(1366,768);await capture('layout-1366.png')
await view()
for(const [variant,url] of [['before','/qa-assets/m0-before.glb'],['after','/models/aeration-tank.glb']]){
  await page.evaluate(url=>window.__SW_M0__.load(url),url)
  await page.evaluate(()=>{window.__SW_M0__.setWaterPhase(0);window.__SW_M0__.setWater(false);window.__SW_M0__.setView([10,31,28],[0,-2.3,0])});await capture('material-'+variant+'.png')
  await page.evaluate(()=>{window.__SW_M0__.setWater(true);window.__SW_M0__.setView([-9,5.7,15],[-8,.5,2])});await capture('water-'+variant+'.png')
}
await page.evaluate(()=>window.__SW_M0__.setView([42,39,53],[0,-.5,0]));await capture('overview-old-camera.png')
await page.evaluate(()=>window.__SW_M0__.send('回到总览'));await capture('overview-new-camera.png')
console.log(JSON.stringify({fixedBuild:identity.build_id,finalScreenshots:screenshotRecords.length,associationChecks:'all passed'}))
