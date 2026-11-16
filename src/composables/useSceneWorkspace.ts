import { traceInput } from '../diagnostics/stability'
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { createScene, type SceneRuntime,type SceneOptions } from '../scene/runtime'
import { ActionDispatcher } from '../agent/actionDispatcher'
import { parseCommand } from '../agent/demoParser'
import { findUnit } from '../scene/units'
import type { ActionRecord,ToolName,ToolHandler, ToolCall } from '../agent/types'

export function useSceneWorkspace(options:SceneOptions={}) {
  const runtime=shallowRef<SceneRuntime>()
  const records=shallowRef<ActionRecord[]>([])
  const reply=ref('支持定位当前单元与回到总览。成功回执仅在相机到位并完成实际渲染后显示。')
  let latestRequest=0,sceneInstances=0
  let beforeExternalAction=()=>{}
  const handlers:Partial<Record<ToolName,ToolHandler>>={
    'scene.focus_device':async(args,signal)=>{
      if(typeof args.device_id!=='string'||Object.keys(args).some(k=>k!=='device_id'))throw new Error('INVALID_ARGUMENTS: 需要唯一的 device_id 参数')
      if(!runtime.value)throw new Error('SCENE_NOT_READY: 场景尚未初始化')
      return runtime.value.focusDevice(args.device_id,signal)
    },
    'scene.reset_view':async(args,signal)=>{
      if(Object.keys(args).length)throw new Error('INVALID_ARGUMENTS: reset_view 不接受参数')
      if(!runtime.value)throw new Error('SCENE_NOT_READY: 场景尚未初始化')
      return runtime.value.resetView(signal)
    },
  }
  const dispatcher=new ActionDispatcher(handlers,()=>{records.value=dispatcher.records.map(record=>({...record}))})
  function attach(host:HTMLElement) {
    if(runtime.value)throw new Error('SCENE_ALREADY_INITIALIZED')
    runtime.value=createScene(host,options);sceneInstances++;void runtime.value.load()
  }
  async function execute(text:string) {
    beforeExternalAction()
    const request=++latestRequest,call=parseCommand(text)
    if(!call) {reply.value='未识别口令。支持曝气池、二沉池、鼓风机、提升泵定位和“回到总览”，未发起工具调用。';return null}
    const name=findUnit(String(call.arguments.device_id))?.name??'目标设备'
    reply.value=call.tool_name==='scene.focus_device'?`正在定位${name}…`:'正在恢复总览…'
    const record=await dispatcher.dispatch(call,undefined,{source:'DEMO_AGENT',trigger:'确定性口令'})
    if(request===latestRequest)reply.value=record.status==='SUCCEEDED'?(call.tool_name==='scene.focus_device'?`已定位${name}。相机到位，设备已选中，画面已更新。`:'已恢复总览，选中状态已清除，画面已更新。'):`${record.status==='CANCELLED'?'操作已取消':'操作失败'}：${record.error?.message}`
    return record
  }
  async function switchView(mode:'unit'|'plant'|'plant4',id=runtime.value?.state.deviceId??'SW_BIO_AERATION_001'){
    beforeExternalAction();dispatcher.cancel('用户切换视图');const request=++latestRequest;reply.value='正在切换三维视图…'
    try{if(mode==='plant4')await runtime.value?.loadFour();else if(mode==='plant')await runtime.value?.loadPlant();else await runtime.value?.loadUnit(id)
      if(request===latestRequest)reply.value=runtime.value?.state.status==='ready'?'视图已载入；定位与复位仍通过场景工具执行。':'视图加载失败，请重试。'
    }catch(error){if(request===latestRequest)reply.value=`视图切换失败：${String(error)}`}
  }
  const switchUnit=(id:string)=>switchView('unit',id)
  function dispatchUser(call:ToolCall,trigger:string) {beforeExternalAction();return dispatcher.dispatch(call,undefined,{source:'USER',trigger}) }
  const taskState=computed(()=>records.value.at(-1)?.status??'IDLE')
  function cancel() {traceInput('cancel_dispatched',{actionId:dispatcher.records.at(-1)?.action_id});dispatcher.cancel('用户取消当前任务')}
  onBeforeUnmount(()=>{dispatcher.cancel('页面已卸载');runtime.value?.dispose()})
  return {configureTools:(value:Partial<Record<ToolName,ToolHandler>>)=>Object.assign(handlers,value),onExternalAction:(fn:()=>void)=>{beforeExternalAction=fn},runtime,records,reply,dispatcher,execute,dispatchUser,switchUnit,switchView,attach,cancel,taskState,sceneInstances:()=>sceneInstances}
}
