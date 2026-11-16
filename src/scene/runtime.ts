import { reactive } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { DeviceRegistry, DEVICE_ID } from './deviceRegistry'
import { CameraController, SceneError } from './cameraController'
import { fitBox, projectedBounds } from './framing'
import { LoopLifecycle } from './loopLifecycle'
import { findUnit,UNITS } from './units'
import { AssetCache } from './assetCache'
import { RoofPresentation } from './roofPresentation'
import {createPlantSite,PLANT_LAYOUT,FOUR_LAYOUT} from './plantSite'
import { shouldKeepRendering,type RenderMode } from './renderPolicy'
import { FrameSample } from './frameSample'
import { ownership,diagnosticControls,traceInput,diagnosticsEnabled } from '../diagnostics/stability'

export type SceneOptions={deviceId?:string;modelUrl?:string}
export function createScene(host: HTMLElement,options:SceneOptions={}) {
  const state = reactive({ status: 'loading', error: '', selectedId: null as string | null, waterVisible: true, loadMs: 0, firstRenderMs: 0, triangles: 0, assetTriangles:0, calls: 0, textures: 0, frameMs: 0, renderMode:'interactive' as RenderMode,viewMode:'unit' as 'unit'|'plant'|'plant4', loadedIds:[] as string[], deviceStates:{} as Record<string,{status:string;error:string;loadMs:number;sha256:string}>,waterStates:{} as Record<string,boolean>,roofStates:{} as Record<string,boolean>,deviceId:options.deviceId??DEVICE_ID })
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
  let configuredModelUrl=options.modelUrl??'/models/aeration-tank.glb'
  let root: THREE.Object3D | null = null
  const environmentTargets = new Set<THREE.WebGLRenderTarget>()
  const waters=new Map<string,THREE.Object3D>(),roofs=new Map<string,THREE.Object3D>()
  const roofPresentation=new RoofPresentation()
  let sharedSite:ReturnType<typeof createPlantSite>|undefined
  const labels=new Map<string,{element:HTMLElement;point:THREE.Vector3}>()
  let environmentPromise:Promise<void>|undefined
  type Asset={scene:THREE.Group;device:THREE.Object3D;container:THREE.Object3D;site:THREE.Object3D;water?:THREE.Object3D;roof?:THREE.Object3D;id:string;sha256:string;url:string;loadMs:number}
  const assets=new AssetCache<Asset>(readAsset,asset=>{asset.scene.add(asset.container,asset.site);disposeRoot(asset.scene)})
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
    if(!visible){userInteracting=false;motion.cancel('页面隐藏，镜头动作已取消','PAGE_HIDDEN')}
    loop.sync(visible&&!diagnosticControls.scenePaused)
  }
  document.addEventListener('visibilitychange',onMeasurementVisibility);ownership.listeners++
  let userInteracting=false,frozenWaterPhase=0
  function invalidate(){loop.sync(!disposed&&document.visibilityState==='visible'&&!diagnosticControls.scenePaused)}
  function moveCamera(...args:Parameters<CameraController['move']>){const result=motion.move(...args);invalidate();return result}
  function setRenderMode(mode:RenderMode){state.renderMode=mode;frozenWaterPhase=performance.now();invalidate()}
  let timeoutMs = 5000
  let loadStarted = 0
  const motion = new CameraController(camera, controls, () => registry.selectedId)
  const onUserControl = () => { userInteracting=true;invalidate();traceInput('user_camera_control'); overviewMode = false; motion.cancel('用户正在手动操作相机') }
  const onControlEnd=()=>{userInteracting=false;invalidate()}
  controls.addEventListener('start', onUserControl);controls.addEventListener('end',onControlEnd);controls.addEventListener('change',invalidate);ownership.listeners+=3
  function select(id: string | null) {
    invalidate();selectionEpoch++
    roofPresentation.select(id&&roofs.has(id)?id:null);applyRoofs()
    if (id === registry.selectedId && (id === null || outline)) return
    registry.select(id); state.selectedId = registry.selectedId
    state.waterVisible=state.waterStates[id??state.deviceId]??true
    if (outline) { scene.remove(outline); outline.geometry.dispose(); (outline.material as THREE.Material).dispose(); outline = null }
    if (id) {
      const device = registry.get(id)
      const coping = device.getObjectByName('STRUCT_Coping')
      const box = new THREE.Box3().setFromObject(coping ?? device, true)
      const y = box.max.y + .055, length = Math.min(1.6,box.getSize(new THREE.Vector3()).x*.17,box.getSize(new THREE.Vector3()).z*.17), positions: number[] = []
      if(device.userData.geometry_form==='circular'){
        const cx=(box.min.x+box.max.x)/2,cz=(box.min.z+box.max.z)/2,r=(box.max.x-box.min.x)/2+.06
        for(let quadrant=0;quadrant<4;quadrant++)for(let i=0;i<10;i++){
          const a=quadrant*Math.PI/2-.15+i*.03,b=a+.03
          positions.push(cx+Math.cos(a)*r,y,cz+Math.sin(a)*r,cx+Math.cos(b)*r,y,cz+Math.sin(b)*r)
        }
      }else for (const [x,sx] of [[box.min.x-.08,1],[box.max.x+.08,-1]]) for (const [z,sz] of [[box.min.z-.08,1],[box.max.z+.08,-1]]) {
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
    selectFromUser(hit ? registry.resolve(hit.object) : null)
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
    updateOverview(overviewMode && !motion.busy);invalidate()
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
  async function readAsset(modelUrl:string):Promise<Asset>{
    const started=performance.now(),response=await fetch(modelUrl,{cache:'no-store',headers:{Accept:'model/gltf-binary,application/octet-stream'}})
    if(!response.ok)throw new SceneError('LOAD_FAILED',`GLB 请求失败：${response.status}`)
    const data=await response.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',data)
    if(data.byteLength<20||new DataView(data).getUint32(0,true)!==0x46546c67)throw new SceneError('ASSET_INVALID','响应不是有效GLB')
    const gltf=await new GLTFLoader().parseAsync(data,'/models/')
    try{
      const devices:THREE.Object3D[]=[];gltf.scene.traverse(node=>{if(node.userData.device_id)devices.push(node)})
      const device=devices[0],unit=device&&findUnit(device.userData.device_id),site=gltf.scene.getObjectByName('SW_SITE_CONTEXT'),water=device?.getObjectByName('WATER_Surface'),container=unit&&gltf.scene.getObjectByName(unit.assetRootNode),roof=container?.getObjectByName('BUILDING_Roof')
      if(devices.length!==1||!device||!unit||!site||!container||(unit.water&&!water)||(unit.roof&&!roof)||device.name!==unit.mechanicalNode)throw new SceneError('ASSET_INVALID','设备、资产容器或声明能力节点不完整')
      gltf.scene.traverse(node=>{if(node instanceof THREE.Mesh){let underWater=false;for(let p:THREE.Object3D|null=node;p;p=p.parent)if(p===water)underWater=true;node.castShadow=!underWater;node.receiveShadow=true;for(const mat of Array.isArray(node.material)?node.material:[node.material])if('map' in mat&&mat.map instanceof THREE.Texture)mat.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy())}})
      return {scene:gltf.scene,device,container,site,water,roof,id:device.userData.device_id,sha256:[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join(''),url:new URL(modelUrl,location.href).href,loadMs:performance.now()-started}
    }catch(error){disposeRoot(gltf.scene);throw error}
  }
  function ensureEnvironment(){
    return environmentPromise??=new HDRLoader().loadAsync('/environments/daylight_2k.hdr').then(hdr=>{
      if(disposed){hdr.dispose();return}
      const pmrem=new THREE.PMREMGenerator(renderer),target=pmrem.fromEquirectangular(hdr)
      environmentTargets.add(target);scene.environment=target.texture;scene.environmentIntensity=.48;hdr.dispose();pmrem.dispose()
    }).catch(error=>{environmentPromise=undefined;throw error})
  }
  function clearView(){
    if(root){scene.remove(root);root.clear();root=null}
    sharedSite?.dispose();sharedSite=undefined;waters.clear();roofs.clear();state.roofStates={}
    labels.forEach(label=>label.element.remove());labels.clear()
  }
  function addLabel(id:string){
    const device=registry.get(id),box=registry.bounds(id),point=box.getCenter(new THREE.Vector3());point.y=box.max.y+2.1
    const element=document.createElement('button');element.className='plant-device-label selectable';element.dataset.deviceLabel=id;element.textContent=findUnit(id)!.name;element.type='button';element.onclick=()=>selectFromUser(id)
    host.appendChild(element);labels.set(id,{element,point})
  }
  function drawLabels(){for(const [id,{element,point}] of labels){const p=point.clone().project(camera);element.style.transform=`translate(-50%,-100%) translate(${(p.x+1)*host.clientWidth/2}px,${(1-p.y)*host.clientHeight/2}px)`;element.style.display=p.z>1||p.z< -1?'none':'';element.dataset.selected=String(state.selectedId===id)}}
  async function loadView(mode:'unit'|'plant'|'plant4',id=state.deviceId,overrides:Record<string,string>={}){
    const ticket=++generation,started=performance.now();overviewMode=true;motion.cancel('视图模式已切换');select(null);registry.clear();clearView()
    state.viewMode=mode;if(mode!=='unit')state.renderMode='interactive';state.deviceId=id;state.loadedIds=[];state.deviceStates={};state.assetTriangles=0;state.firstRenderMs=0;state.error='';state.status='loading';loadStarted=started;loadedModelUrl='';loadedModelSha256=''
    const viewRoot=new THREE.Group();viewRoot.name='SW_ACTIVE_VIEW';root=viewRoot;scene.add(viewRoot)
    if(mode!=='unit'){sharedSite=createPlantSite(mode==='plant4'?FOUR_LAYOUT:PLANT_LAYOUT);viewRoot.add(sharedSite.root);if(mode==='plant4'){const element=document.createElement('div');element.className='plant-device-label process-schematic-label';element.textContent='空气关系 · 工艺示意 / 非连接管线';host.appendChild(element);labels.set('SCHEMATIC',{element,point:new THREE.Vector3(-23,.3,-15.5)})}}
    const units=mode==='unit'?[findUnit(id)!]:mode==='plant'?UNITS.filter(unit=>unit.water):[...UNITS]
    await Promise.all(units.map(async unit=>{
      state.deviceStates[unit.id]={status:'loading',error:'',loadMs:0,sha256:''}
      try{
        const [asset]=await Promise.all([assets.get(overrides[unit.id]??(mode==='unit'?configuredModelUrl:unit.url)),ensureEnvironment()])
        if(disposed||ticket!==generation)return
        if(asset.id!==unit.id)throw new SceneError('ASSET_INVALID','资产设备ID与请求不符')
        const placement=mode!=='unit'?(mode==='plant4'?FOUR_LAYOUT:PLANT_LAYOUT).placements.find(p=>p.deviceId===unit.id):undefined
        asset.container.position.fromArray(placement?.position??[0,0,0]);asset.container.rotation.set(0,placement?.yaw??0,0);asset.container.scale.set(1,1,1)
        viewRoot.add(asset.container);if(mode==='unit')viewRoot.add(asset.site)
        if(asset.water){waters.set(unit.id,asset.water);asset.water.visible=state.waterStates[unit.id]??true;state.waterStates[unit.id]=asset.water.visible}
        if(asset.roof){roofs.set(unit.id,asset.roof);applyRoofs()}
        state.loadedIds.push(unit.id);state.deviceStates[unit.id]={status:'ready',error:'',loadMs:asset.loadMs,sha256:asset.sha256}
        const previousSelection=registry.selectedId;registry.register(viewRoot,state.loadedIds);if(previousSelection)registry.select(previousSelection);viewRoot.updateMatrixWorld(true)
        state.assetTriangles=0;viewRoot.traverse(node=>{if(node instanceof THREE.Mesh)state.assetTriangles+=(node.geometry.index?.count??node.geometry.attributes.position!.count)/3})
        if(mode!=='unit'){
          addLabel(unit.id)
          const greenery=asset.site.getObjectByName('SITE_PlantingBeds')??asset.site.getObjectByName('SITE_GreenStrip')
          if(greenery instanceof THREE.Mesh)sharedSite?.root.traverse(n=>{if(n instanceof THREE.Mesh&&n.name==='SITE_ReusedGrassMaterialStrip')n.material=greenery.material})
        }
        state.status='ready';state.waterVisible=state.waterStates[state.selectedId??state.deviceId]??true;state.loadMs=performance.now()-started
        loadedModelUrl=asset.url;loadedModelSha256=asset.sha256;updateOverview(overviewMode&&!motion.busy);renderer.shadowMap.needsUpdate=true;invalidate()
      }catch(error){if(disposed||ticket!==generation)return;state.deviceStates[unit.id]={status:'error',error:String(error instanceof Error?error.message:error),loadMs:performance.now()-started,sha256:''}}
    }))
    if(disposed||ticket!==generation)return
    state.error=Object.entries(state.deviceStates).filter(([,s])=>s.status==='error').map(([id,s])=>`${findUnit(id)?.name}：${s.error}`).join('；')
    if(!state.loadedIds.length)state.status=state.error.includes('404')?'missing':'error'
    state.loadMs=performance.now()-started;invalidate()
  }
  async function load(modelUrl?:string){return loadView(state.viewMode,state.deviceId,modelUrl?{[state.deviceId]:modelUrl}:{})}
  function setWater(visible:boolean,id=state.viewMode!=='unit'?state.selectedId:state.deviceId){
    if(!id)throw new SceneError('NO_SELECTION','请先选择需要切换水面的设备')
    const water=waters.get(id);if(!water)throw new SceneError('DEVICE_NOT_READY','目标水面尚未就绪')
    state.waterStates[id]=visible;water.visible=visible;if(id===(state.selectedId??state.deviceId))state.waterVisible=visible;renderer.shadowMap.needsUpdate=true;invalidate()
  }
  function applyRoofs(){for(const [id,roof] of roofs){roof.visible=roofPresentation.visible(id);state.roofStates[id]=roof.visible}renderer.shadowMap.needsUpdate=true}
  function setRoof(visible:boolean,id=state.selectedId??state.deviceId){if(!roofs.has(id))throw new SceneError('NO_ROOF','该设备没有独立屋顶');motion.cancel('用户切换屋顶显示');roofPresentation.set(id,visible);applyRoofs();invalidate()}
  function visibilityProof(id:string){
    const device=registry.get(id),objects=[device,device.getObjectByName('MOTOR_Housing')].filter(Boolean) as THREE.Object3D[]
    return objects.map(object=>{const target=new THREE.Box3().setFromObject(object,true).getCenter(new THREE.Vector3()),p=target.clone().project(camera);raycaster.setFromCamera(new THREE.Vector2(p.x,p.y),camera);const hit=root&&raycaster.intersectObject(root,true).find(hit=>{for(let n:THREE.Object3D|null=hit.object;n;n=n.parent)if(!n.visible)return false;return true});const hitId=hit?registry.resolve(hit.object):null;return {target:object.name,point:target.toArray(),firstHit:hit?.object.name??null,hitDeviceId:hitId,onScreen:Math.abs(p.x)<=1&&Math.abs(p.y)<=1&&p.z<=1,deviceVisible:hitId===id}})
  }
  function registration(id:string){const unit=findUnit(id);if(!unit)throw new SceneError('DEVICE_NOT_FOUND','设备未定义');return {...unit,modelState:state.deviceStates[id]?.status??'unloaded',assetRootNode:unit.assetRootNode,mechanicalNode:state.loadedIds.includes(id)?registry.get(id).name:unit.mechanicalNode}}
  function updateOverview(apply: boolean) {
    const site = root?.getObjectByName('SW_SITE_CONTEXT')
    if (!site) return
    const overviewBox=new THREE.Box3().setFromObject(state.viewMode==='plant4'?root!:site,true)
    if(state.viewMode==='plant4')overviewBox.max.y+=1
    const framing = fitBox(overviewBox,camera,state.viewMode!=='unit'?new THREE.Vector3().fromArray((state.viewMode==='plant4'?FOUR_LAYOUT:PLANT_LAYOUT).overviewDirection):new THREE.Vector3(.52,.96,1),state.viewMode!=='unit'?(state.viewMode==='plant4'?FOUR_LAYOUT:PLANT_LAYOUT).overviewFill:.87)
    defaultPosition.copy(framing.position); defaultTarget.copy(framing.target)
    if (apply) { camera.position.copy(defaultPosition); controls.target.copy(defaultTarget); camera.zoom = 1; camera.updateProjectionMatrix(); controls.update() }
  }
  function requireReady() {
    if (state.status === 'error' || state.status === 'missing') throw new SceneError('LOAD_FAILED', state.error || '资产加载失败')
    if (state.status !== 'ready') throw new SceneError('SCENE_NOT_READY', '三维场景尚未就绪')
  }
  async function focusDevice(id: string, signal?: AbortSignal) {
    requireReady()
    if(!state.loadedIds.includes(id))throw new SceneError(state.deviceStates[id]?.status==='error'?'LOAD_FAILED':'DEVICE_NOT_FOUND',state.deviceStates[id]?.error||'目标设备未加载')
    overviewMode = false
    const framing = fitBox(registry.bounds(id),camera,new THREE.Vector3(.12,1.02,1),.90)
    select(id)
    const epoch = selectionEpoch
    try {const result=await moveCamera(framing.position,framing.target,id,signal,timeoutMs);return {...result as object,roof_presentation:{...state.roofStates},inspection_device:roofPresentation.snapshot().inspectionDevice}}
    catch (error) { if (epoch === selectionEpoch) select(null); throw error }
  }
  async function resetView(signal?: AbortSignal) { requireReady(); updateOverview(false); select(null); const result = await moveCamera(defaultPosition, defaultTarget, null, signal, timeoutMs, 1); overviewMode = true; return {...result as object,roof_presentation:{...state.roofStates}} }
  function selectFromUser(id:string|null){motion.cancel('用户选择设备');select(id)}
  function setView(position: number[], target: number[]) { overviewMode = false; motion.cancel('检查视角接管相机'); camera.position.fromArray(position); controls.target.fromArray(target); controls.update();invalidate() }
  async function measurePerformance(durationSeconds = 18) {
    requireReady(); motion.cancel('开始性能测试'); select(null)
    const started=performance.now(),moves=Math.max(20,Math.ceil(durationSeconds/.9))
    try {
      for(let step=0;step<moves+2;step++){
        if(step===2)beginFrameSample()
        const angle=.67+step*Math.PI*2/moves
        await moveCamera(new THREE.Vector3(Math.sin(angle)*(state.viewMode!=='unit'?96:62),state.viewMode!=='unit'?62:36,Math.cos(angle)*(state.viewMode!=='unit'?96:62)).add(defaultTarget),defaultTarget,null,undefined,5000)
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
  function lightDiagnostics(){return {pageAgeMs:performance.now(),visible:document.visibilityState,cameraBusy:motion.busy,frame,callbackCount,renderCpuDiagnostics:{enabled:diagnosticsEnabled,calls:diagnosticRenderCalls,totalMs:diagnosticRenderCpuMs,maxMs:diagnosticRenderMaxMs,meaning:'CPU wall duration of renderer.render, not GPU time'},loop:{active:loop.active,starts:loop.starts,stops:loop.stops},renderer:{...ownership},geometryCount:renderer.info.memory.geometries,textureCount:renderer.info.memory.textures,programCount:renderer.info.programs?.length??null,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,rendererDpr:renderer.getPixelRatio(),nativeDpr:devicePixelRatio,canvas:{width:host.clientWidth,height:host.clientHeight},drawingBuffer:{width:renderer.domElement.width,height:renderer.domElement.height},loadGeneration:generation,assetRequests:{...assets.requests}}}
  function snapshot() { return { ...JSON.parse(JSON.stringify(state)), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, camera: camera.position.toArray(), target: controls.target.toArray(), defaultCamera:defaultPosition.toArray(),defaultTarget:defaultTarget.toArray(), zoom: camera.zoom,fov:camera.fov, frame, cameraBusy: motion.busy, visible: document.visibilityState,activeRenderLoops:loop.active?1:0,loadGeneration:generation, assetRequests:{...assets.requests},rendererDpr: renderer.getPixelRatio(), nativeDpr:devicePixelRatio,drawingBuffer:{width:renderer.domElement.width,height:renderer.domElement.height},canvas: { width: host.clientWidth, height: host.clientHeight },loadedModelUrl,loadedModelSha256,waterPhaseMs,roofPresentation:roofPresentation.snapshot(),registrations:state.loadedIds.map(registration),lighting:{exposure:renderer.toneMappingExposure,sunIntensity:sun.intensity,sunPosition:sun.position.toArray(),environmentIntensity:scene.environmentIntensity,shadowMapSize:sun.shadow.mapSize.toArray()},selectionEffects:scene.children.filter(o=>o.name==='SW_SELECTION_COPING_CORNERS').length,sceneGeometryCount:renderer.info.memory.geometries,siteFraming:root?.getObjectByName('SW_SITE_CONTEXT') ? projectedBounds(new THREE.Box3().setFromObject(root.getObjectByName('SW_SITE_CONTEXT')!,true),camera):null,assetStage: root?.getObjectByName(state.deviceId)?.userData.asset_stage, bounds: state.status === 'ready' ? (() => { try { const b = registry.bounds(state.selectedId??state.deviceId); return { min: b.min.toArray(), max: b.max.toArray() } } catch { return null } })() : null } }
  const tick = (now:number) => {
    if(disposed||document.visibilityState!=='visible'||diagnosticControls.scenePaused){onMeasurementVisibility();return}
    callbackCount++;frameSample?.callback(now)
    const delta = now - last; last = now
    motion.update(now)
    const water=waters.get(state.selectedId??state.deviceId)
    if (water instanceof THREE.Mesh && water.material instanceof THREE.MeshStandardMaterial && water.material.normalMap) {
      const phase = waterPhaseMs ?? (state.renderMode==='full'?now:frozenWaterPhase)
      water.material.normalMap.offset.set(phase * 0.0000013, phase * 0.0000009)
    }
    const controlsChanging=controls.update()
    const cpuStart=diagnosticsEnabled?performance.now():0
    renderer.render(scene, camera); frame++;drawLabels()
    if(diagnosticsEnabled){const elapsed=performance.now()-cpuStart;diagnosticRenderCalls++;diagnosticRenderCpuMs+=elapsed;diagnosticRenderMaxMs=Math.max(diagnosticRenderMaxMs,elapsed)}
    frameSample?.submitted(renderer.info.render.calls)
    if (state.status === 'ready' && state.firstRenderMs === 0) state.firstRenderMs = performance.now() - loadStarted
    motion.afterRender(frame)
    if(!shouldKeepRendering(state.renderMode,motion.busy,userInteracting||(controls.enableDamping&&controlsChanging)))loop.sync(false)
    if (now - lastStats > 750) { state.calls = renderer.info.render.calls; state.triangles = renderer.info.render.triangles; state.textures = renderer.info.memory.textures; state.frameMs = delta; lastStats = now }
  }
  const loop=new LoopLifecycle(()=>{last=performance.now();renderer.setAnimationLoop(tick)},()=>renderer.setAnimationLoop(null))
  loop.sync(document.visibilityState==='visible')
  function dispose() { if(disposed)return;loop.dispose();ownership.renderers--;ownership.rendererDisposed++;ownership.observers--;ownership.listeners-=6; document.removeEventListener('visibilitychange',onMeasurementVisibility); disposed = true; generation++; motion.cancel('场景已卸载'); resize.disconnect(); controls.removeEventListener('start', onUserControl);controls.removeEventListener('end',onControlEnd);controls.removeEventListener('change',invalidate); controls.dispose(); renderer.domElement.removeEventListener('pointerdown',pointerDown); renderer.domElement.removeEventListener('pointerup',pointerUp); renderer.setAnimationLoop(null); clearView();assets.dispose();outline?.geometry.dispose();if(outline)(outline.material as THREE.Material).dispose(); environmentTargets.forEach(t=>t.dispose()); sun.shadow.map?.dispose(); renderer.dispose(); renderer.domElement.remove() }
  async function loadUnit(id:string){const unit=findUnit(id);if(!unit)throw new SceneError('UNIT_NOT_FOUND','未知单元');configuredModelUrl=unit.url;return loadView('unit',unit.id)}
  return {visibilityProof,setRoof,registration,loadView,loadPlant:(overrides:Record<string,string>={})=>loadView('plant',state.deviceId,overrides),loadFour:(overrides:Record<string,string>={})=>loadView('plant4',state.deviceId,overrides),loadUnit,invalidate,setRenderMode,lightDiagnostics,syncVisibility:onMeasurementVisibility, state, load, setWater, snapshot, dispose, registry, scene, camera, controls, renderer, defaultPosition, defaultTarget, focusDevice, resetView, setView, select,selectFromUser, motion, measurePerformance,setWaterPhase:(ms:number|null)=>{waterPhaseMs=ms;invalidate()},setPixelRatio:(dpr:number)=>{renderingRatio=dpr;renderer.setPixelRatio(dpr);invalidate()}, setTimeoutMs: (ms: number) => { timeoutMs = ms }, beginFrameSample,endFrameSample,getRoot: () => root }
}

export type SceneRuntime = ReturnType<typeof createScene>
