import type {Evidence} from './businessTools.ts'
import {METRICS} from '../data/mockDataProvider.ts'
export type MetricSummary={metric_key:string;label:string;unit:string;latest:any;history:any|null;histories:any[];evidence_ids:string[];conflict:boolean;observations:{latest:any;evidence_ids:string[]}[]}
type EvidenceVersion={task_id:string;snapshot_id:string;scenario_id:string;as_of:string;evidence:Evidence[]}
export const evidenceForTask=(task:EvidenceVersion)=>task.evidence.filter(e=>e.task_id===task.task_id&&e.snapshot_id===task.snapshot_id&&e.scenario_id===task.scenario_id&&e.as_of===task.as_of)
export const evidenceScope=(task:EvidenceVersion&{scope:string[]})=>[...new Set([...task.scope,...evidenceForTask(task).flatMap(e=>e.device_id?[e.device_id]:e.tool_name==='alarm.list'?(e.data.scope??[]):[])])]
// Current cards and newly generated reports share this pure, version-bound aggregation.
// Never choose a first/last query as the entire device result or mix historical snapshots.
export function summarizeDevice(task:EvidenceVersion,deviceId:string,rules:{lowDo:{below:number}},queryFailed=false){
 const valid=evidenceForTask(task)
 const own=valid.filter(e=>e.device_id===deviceId),queries=own.filter(e=>e.tool_name==='device.get_metrics'||e.tool_name==='chart.show_trend'),metricsByKey=new Map<string,MetricSummary>();let invalid=false
 for(const evidence of queries)for(const m of evidence.data.metrics??[]){
  if(m.latest?.scopeId!==deviceId||m.latest?.snapshotId!==task.snapshot_id){invalid=true;continue}
  let metric=metricsByKey.get(m.metric_key)
  if(!metric){metric={metric_key:m.metric_key,label:m.label,unit:m.unit,latest:structuredClone(m.latest),history:null,histories:[],evidence_ids:[],conflict:false,observations:[]};metricsByKey.set(m.metric_key,metric)}
  if(!metric.evidence_ids.includes(evidence.evidence_id))metric.evidence_ids.push(evidence.evidence_id)
  const observation=metric.observations.find(o=>JSON.stringify(o.latest)===JSON.stringify(m.latest))
  if(observation){if(!observation.evidence_ids.includes(evidence.evidence_id))observation.evidence_ids.push(evidence.evidence_id)}else metric.observations.push({latest:structuredClone(m.latest),evidence_ids:[evidence.evidence_id]})
  if(metric.observations.length>1||metric.unit!==m.unit)metric.conflict=true
  if(m.history){const {evidence_ids:_,...h}=m.history;const match=metric.histories.find(item=>{const {evidence_ids:__,...data}=item;return JSON.stringify(data)===JSON.stringify(h)})
   if(match){if(!match.evidence_ids.includes(evidence.evidence_id))match.evidence_ids.push(evidence.evidence_id)}
   else {if(metric.histories.some(item=>item.hours===h.hours&&item.start===h.start&&item.end===h.end))metric.conflict=true;metric.histories.push({...structuredClone(h),evidence_ids:[evidence.evidence_id]})}
  }
 }
 const metrics=[...metricsByKey.values()].sort((a,b)=>Object.keys(METRICS).indexOf(a.metric_key)-Object.keys(METRICS).indexOf(b.metric_key))
 for(const m of metrics){m.histories.sort((a,b)=>a.hours-b.hours||String(a.start).localeCompare(b.start));m.history=m.histories.length===1?structuredClone(m.histories[0]):null}
 const alarmEvidence=valid.filter(e=>e.tool_name==='alarm.list'&&(e.data.scope??[]).includes(deviceId)),alarms=[...new Map(alarmEvidence.flatMap(e=>(e.data.alarms??[]).filter((a:any)=>a.deviceId===deviceId)).map((a:any)=>[a.alarmId,structuredClone(a)])).values()] as any[]
 const limitations:string[]=[];let conclusion='未取得指标查询结果 · 无法判断'
 const missing=metrics.some(m=>m.latest.value===null||m.latest.quality!=='GOOD'),doMetric=metrics.find(m=>m.metric_key==='do'&&m.latest.quality==='GOOD'&&m.latest.value!==null)
 if(queries.length){if(!metrics.length)conclusion='无法判断 · 未定义运行指标';else if(metrics.some(m=>m.conflict))conclusion='指标证据冲突 · 无法判断';else if(doMetric)conclusion=(doMetric.latest.value<rules.lowDo.below?'有效 DO 触发低溶解氧演示规则':'有效 DO 未触发低溶解氧演示规则')+(missing?'；其余指标含缺测 / 过期，无法完整判断':'');else conclusion=missing?'含缺测 / 过期指标 · 无法完整判断':'已读取有效指标 · 未配置评价规则'}
 else if(queryFailed)conclusion='指标查询失败 · 无法判断'
 if(invalid){conclusion='指标证据归属不一致 · 无法完整判断';limitations.push('已排除设备或快照归属不一致的指标，原始证据仍保留。')}
 if(queryFailed)limitations.push('存在指标查询失败；已取得的其他结果保留，检查范围不完整。')
 if(!metrics.length)limitations.push('有模型或设备资料不等于具备运行监测能力。')
 if(missing)limitations.push('缺测不补零；过期读数不作为有效状态判断。')
 if(metrics.some(m=>m.conflict))limitations.push('同一指标的证据冲突，保留全部观测与时间窗，不选择其中一条冒充确定结论。')
 if(alarms.some(a=>a.status==='AWAITING_DATA'))limitations.push('已有告警等待有效数据确认；缺测不自动解除告警。')
 limitations.push('未触发演示规则不等于设备健康或运行正常。')
 return {metrics,alarms,conclusion,limitations,evidence_ids:[...new Set([...own,...alarmEvidence].map(e=>e.evidence_id))]}
}
