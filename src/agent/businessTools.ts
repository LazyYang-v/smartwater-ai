import {ENTITIES,RULES,CLOCK,METRICS,type Snapshot,type MetricKey,type Reading,trendWindow,BASIN_ID} from '../data/mockDataProvider.ts'
import {UNITS} from '../scene/units.ts'
import {TOOL_DEFINITIONS,validateTool,AgentError,type AgentToolName} from './contracts.ts'
import type {ToolHandler} from './types.ts'
export type Evidence={evidence_id:string;tool_name:AgentToolName;task_id:string;snapshot_id:string;scenario_id:string;as_of:string;source:'SIMULATED';quality:string;device_id?:string;metric_key?:string;unit?:string;data:Record<string,any>;[key:string]:unknown}
export type QueryContext={task_id:string;snapshot:Snapshot;nextEvidence:()=>string;findEvidence:(id:string)=>Evidence|undefined;assertActive:()=>void}
export function statistics(points:Reading[],hours:number){
 const good=points.filter(p=>p.quality==='GOOD'&&p.value!==null&&Number.isFinite(p.value)),values=good.map(p=>p.value!),missing=points.filter(p=>p.quality==='MISSING'||p.value===null).length,stale=points.filter(p=>p.quality==='STALE').length,expected=Math.floor(hours*3600000/CLOCK.sampleMs)+1
 return {total_samples:points.length,valid_samples:good.length,missing_samples:missing,stale_samples:stale,invalid_samples:points.length-good.length-missing-stale,expected_samples:expected,coverage:good.length/expected,min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null,mean:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,start:points[0]?.sampleAt??null,end:points.at(-1)?.sampleAt??null,cadence_ms:CLOCK.sampleMs}
}
export function requireDevice(id:string){const unit=UNITS.find(u=>u.id===id),entity=ENTITIES.find(e=>e.id===id);if(!unit||!entity)throw new AgentError('DEVICE_NOT_FOUND','不在当前四单元范围内：'+id);return {unit,entity}}
export function queryMetrics(snapshot:Snapshot,id:string,requested?:string[],hours?:number){
 const {entity}=requireDevice(id),keys=requested??entity.metrics
 if(requested&&!requested.length)throw new AgentError('INVALID_ARGUMENTS','指标列表不能为空')
 if(keys.some(key=>!entity.metrics.includes(key as MetricKey)))throw new AgentError('METRIC_NOT_OWNED','指标不属于该设备')
 return {outcome:entity.metrics.length?'DATA_AVAILABLE':'NO_DEFINED_METRICS',device_name:entity.name,metrics:keys.map(key=>{
  const metric=key as MetricKey,latest=snapshot.readings[metric];if(latest.scopeId!==id)throw new AgentError('METRIC_NOT_OWNED','源数据设备归属不一致')
  if(hours&&metric!=='do'&&metric!=='blower_power')throw new AgentError('HISTORY_NOT_AVAILABLE','指标 '+metric+' 没有既定历史；查询当前值请省略 hours，仅 do 和 blower_power 支持历史')
  const points=hours?trendWindow(snapshot,metric as 'do'|'blower_power',hours as 1|6|24):[]
  return {metric_key:metric,label:METRICS[metric].label,unit:latest.unit,latest:{...latest},history:hours?{hours,...statistics(points,hours)}:null}
 })}
}
function quality(data:Record<string,any>){if(data.available_metrics)return 'NOT_OBSERVED';if(data.current_quality)return String(data.current_quality);if(data.alarms)return data.alarms.length?'EVENT_QUALITY_NOT_RECORDED':'NO_ALARM_RECORDS';const metrics=data.metrics as any[]|undefined;if(!metrics)return 'NOT_APPLICABLE';if(!metrics.length)return 'NO_DATA';return metrics.every(m=>m.latest.quality==='GOOD')?'GOOD':metrics.some(m=>m.latest.quality==='MISSING')?'MISSING':'STALE'}
export type ToolPresentation={focus:(id:string,signal:AbortSignal)=>Promise<unknown>;reset:(signal:AbortSignal)=>Promise<unknown>;modelState:(id:string)=>string;showTrend:(value:{device_id:string;metric_key:'do'|'blower_power';hours:1|6|24;context:QueryContext;evidence_id:string},signal:AbortSignal)=>Promise<unknown>}
export function createBusinessTools(context:()=>QueryContext,presentation:ToolPresentation):Record<AgentToolName,ToolHandler>{
 return Object.fromEntries(TOOL_DEFINITIONS.map(def=>[def.name,async(args:Record<string,unknown>,external:AbortSignal)=>{
  validateTool(def.name,args);const ctx=context();ctx.assertActive();const linked=new AbortController(),abort=()=>linked.abort(external.reason);if(external.aborted)abort();else external.addEventListener('abort',abort,{once:true})
  const signal=linked.signal,evidenceId=ctx.nextEvidence();let timer:ReturnType<typeof setTimeout>|undefined
  const work=async()=>{
   if(signal.aborted)throw new AgentError('CANCELLED','操作已取消')
   const id=args.device_id as string|undefined;if(id)requireDevice(id)
   let data:Record<string,any>={}
   switch(def.name){
    case 'device.get_details':{const {unit,entity}=requireDevice(id!);data={...entity,unit_id:unit.unitId,asset_root_node:unit.assetRootNode,mechanical_node:unit.mechanicalNode,available_metrics:entity.metrics,model_load_state:presentation.modelState(id!),operating_state:'NOT_OBSERVED',limitation:'模型和加载状态不是实时运行或健康证据'};break}
    case 'device.get_metrics':data=queryMetrics(ctx.snapshot,id!,args.metric_keys as string[]|undefined,args.hours as number|undefined);break
    case 'alarm.list':data={alarms:ctx.snapshot.alarms.filter(a=>!id||a.deviceId===id).slice(0,32),scope:id?[id]:UNITS.map(u=>u.id),limitation:'无告警不等于设备正常；未配置指标不等于零'};break
    case 'alarm.inspect':{
     const alarm=ctx.snapshot.alarms.find(a=>a.alarmId===args.alarm_id);if(!alarm)throw new AgentError('ALARM_NOT_FOUND','该告警不在任务快照中')
     const historical=ctx.snapshot.history.do.find(p=>p.sampleAt===alarm.occurredAt&&p.value===alarm.valueAtEvent)
     data={alarm:{...alarm},metric_key:alarm.metricKey,unit:ctx.snapshot.readings.do.unit,threshold:RULES.lowDo.below,operator:'<',rule_id:RULES.lowDo.id,rule_label:RULES.lowDo.label,trigger_comparison:alarm.valueAtEvent<RULES.lowDo.below,event_quality:historical?.quality??'NOT_RECORDED',event_quality_basis:historical?'EXACT_HISTORY_MATCH':'原告警未单独存储事件质量，当前快照无精确匹配',current_quality:ctx.snapshot.readings.do.quality,current_value:ctx.snapshot.readings.do.value,limitation:'仅解释已有演示规则触发依据，不推断故障因果或提出设备控制建议'};break}
    case 'chart.show_trend':{
     const metric=args.metric_key as 'do'|'blower_power',hours=args.hours as 1|6|24
     const query=queryMetrics(ctx.snapshot,id!,[metric],hours)
     let reference_kind='TASK_SNAPSHOT'
     if(args.evidence_id){
      const original=ctx.findEvidence(String(args.evidence_id)),m=original?.data.metrics?.find((m:any)=>m.metric_key===metric)
      const same=original?.snapshot_id===ctx.snapshot.snapshotId&&original?.device_id===id
      const reading=same&&m&&(m.history===null||m.history?.hours===hours)
      const alarm=same&&original?.tool_name==='alarm.inspect'&&original.data.metric_key===metric&&original.data.alarm?.deviceId===id
      if(!reading&&!alarm)throw new AgentError('EVIDENCE_MISMATCH','趋势引用必须属于当前任务、同快照、同设备和指标；已有历史统计还须同一时窗')
      reference_kind=alarm?'SAME_SNAPSHOT_ALARM':m.history===null?'SAME_SNAPSHOT_READING':'MATCHED_HISTORY_QUERY'
     }
     const shown=await presentation.showTrend({device_id:id!,metric_key:metric,hours,context:ctx,evidence_id:evidenceId},signal)
     data={...query,shown,query_evidence_id:args.evidence_id??null,reference_kind,hours};break}
    case 'scene.focus_device':data=await presentation.focus(id!,signal) as Record<string,unknown>;break
    case 'scene.reset_view':data=await presentation.reset(signal) as Record<string,unknown>;break
   }
   if(signal.aborted)throw new AgentError('CANCELLED','操作已取消');ctx.assertActive()
   const result:Evidence={...data,evidence_id:evidenceId,tool_name:def.name,task_id:ctx.task_id,snapshot_id:ctx.snapshot.snapshotId,scenario_id:ctx.snapshot.scenario,as_of:ctx.snapshot.demoTime,source:'SIMULATED',quality:quality(data),data}
   if(id)result.device_id=id;if(data.alarm){result.device_id=data.alarm.deviceId;result.metric_key=data.alarm.metricKey;result.unit=data.unit}if(args.metric_key)result.metric_key=String(args.metric_key);if(data.metrics?.length===1){result.metric_key=data.metrics[0].metric_key;result.unit=data.metrics[0].unit}
   return result
  }
  try{return await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>{linked.abort({code:'TIMEOUT'});reject(new AgentError('TIMEOUT','工具超过执行上限'))},def.limits.timeoutMs)})])}finally{clearTimeout(timer);external.removeEventListener('abort',abort)}
 }])) as Record<AgentToolName,ToolHandler>
}
