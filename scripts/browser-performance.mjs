// Run after browser-acceptance, with the page visible. Each run records actual frame deltas.
const entry=(await listTaskSpaces()).find(s=>s.name==='SmartWater M0 implementation')
const task=!entry?await taskSpace('SmartWater M0 implementation'):entry.ownership==='user'?await claimTaskSpace(entry.id):entry.ownership==='agentDelegatedToUser'?await takeOverTaskSpace(entry.id):await taskSpace(entry.id)
const page=(await task.pages())[0]??await task.adopt((await task.tabs())[0].page)
const fs=await import('node:fs/promises')
await page.waitForFunction(()=>window.__SW_M0__?.snapshot().status==='ready',undefined,{timeout:20000})
const dpr=await page.evaluate(()=>Number(new URL(location.href).searchParams.get('perfDpr'))||1)
const before=await page.evaluate(()=>new URL(location.href).searchParams.get('perfAsset')==='before')
if(before)await page.evaluate(()=>window.__SW_M0__.load('/qa-assets/m0-before.glb'))
await page.cdp('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:dpr,mobile:false})
await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
const identity=await page.evaluate(()=>fetch('/build-id.json',{cache:'no-store'}).then(r=>r.json()))
await page.evaluate(dpr=>{window.__SW_M0__.setPixelRatio(dpr);window.__SW_M0__.setWaterPhase(null)},dpr)
await page.evaluate(()=>window.__SW_M0__.send('回到总览'))
await page.click('#command',{label:'Focusing performance test page'})
const conditions=await page.evaluate(()=>{
  const gl=document.querySelector('canvas').getContext('webgl2')
  const debug=gl.getExtension('WEBGL_debug_renderer_info')
  return {url:location.href,userAgent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),webglVersion:gl.getParameter(gl.VERSION),pageVisibility:document.visibilityState,documentHasFocus:document.hasFocus(),notes:'Fixed r1 production build; warmed resources; 61 second target after two warmup moves; no screenshots or page polling during sampling; shadows and lights unchanged.'}
})
await page.evaluate(()=>{
  window.__SW_PERF_RESULT__=null;window.__SW_PERF_ERROR__=null
  void window.__SW_M0__.measurePerformance(61).then(result=>{window.__SW_PERF_RESULT__=result}).catch(error=>{window.__SW_PERF_ERROR__=String(error)})
  return 'Measurement running in the page'
})
// Passive Node timer avoids injecting polling work into the page; it does not decide success.
for(let i=0;i<3;i++){await new Promise(resolve=>setTimeout(resolve,23000));console.log('Passive sample wait '+(i+1)+'/3')}
const measurements=await page.evaluate(()=>{if(window.__SW_PERF_ERROR__)throw new Error(window.__SW_PERF_ERROR__);if(!window.__SW_PERF_RESULT__)throw new Error('Measurement is still running; no result fabricated');return window.__SW_PERF_RESULT__})
if(measurements.loadedModelSha256!==(before?identity.baseline_glb_sha256:identity.public_glb_sha256)||measurements.sampled_duration_ms<60000)throw new Error('Performance identity / duration mismatch')
const report={build_id:identity.build_id,conditions,measurements,target:{minimum_fps:30,interpretation:'95th percentile frame time <=33.34ms, with >=30 average FPS',passed:measurements.average_fps>=30&&measurements.p95_frame_ms<=33.34&&measurements.page_visible_throughout}}
await fs.writeFile('/Users/leizhenyang/projects/smartwater-ai/docs/acceptance/m0-visual-r1/performance-'+(before?'old-glb-':'')+'dpr'+dpr+'.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({conditions,...Object.fromEntries(Object.entries(measurements).filter(([k])=>k!=='frame_times_ms')),target:report.target}))
await page.evaluate(()=>window.__SW_M0__.send('回到总览'))
