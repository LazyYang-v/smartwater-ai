import {ref,shallowRef,computed,watch,onMounted,onBeforeUnmount,nextTick} from 'vue'
import type {useSceneWorkspace} from './useSceneWorkspace'
import type {useMockData} from './useMockData'
import type {useDashboardContext} from './useDashboardContext'
import {useTaskHistory} from './useTaskHistory'
import {AgentTaskRunner,TASK_TEMPLATES,type AgentTask,findings} from '../agent/taskRunner'
import {createBusinessTools,type QueryContext,type Evidence} from '../agent/businessTools'
import {AgentError} from '../agent/contracts'
import type {Snapshot} from '../data/mockDataProvider'
const frame=(signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{if(signal.aborted){reject(new AgentError('CANCELLED','展示已取消'));return}const abort=()=>{cancelAnimationFrame(id);reject(new AgentError('CANCELLED','展示已取消'))},id=requestAnimationFrame(()=>{signal.removeEventListener('abort',abort);resolve()});signal.addEventListener('abort',abort,{once:true})})
export function useBusinessAgent(scene:ReturnType<typeof useSceneWorkspace>,data:ReturnType<typeof useMockData>,context:ReturnType<typeof useDashboardContext>){
 const history=useTaskHistory()
 const tasks=shallowRef<AgentTask[]>([]),mode=ref<'DEMO'|'LLM'>('DEMO'),gateway=shallowRef({ready:false,reason:'尚未连接模型网关'}),message=ref('只读业务演示；支持四个任务模板与已有定位/复位口令。')
 const pinned=shallowRef<{snapshot:Snapshot;device_id:string;metric_key:'do'|'blower_power';hours:1|6|24;evidence_id:string;task_id:string}|null>(null)
 const proofs=new Map<string,{snapshotId:string;metric:string;hours:number;evidenceId?:string}>();let chartGeneration=0
 const clearTrend=()=>{chartGeneration++;pinned.value=null}
 let runner:AgentTaskRunner,replayContext:QueryContext|undefined
 async function showTrend(value:{device_id:string;metric_key:'do'|'blower_power';hours:1|6|24;context:QueryContext;evidence_id:string},signal:AbortSignal){
  value.context.assertActive();const ticket=++chartGeneration;proofs.delete(value.metric_key)
  pinned.value={snapshot:value.context.snapshot,device_id:value.device_id,metric_key:value.metric_key,hours:value.hours,evidence_id:value.evidence_id,task_id:value.context.task_id}
  context.contextId.value=value.device_id;context.hours.value=value.hours;context.activeTrend.value=value.metric_key;context.trendsExpanded.value=true
  await nextTick();const deadline=performance.now()+2300
  while(true){value.context.assertActive();if(signal.aborted||ticket!==chartGeneration)throw new AgentError('CANCELLED','展示已被新操作替换');const proof=proofs.get(value.metric_key);if(proof?.evidenceId===value.evidence_id&&proof.snapshotId===value.context.snapshot.snapshotId&&proof.hours===value.hours){await frame(signal);await frame(signal);value.context.assertActive();if(ticket!==chartGeneration)throw new AgentError('CANCELLED','展示已替换');return {displayed:true,metric_key:value.metric_key,hours:value.hours,snapshot_id:proof.snapshotId,evidence_id:value.evidence_id}}if(performance.now()>deadline)throw new AgentError('DISPLAY_FAILED','图表未确认该版本实际提交');await frame(signal)}
 }
 const changed=()=>{tasks.value=runner.tasks.map(t=>({...t,evidence:[...t.evidence],errors:[...t.errors],action_ids:[...t.action_ids]}))}
 runner=new AgentTaskRunner({snapshot:()=>data.snapshot.value,dispatch:(call,id,meta,signal)=>scene.dispatcher.dispatch(call,id,meta,signal),cancelScene:reason=>scene.dispatcher.cancel(reason),changed,onEvent:(_kind,task)=>history.observe(task),transport:async(messages,task,signal)=>{
  if(!gateway.value.ready)throw new AgentError('LLM_NOT_CONFIGURED',gateway.value.reason)
  const {requestModel}=await import('../agent/llmClient');return requestModel(messages,task,signal)
 }})
 const detachHistory=scene.dispatcher.subscribe(record=>history.action(record,runner.tasks.find(task=>task.task_id===record.task_id)))
 scene.configureTools(createBusinessTools(()=>replayContext??runner.context(),{focus:async(id,signal)=>{if(!scene.runtime.value)throw new AgentError('SCENE_NOT_READY','三维尚未初始化');return scene.runtime.value.focusDevice(id,signal)},reset:async signal=>{if(!scene.runtime.value)throw new AgentError('SCENE_NOT_READY','三维尚未初始化');return scene.runtime.value.resetView(signal)},modelState:id=>scene.runtime.value?.state.deviceStates[id]?.status??'unloaded',showTrend}))
 const cancel=(code='CANCELLED',reason='用户取消任务')=>{replayContext=undefined;runner.cancel(code,reason)}
 scene.onExternalAction(()=>{cancel('CANCELLED','用户切换展示操作');clearTrend()})
 async function execute(text:string,executionMode=mode.value,parentTaskId?:string){if(!history.owner.value){message.value=history.ownerMessage.value;return null}replayContext=undefined;clearTrend();message.value='正在执行只读任务…';const task=await runner.start(text,executionMode,parentTaskId);if(runner.active?.task_id===task.task_id)message.value=task.status==='SUCCEEDED'?'任务步骤已完成；结果仅代表固定演示快照。':task.status==='PARTIAL'?'部分完成，请检查失败步骤和限制。':task.status==='CANCELLED'?'任务已取消，未继续调度。':'任务失败，未伪造成功或切换执行模式。';return task}
 const current=computed(()=>tasks.value.at(-1)),resultFindings=computed(()=>current.value?findings(current.value):[])
 const taskState=computed(()=>{const task=current.value,record=scene.records.value.at(-1);if(task?.status==='RUNNING')return 'RUNNING';if(record&&(!task||record.started_at>=(task.finished_at??task.started_at)))return record.status;return task?.status??scene.taskState.value})
 watch(mode,()=>{cancel('CANCELLED','用户切换Agent模式');clearTrend()},{flush:'sync'})
 watch(()=>data.snapshot.value.scenario,()=>{cancel('SCENARIO_CHANGED','演示场景已切换，旧任务取消');clearTrend()},{flush:'sync'})
 watch(context.contextId,id=>{if(pinned.value&&pinned.value.device_id!==id)clearTrend()})
 const onHidden=()=>{if(document.visibilityState==='hidden')cancel('PAGE_HIDDEN','页面隐藏，复合任务和模型请求已取消')}
 const onDrag=()=>cancel('CANCELLED','用户拖动相机中断任务')
 const detach=watch(scene.runtime,(runtime,previous)=>{previous?.controls.removeEventListener('start',onDrag);runtime?.controls.addEventListener('start',onDrag)})
 async function refreshGateway(){try{const response=await fetch('/api/agent/status',{signal:AbortSignal.timeout(2500)});if(!response.ok)throw new Error('unavailable');const status=await response.json();gateway.value={ready:status.ready===true,reason:status.ready?'模型网关已配置，真实调用尚需成功执行验证':'缺少服务端配置：'+(Array.isArray(status.missing)?status.missing.join('、'):'检查网关配置')}}catch{gateway.value={ready:false,reason:'模型网关未启动或无法连接；Demo仍可使用'}}if(!gateway.value.ready&&mode.value==='LLM')cancel('MODEL_UNAVAILABLE','模型网关不可用，未回退Demo')}
 onMounted(()=>{document.addEventListener('visibilitychange',onHidden);void refreshGateway()})
 onBeforeUnmount(()=>{cancel('CANCELLED','页面卸载');detachHistory();detach();scene.runtime.value?.controls.removeEventListener('start',onDrag);document.removeEventListener('visibilitychange',onHidden)})
 function range(hours:1|6|24){clearTrend();context.hours.value=hours}
 async function reopen(evidenceId:string){const task=current.value;if(!task)return;try{await runner.replayTrend(task,evidenceId,async(ctx,e,signal)=>{
  const metric=e.data.metrics?.[0];if(!metric?.history)throw new AgentError('HISTORY_NOT_AVAILABLE','该证据没有历史序列')
  replayContext=ctx
  try{const record=await scene.dispatcher.dispatch({tool_name:'chart.show_trend',arguments:{device_id:e.device_id!,metric_key:metric.metric_key,hours:metric.history.hours,evidence_id:e.evidence_id}},crypto.randomUUID(),{source:'USER',trigger:'查看历史证据趋势',snapshot_id:task.snapshot_id,as_of:task.as_of},signal);if(record.status!=='SUCCEEDED')throw new AgentError(record.error?.code??'DISPLAY_FAILED',record.error?.message??'展示失败');return record}finally{if(replayContext===ctx)replayContext=undefined}
 })}catch(error){message.value=String((error as Error).message)}}

 async function rerun(id:string){const old=await history.testing.archive(id);if(old){mode.value=old.task.mode;return execute(old.task.input,old.task.mode,id)}}
 return {history,rerun,mode,gateway,refreshGateway,tasks,current,resultFindings,taskState,message,pinned,execute,cancel:()=>{cancel();scene.cancel()},range,reopen,templates:TASK_TEMPLATES,onTrendRendered:(proof:{snapshotId:string;metric:string;hours:number;evidenceId?:string})=>proofs.set(proof.metric,proof),runner,clearTrend}
}
