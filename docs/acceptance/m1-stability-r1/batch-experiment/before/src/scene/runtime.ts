import { reactive } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { DeviceRegistry, DEVICE_ID } from './deviceRegistry'
import { CameraController, SceneError } from './cameraController'
import { fitBox, projectedBounds } from './framing'
import { LoopLifecycle } from './loopLifecycle'
import { FrameSample } from './frameSample'
import { ownership,diagnosticControls,traceInput,diagnosticsEnabled } from '../diagnostics/stability'

export function createScene(host: HTMLElement) {
  const state = reactive({ status: 'loading', error: '', selectedId: null as string | null, waterVisible: true, loadMs: 0, firstRenderMs: 0, triangles: 0, calls: 0, textures: 0, frameMs: 0 })
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#d8e3e6')
  ownership.renderers++;ownership.rendererCreated++
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  // M1 caps only the 3D drawing buffer; DOM text retains the browser's native DPR.
  let renderingRatio = 1
  renderer.setPixelRatio(renderingRatio)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.shadowMap.autoUpdate = false
  host.appendChild(renderer.domElement)
  const camera = new THREE.PerspectiveCamera(40, 1, 0.15, 400)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = false
  controls.minDistance = 5
  controls.maxDistance = 160
  controls.maxPolarAngle = Math.PI * 0.48
  const defaultPosition = new THREE.Vector3(42, 39, 53)
  const defaultTarget = new THREE.Vector3(0, -0.5, 0)
  camera.position.copy(defaultPosition); controls.target.copy(defaultTarget); controls.update()
  const sun = new THREE.DirectionalLight(0xfff4df, 2.6)
  sun.position.set(-28, 50, 20); sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 40, bottom: -40, near: 0.5, far: 130 })
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.04
  scene.add(sun, new THREE.HemisphereLight(0xe4f0ff, 0x7b8472, 0.9))
  const registry = new DeviceRegistry()
  let root: THREE.Object3D | null = null
  const environmentTargets = new Set<THREE.WebGLRenderTarget>()
  let water: THREE.Object3D | null = null
  let outline: THREE.LineSegments | null = null
  let selectionEpoch = 0, overviewMode = true
  let waterPhaseMs: number | null = null
  let loadedModelUrl = '', loadedModelSha256 = ''
  let disposed = false, generation = 0, frame = 0, last = performance.now(), lastStats = 0
  let frameSample:FrameSample|null=null
  let callbackCount=0,diagnosticRenderCalls=0,diagnosticRenderCpuMs=0,diagnosticRenderMaxMs=0
  const onMeasurementVisibility=()=>{
    const visible=document.visibilityState==='visible'
    frameSample?.visibility(performance.now(),document.visibilityState)
    if(!visible)motion.cancel('页面隐藏，镜头动作已取消','PAGE_HIDDEN')
    loop.sync(visible&&!diagnosticControls.scenePaused)
  }
  document.addEventListener('visibilitychange',onMeasurementVisibility);ownership.listeners++
  let timeoutMs = 5000
  let loadStarted = 0
  const motion = new CameraController(camera, controls, () => registry.selectedId)
  const onUserControl = () => { traceInput('user_camera_control'); overviewMode = false; motion.cancel('用户正在手动操作相机') }
  controls.addEventListener('start', onUserControl);ownership.listeners++
  function select(id: string | null) {
    selectionEpoch++
    if (id === registry.selectedId && (id === null || outline)) return
    registry.select(id); state.selectedId = registry.selectedId
    if (outline) { scene.remove(outline); outline.geometry.dispose(); (outline.material as THREE.Material).dispose(); outline = null }
    if (id) {
      const device = registry.get(id)
      const coping = device.getObjectByName('STRUCT_Coping')
      const box = new THREE.Box3().setFromObject(coping ?? device, true)
      const y = box.max.y + .055, length = 1.6, positions: number[] = []
      for (const [x,sx] of [[box.min.x-.08,1],[box.max.x+.08,-1]]) for (const [z,sz] of [[box.min.z-.08,1],[box.max.z+.08,-1]]) {
        positions.push(x!,y,z!,x!+sx!*length,y,z!, x!,y,z!,x!,y,z!+sz!*length)
      }
      const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions,3))
      outline = new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#16b5ce',depthTest:true,transparent:true,opacity:.95}))
      outline.name = 'SW_SELECTION_COPING_CORNERS'; outline.raycast = () => {}
      scene.add(outline)
    }
  }
  const pointer = new THREE.Vector2(), raycaster = new THREE.Raycaster()
  let pointerStart: { x: number; y: number } | null = null
  const pointerDown = (event: PointerEvent) => { pointerStart = { x: event.clientX, y: event.clientY } }
  const pointerUp = (event: PointerEvent) => {
    if (!pointerStart || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5 || state.status !== 'ready' || !root) return
    pointerStart = null
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    const hit = raycaster.intersectObject(root, true).find(hit => {
      for (let p: THREE.Object3D | null = hit.object; p; p = p.parent) if (!p.visible) return false
      return true
    })
    select(hit ? registry.resolve(hit.object) : null)
  }
  renderer.domElement.addEventListener('pointerdown', pointerDown)
  renderer.domElement.addEventListener('pointerup', pointerUp);ownership.listeners+=2
  let lastWidth=0,lastHeight=0,lastRatio=0
  const resize = new ResizeObserver(() => {
    const w = host.clientWidth, h = host.clientHeight
    if (!w || !h || (w===lastWidth&&h===lastHeight&&lastRatio===renderingRatio)) return
    lastWidth=w;lastHeight=h;lastRatio=renderingRatio
    renderer.setPixelRatio(renderingRatio)
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix()
    updateOverview(overviewMode && !motion.busy)
  })
  resize.observe(host);ownership.observers++
  function disposeRoot(object: THREE.Object3D) {
    const textures = new Set<THREE.Texture>()
    object.traverse(node => { if (node instanceof THREE.Mesh) {
      node.geometry.dispose()
      for (const mat of Array.isArray(node.material) ? node.material : [node.material]) {
        for (const value of Object.values(mat)) if (value instanceof THREE.Texture) textures.add(value)
        mat.dispose()
      }
    } })
    textures.forEach(t => { t.dispose(); const image = t.source?.data; if (image instanceof ImageBitmap) image.close() })
  }
  async function load(modelUrl = '/models/aeration-tank.glb') {
    const ticket = ++generation
    motion.cancel('正在重新加载资产'); select(null)
    state.status = 'loading'; state.error = ''; registry.clear(); state.selectedId = null
    if (root) { scene.remove(root); disposeRoot(root); root = null; water = null }
    const started = performance.now()
    loadStarted = started; state.firstRenderMs = 0
    loadedModelUrl = ''; loadedModelSha256 = ''
    try {
      const response = await fetch(modelUrl, { cache: 'no-store', headers: { Accept: 'model/gltf-binary,application/octet-stream' } })
      if (!response.ok) { if (response.status === 404) state.status = 'missing'; throw new Error(response.status === 404 ? '资产尚未生成' : 'GLB 请求失败：' + response.status) }
      const data = await response.arrayBuffer()
      const digest = await crypto.subtle.digest('SHA-256',data)
      const responseSha256 = Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')
      if (new DataView(data).getUint32(0, true) !== 0x46546c67) throw new SceneError('ASSET_INVALID', '响应不是有效的 GLB 文件')
      const gltf = await new GLTFLoader().parseAsync(data, '/models/')
      if (disposed || ticket !== generation) { disposeRoot(gltf.scene); return }
      registry.register(gltf.scene)
      const newWater = gltf.scene.getObjectByName('WATER_Surface')
      if (!newWater) throw new Error('ASSET_INVALID: 缺少独立水面')
      gltf.scene.traverse(node => { if (node instanceof THREE.Mesh) { node.castShadow = node !== newWater; node.receiveShadow = true; for (const mat of Array.isArray(node.material) ? node.material : [node.material]) { if ('map' in mat && mat.map instanceof THREE.Texture) mat.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()) } } })
      if (!scene.environment) {
        const hdr = await new HDRLoader().loadAsync('/environments/daylight_2k.hdr')
        const pmrem = new THREE.PMREMGenerator(renderer)
        const target = pmrem.fromEquirectangular(hdr)
        environmentTargets.add(target)
        scene.environment = target.texture; scene.environmentIntensity = 0.48
        hdr.dispose(); pmrem.dispose()
      }
      if (disposed || ticket !== generation) { disposeRoot(gltf.scene); return }
      if (root) { scene.remove(root); disposeRoot(root) }
      root = gltf.scene; water = newWater; water.visible = state.waterVisible
      scene.add(root); renderer.shadowMap.needsUpdate = true
      loadedModelUrl = new URL(modelUrl,location.href).href; loadedModelSha256 = responseSha256
      overviewMode = true; updateOverview(true)
      state.loadMs = performance.now() - started; state.status = 'ready'
    } catch (error) {
      if (ticket !== generation || disposed) return
      registry.clear(); state.selectedId = null
      if (state.status !== 'missing') state.status = 'error'
      state.error = String(error instanceof Error ? error.message : error)
    }
  }
  function setWater(visible: boolean) { state.waterVisible = visible; if (water) water.visible = visible; renderer.shadowMap.needsUpdate = true }
  function updateOverview(apply: boolean) {
    const site = root?.getObjectByName('SW_SITE_CONTEXT')
    if (!site) return
    const framing = fitBox(new THREE.Box3().setFromObject(site,true),camera,new THREE.Vector3(.52,.96,1),.87)
    defaultPosition.copy(framing.position); defaultTarget.copy(framing.target)
    if (apply) { camera.position.copy(defaultPosition); controls.target.copy(defaultTarget); camera.zoom = 1; camera.updateProjectionMatrix(); controls.update() }
  }
  function requireReady() {
    if (state.status === 'error' || state.status === 'missing') throw new SceneError('LOAD_FAILED', state.error || '资产加载失败')
    if (state.status !== 'ready') throw new SceneError('SCENE_NOT_READY', '三维场景尚未就绪')
  }
  async function focusDevice(id: string, signal?: AbortSignal) {
    requireReady()
    overviewMode = false
    const framing = fitBox(registry.bounds(id),camera,new THREE.Vector3(.12,1.02,1),.90)
    select(id)
    const epoch = selectionEpoch
    try { return await motion.move(framing.position,framing.target,id,signal,timeoutMs) }
    catch (error) { if (epoch === selectionEpoch) select(null); throw error }
  }
  async function resetView(signal?: AbortSignal) { requireReady(); updateOverview(false); select(null); const result = await motion.move(defaultPosition, defaultTarget, null, signal, timeoutMs, 1); overviewMode = true; return result }
  function setView(position: number[], target: number[]) { overviewMode = false; motion.cancel('检查视角接管相机'); camera.position.fromArray(position); controls.target.fromArray(target); controls.update() }
  async function measurePerformance(durationSeconds = 18) {
    requireReady(); motion.cancel('开始性能测试'); select(null)
    const started=performance.now(),moves=Math.max(20,Math.ceil(durationSeconds/.9))
    try {
      for(let step=0;step<moves+2;step++){
        if(step===2)beginFrameSample()
        const angle=.67+step*Math.PI*2/moves
        await motion.move(new THREE.Vector3(Math.sin(angle)*62,36,Math.cos(angle)*62),defaultTarget,null,undefined,5000)
      }
      return {...endFrameSample(),total_duration_with_warmup_ms:performance.now()-started,warmup_moves:2,camera_moving:true,camera_owner:'CameraController'}
    } catch(error){return {...endFrameSample(),workload_error:String(error),warmup_moves:2}}
  }
  function beginFrameSample() {
    requireReady()
    if(frameSample)throw new SceneError('MEASUREMENT_BUSY','已有帧采样正在进行')
    frameSample=new FrameSample(performance.now(),document.visibilityState==='visible')
    return snapshot()
  }
  function endFrameSample() {
    if(!frameSample)throw new SceneError('MEASUREMENT_NOT_STARTED','尚未开始帧采样')
    const sample=frameSample;frameSample=null
    return {measured_at:new Date().toISOString(),...sample.finish(performance.now()),...snapshot()}
  }
  function lightDiagnostics(){return {pageAgeMs:performance.now(),visible:document.visibilityState,cameraBusy:motion.busy,frame,callbackCount,renderCpuDiagnostics:{enabled:diagnosticsEnabled,calls:diagnosticRenderCalls,totalMs:diagnosticRenderCpuMs,maxMs:diagnosticRenderMaxMs,meaning:'CPU wall duration of renderer.render, not GPU time'},loop:{active:loop.active,starts:loop.starts,stops:loop.stops},renderer:{...ownership},geometryCount:renderer.info.memory.geometries,textureCount:renderer.info.memory.textures,programCount:renderer.info.programs?.length??null,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,rendererDpr:renderer.getPixelRatio(),nativeDpr:devicePixelRatio,canvas:{width:host.clientWidth,height:host.clientHeight},drawingBuffer:{width:renderer.domElement.width,height:renderer.domElement.height},loadGeneration:generation}}
  function snapshot() { return { ...state, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, camera: camera.position.toArray(), target: controls.target.toArray(), defaultCamera:defaultPosition.toArray(),defaultTarget:defaultTarget.toArray(), zoom: camera.zoom,fov:camera.fov, frame, cameraBusy: motion.busy, visible: document.visibilityState,activeRenderLoops:loop.active?1:0,loadGeneration:generation, rendererDpr: renderer.getPixelRatio(), nativeDpr:devicePixelRatio,drawingBuffer:{width:renderer.domElement.width,height:renderer.domElement.height},canvas: { width: host.clientWidth, height: host.clientHeight },loadedModelUrl,loadedModelSha256,waterPhaseMs,lighting:{exposure:renderer.toneMappingExposure,sunIntensity:sun.intensity,sunPosition:sun.position.toArray(),environmentIntensity:scene.environmentIntensity,shadowMapSize:sun.shadow.mapSize.toArray()},selectionEffects:scene.children.filter(o=>o.name==='SW_SELECTION_COPING_CORNERS').length,sceneGeometryCount:renderer.info.memory.geometries,siteFraming:root?.getObjectByName('SW_SITE_CONTEXT') ? projectedBounds(new THREE.Box3().setFromObject(root.getObjectByName('SW_SITE_CONTEXT')!,true),camera):null,assetStage: root?.getObjectByName(DEVICE_ID)?.userData.asset_stage, bounds: state.status === 'ready' ? (() => { try { const b = registry.bounds(DEVICE_ID); return { min: b.min.toArray(), max: b.max.toArray() } } catch { return null } })() : null } }
  const tick = (now:number) => {
    if(disposed||document.visibilityState!=='visible'||diagnosticControls.scenePaused){onMeasurementVisibility();return}
    callbackCount++;frameSample?.callback(now)
    const delta = now - last; last = now
    motion.update(now)
    if (water instanceof THREE.Mesh && water.material instanceof THREE.MeshStandardMaterial && water.material.normalMap) {
      const phase = waterPhaseMs ?? now
      water.material.normalMap.offset.set(phase * 0.0000013, phase * 0.0000009)
    }
    controls.update()
    const cpuStart=diagnosticsEnabled?performance.now():0
    renderer.render(scene, camera); frame++
    if(diagnosticsEnabled){const elapsed=performance.now()-cpuStart;diagnosticRenderCalls++;diagnosticRenderCpuMs+=elapsed;diagnosticRenderMaxMs=Math.max(diagnosticRenderMaxMs,elapsed)}
    frameSample?.submitted(renderer.info.render.calls)
    if (state.status === 'ready' && state.firstRenderMs === 0) state.firstRenderMs = performance.now() - loadStarted
    motion.afterRender(frame)
    if (now - lastStats > 750) { state.calls = renderer.info.render.calls; state.triangles = renderer.info.render.triangles; state.textures = renderer.info.memory.textures; state.frameMs = delta; lastStats = now }
  }
  const loop=new LoopLifecycle(()=>{last=performance.now();renderer.setAnimationLoop(tick)},()=>renderer.setAnimationLoop(null))
  loop.sync(document.visibilityState==='visible')
  function dispose() { if(disposed)return;loop.dispose();ownership.renderers--;ownership.rendererDisposed++;ownership.observers--;ownership.listeners-=4; document.removeEventListener('visibilitychange',onMeasurementVisibility); disposed = true; generation++; motion.cancel('场景已卸载'); resize.disconnect(); controls.removeEventListener('start', onUserControl); controls.dispose(); renderer.domElement.removeEventListener('pointerdown',pointerDown); renderer.domElement.removeEventListener('pointerup',pointerUp); renderer.setAnimationLoop(null); if (root) disposeRoot(root); outline?.geometry.dispose();if(outline)(outline.material as THREE.Material).dispose(); environmentTargets.forEach(t=>t.dispose()); sun.shadow.map?.dispose(); renderer.dispose(); renderer.domElement.remove() }
  return { lightDiagnostics,syncVisibility:onMeasurementVisibility, state, load, setWater, snapshot, dispose, registry, scene, camera, controls, renderer, defaultPosition, defaultTarget, focusDevice, resetView, setView, select, motion, measurePerformance,setWaterPhase:(ms:number|null)=>{waterPhaseMs=ms},setPixelRatio:(dpr:number)=>{renderingRatio=dpr;renderer.setPixelRatio(dpr)}, setTimeoutMs: (ms: number) => { timeoutMs = ms }, beginFrameSample,endFrameSample,getRoot: () => root }
}

export type SceneRuntime = ReturnType<typeof createScene>
