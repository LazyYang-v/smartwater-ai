import type { useSceneWorkspace } from '../composables/useSceneWorkspace'
import type { useMockData } from '../composables/useMockData'
import type { useDashboardContext } from '../composables/useDashboardContext'
import { ownership,diagnosticControls,inputEvents,enableDiagnostics } from '../diagnostics/stability'
import { chartStats } from '../charts/runtime'
import type { ToolCall } from '../agent/types'
export function exposeDashboardQA(scene:ReturnType<typeof useSceneWorkspace>,data:ReturnType<typeof useMockData>,context:ReturnType<typeof useDashboardContext>,locate:(id:string,trigger?:string)=>unknown) {
  if(!import.meta.env.DEV&&!new URLSearchParams(location.search).has('qa'))return
  const r=()=>scene.runtime.value!
  let diagnosticTimer:ReturnType<typeof setInterval>|undefined
  const samples:unknown[]=[]
  const lightweight=()=>({at:performance.now(),wallTime:new Date().toISOString(),...r().lightDiagnostics(),scenario:data.snapshot.value.scenario,snapshotId:data.snapshot.value.snapshotId,task:scene.taskState.value,charts:{...chartStats},ownership:{...ownership},toolRecords:scene.dispatcher.records.length,history:{do:data.snapshot.value.history.do.length,blower_power:data.snapshot.value.history.blower_power.length},domNodes:document.getElementsByTagName('*').length,unavailable:{browserInternalListeners:null,gpuMemoryBytes:null,vueInternalSubscriptions:null}})
  function stopDiagnostics(){if(diagnosticTimer!==undefined){clearInterval(diagnosticTimer);diagnosticTimer=undefined}enableDiagnostics(false);r().motion.diagnosticsEnabled=false}
  function startDiagnostics(){if(diagnosticTimer!==undefined)return;enableDiagnostics(true);r().motion.diagnosticsEnabled=true;diagnosticTimer=setInterval(()=>{samples.push(lightweight());if(samples.length>1800)samples.shift()},1000)}
  addEventListener('pagehide',stopDiagnostics,{once:true})

  const api={
    setBatching:(enabled:boolean)=>r().setBatching(enabled),lightDiagnostics:lightweight,diagnosticSamples:()=>structuredClone(samples),startDiagnostics,stopDiagnostics,inputEvents:()=>structuredClone(inputEvents),cameraEvents:()=>structuredClone(r().motion.events),
    diagnosticSwitch:(value:{chartsPaused?:boolean;scenePaused?:boolean})=>{Object.assign(diagnosticControls,value);r().syncVisibility()},cancel:scene.cancel,
    snapshot:()=>r().snapshot(),load:(url?:string)=>r().load(url),setView:(position:number[],target:number[])=>r().setView(position,target),
    setWater:(v:boolean)=>r().setWater(v),setWaterPhase:(ms:number|null)=>r().setWaterPhase(ms),setPixelRatio:(dpr:number)=>r().setPixelRatio(dpr),
    send:(text:string)=>scene.execute(text),dispatch:(call:ToolCall,id?:string)=>scene.dispatcher.dispatch(call,id,{source:'TEST',trigger:'验收调用'}),records:()=>structuredClone(scene.dispatcher.records),
    assetReport:()=>{const nodes:unknown[]=[];r().getRoot()?.traverse(node=>nodes.push({name:node.name,parent:node.parent?.name,device_id:node.userData.device_id,part_id:node.userData.part_id,rotation:node.rotation.toArray()}));return nodes},
    measurePerformance:(seconds?:number)=>r().measurePerformance(seconds),beginFrameSample:()=>r().beginFrameSample(),endFrameSample:()=>r().endFrameSample(),
    project:(point:number[])=>{const p=r().camera.position.clone().fromArray(point).project(r().camera),rect=r().renderer.domElement.getBoundingClientRect();return {x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2}},
    fault:(fault:string)=>{if(fault==='missing-device'){r().select(null);r().registry.clear()}else if(fault==='restore'){if(r().getRoot())r().registry.register(r().getRoot()!);r().state.status='ready';r().state.error='';r().setTimeoutMs(5000)}else if(fault==='loading')r().state.status='loading';else if(fault==='timeout')r().setTimeoutMs(10)},
  }
  Object.assign(window,{__SW_M0__:api,__SW_M1__:{...api,
    data:()=>structuredClone(data.snapshot.value),scenario:data.switchScenario,pause:data.setPaused,advance:data.advance,
    context:context.context,locate,selectAlarm:context.selectAlarm,
    range:(value:1|6|24)=>{context.hours.value=value},
    panels:(value:{left?:boolean;trends?:boolean;tab?:'do'|'blower_power'})=>{if(value.left!==undefined)context.leftCollapsed.value=value.left;if(value.trends!==undefined)context.trendsExpanded.value=value.trends;if(value.tab)context.activeTrend.value=value.tab},
    diagnostics:()=>({sceneInstances:scene.sceneInstances(),renderLoops:r().snapshot().activeRenderLoops,chartStats:{...chartStats},contextId:context.contextId.value,hours:context.hours.value,activeTrend:context.activeTrend.value,paused:data.paused.value,hidden:data.hidden.value,running:data.running.value,snapshotId:data.snapshot.value.snapshotId}),
  }})
  return ()=>{stopDiagnostics();removeEventListener('pagehide',stopDiagnostics)}
}
