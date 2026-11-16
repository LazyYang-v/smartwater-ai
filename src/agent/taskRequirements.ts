import {UNITS} from '../scene/units.ts'
import {ENTITIES,BASIN_ID,BLOWER_ID} from '../data/mockDataProvider.ts'
import {evidenceForTask} from './evidenceSummary.ts'
import type {Evidence} from './businessTools.ts'
export type RequiredOutcome={kind:'focus'|'overview'|'details'|'metrics'|'trend'|'alarms';device_id?:string;metric_keys?:string[];hours?:number;scope?:string[]}
export type TaskRequirements={version:1;intent:'BLOWER_TREND'|'DO_ALARM'|'INSPECTION'|'DEVICE_STATUS'|'READ_METRICS'|'FOCUS'|'OVERVIEW'|'UNCLASSIFIED';outcomes:RequiredOutcome[];time_origin:'EXPLICIT'|'DEMO_DEFAULT'|'NONE';issues:string[]}
// Capture whole numeric expressions before validating the finite supported windows.
// Unsupported Chinese compounds must never backtrack into a valid suffix such as 六.
function timeRequirements(input:string){
 const original=input.normalize('NFKC').toLowerCase(),compact=original.replace(/\s/g,''),issues:string[]=[],values:number[]=[]
 const expressions=[...compact.matchAll(/([+\-−负]?[0-9零〇一二两三四五六七八九十百千万亿壹贰叁肆伍陆柒捌玖拾佰仟萬億廿卅卌几半][0-9零〇一二两三四五六七八九十百千万亿壹贰叁肆伍陆柒捌玖拾佰仟萬億廿卅卌几点半多余又个a-z.\/分之~至到-]*)(?:个)?(?:小时|h(?:ours?)?(?![a-z]))/g)]
 const units=[...original.matchAll(/小时|\bh(?:ours?)?\b|(?<=[0-9零〇一二两三四五六七八九十百千万亿])h(?:ours?)?(?![a-z])/g)]
 const digits:Record<string,number>={'零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9}
 for(const expression of expressions){
  const token=expression[1]!.replace(/个$/,''),tens=token.match(/^([一二两三四五六七八九])?十([一二三四五六七八九])?$/)
  const value=/^\d+(?:\.\d+)?$/.test(token)?Number(token):Object.hasOwn(digits,token)?digits[token]:tens?(tens[1]?digits[tens[1]]!:1)*10+(tens[2]?digits[tens[2]]!:0):undefined
  if(value===undefined||!Number.isFinite(value))issues.push('无法完整解析时间表达式：'+expression[0]+'；仅支持 1h、6h、24h')
  else values.push(value)
 }
 if(units.length>expressions.length)issues.push('存在无法完整解析的时间表达式；请使用 1h、6h 或 24h')
 const distinct=[...new Set(values)]
 if(distinct.length>1)issues.push('时间窗有多个不同值，当前单任务模板无法确认要求')
 if(distinct.some(h=>![1,6,24].includes(h)))issues.push('仅支持 1h、6h、24h 历史时间窗')
 return {present:expressions.length>0||units.length>0,hours:values[0],issues}
}
const normalized=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[\s，,。！？!?、-]/g,'')
export function resolveRequirements(input:string):TaskRequirements{
 const text=normalized(input),outcomes:RequiredOutcome[]=[],issues:string[]=[],result:TaskRequirements={version:1,intent:'UNCLASSIFIED',outcomes,time_origin:'NONE',issues}
 const devices=UNITS.filter(u=>[u.id,u.name,u.name.replace(/^一号/,''),...(ENTITIES.find(e=>e.id===u.id)?.name.match(/[A-Z]+-?\d+/g)??[])].some(alias=>text.includes(normalized(alias))))
 const time=timeRequirements(input);issues.push(...time.issues)
 const hours=time.present?time.hours:6;result.time_origin=time.present?'EXPLICIT':'NONE'
 const focus=/定位|聚焦|找到|带我.*看|画面带到|镜头/.test(text),trend=/趋势|曲线|历史|最近|过去|近[一六\d]|小时/.test(text)
 const keys:string[]=[];if(/溶解氧|do/.test(text.replace(/sw_[a-z_0-9]+/g,'')))keys.push('do');if(/ph/.test(text))keys.push('ph');if(/水深/.test(text))keys.push('depth');if(/功率/.test(text))keys.push('blower_power')
 if(/巡检/.test(text)||(/(?:四|全部|所有).*(?:单元|设备)/.test(text)&&/检查|查.*遍|异常|缺失|缺少/.test(text))){
  result.intent='INSPECTION';const scope=/(?:四|全部|所有).*(?:单元|设备)/.test(text)?UNITS:devices.length?devices:UNITS
  for(const unit of scope)outcomes.push({kind:'details',device_id:unit.id},{kind:'metrics',device_id:unit.id,metric_keys:[...unit.metrics]})
  outcomes.push({kind:'alarms',scope:scope.map(u=>u.id)})
 }else if(/告警/.test(text)&&(/溶解氧|低do|曝气池/.test(text))){
  result.intent='DO_ALARM';if(!time.present)result.time_origin='DEMO_DEFAULT';outcomes.push({kind:'alarms',scope:[BASIN_ID]},{kind:'trend',device_id:BASIN_ID,metric_keys:['do'],hours});if(focus)outcomes.push({kind:'focus',device_id:BASIN_ID})
 }else if(devices.some(u=>u.id===BLOWER_ID)&&keys.includes('blower_power')&&trend){
  result.intent='BLOWER_TREND';if(!time.present)result.time_origin='DEMO_DEFAULT';outcomes.push({kind:'metrics',device_id:BLOWER_ID,metric_keys:['blower_power'],hours},{kind:'trend',device_id:BLOWER_ID,metric_keys:['blower_power'],hours});if(focus)outcomes.push({kind:'focus',device_id:BLOWER_ID})
 }else if(devices.length&&keys.length){
  result.intent='READ_METRICS';const showTrend=/趋势|曲线/.test(text)
  if(showTrend&&!time.present)result.time_origin='DEMO_DEFAULT'
  for(const unit of devices){
   const owned=keys.filter(k=>unit.metrics.includes(k));if(owned.length!==keys.length)issues.push(unit.id+' 的指定指标不属于该设备')
   outcomes.push({kind:'metrics',device_id:unit.id,metric_keys:owned,...((time.present||showTrend)?{hours}: {})})
   if(focus)outcomes.push({kind:'focus',device_id:unit.id})
   if(showTrend){
    if(owned.length!==1||!['do','blower_power'].includes(owned[0]!))issues.push('该指标组合的趋势展示无法完整验收，请指定单个支持历史的指标')
    else outcomes.push({kind:'trend',device_id:unit.id,metric_keys:owned,hours})
   }
  }
 }else if(devices.length&&/正常|运行|状态|检查/.test(text)){
  result.intent='DEVICE_STATUS';for(const unit of devices)outcomes.push({kind:'details',device_id:unit.id},{kind:'metrics',device_id:unit.id,metric_keys:[...unit.metrics]})
 }else if(devices.length===1&&focus){result.intent='FOCUS';outcomes.push({kind:'focus',device_id:devices[0]!.id})}
 else if(/^(?:请)?(?:回到|返回|恢复)(?:厂区)?总览$/.test(text)){result.intent='OVERVIEW';outcomes.push({kind:'overview'})}
 if(time.present&&['INSPECTION','DEVICE_STATUS'].includes(result.intent))issues.push('当前巡检 / 状态任务验收当前快照；历史时窗请使用明确的指标趋势任务')
 if(result.intent!=='INSPECTION'&&devices.length>1)issues.push('该复合请求涉及多个设备，超出当前单设备验收模板，不能确认全部要求')
 if(result.intent!=='INSPECTION'&&devices.length===1&&keys.some(key=>!devices[0]!.metrics.includes(key)))issues.push('指定指标不属于目标设备')
 return result
}
export type CompletionGap={outcome:RequiredOutcome|null;reason:string}
type Context={task_id:string;snapshot_id:string;scenario_id:string;as_of:string;evidence:Evidence[]}
export function requirementGaps(requirements:TaskRequirements,task:Context):CompletionGap[]{
 const valid=evidenceForTask(task),gaps:CompletionGap[]=requirements.issues.map(reason=>({outcome:null,reason}))
 if(requirements.intent==='UNCLASSIFIED')return [...gaps,{outcome:null,reason:'当前请求没有可验证的结构化完成要求；已有工具结果不等于整个任务完成'}]
 const historyMatches=(m:any,hours:number)=>m.history?.hours===hours&&m.history.end===task.as_of&&Date.parse(m.history.start)===Date.parse(task.as_of)-hours*3600000
 const metricMatches=(e:Evidence,r:RequiredOutcome)=>{
  if(e.device_id!==r.device_id||!Array.isArray(e.data.metrics))return false
  if(!r.metric_keys?.length)return e.data.outcome==='NO_DEFINED_METRICS'&&e.data.metrics.length===0
  return r.metric_keys.every(key=>e.data.metrics.some((m:any)=>m.metric_key===key&&m.latest?.scopeId===r.device_id&&m.latest?.metricKey===key&&m.latest?.snapshotId===task.snapshot_id&&(!r.hours||historyMatches(m,r.hours))))
 }
 for(const r of requirements.outcomes){let satisfied=false
  switch(r.kind){
   case 'details':satisfied=valid.some(e=>e.tool_name==='device.get_details'&&e.device_id===r.device_id&&e.data.id===r.device_id);break
   case 'metrics':satisfied=r.metric_keys?.length? r.metric_keys.every(key=>valid.some(e=>e.tool_name==='device.get_metrics'&&metricMatches(e,{...r,metric_keys:[key]}))):valid.some(e=>e.tool_name==='device.get_metrics'&&metricMatches(e,r));break
   case 'focus':{const e=valid.filter(e=>e.tool_name.startsWith('scene.')).at(-1);satisfied=e?.tool_name==='scene.focus_device'&&e.device_id===r.device_id&&e.data.selected_id===r.device_id&&e.data.arrival_verified===true&&e.data.rendered_frame>0;break}
   case 'overview':{const e=valid.filter(e=>e.tool_name.startsWith('scene.')).at(-1);satisfied=e?.tool_name==='scene.reset_view'&&e.data.selected_id===null&&e.data.arrival_verified===true&&e.data.rendered_frame>0;break}
   case 'trend':{const e=valid.filter(e=>e.tool_name==='chart.show_trend').at(-1),shown=e?.data.shown;satisfied=!!e&&metricMatches(e,r)&&e.data.hours===r.hours&&shown?.displayed===true&&shown.snapshot_id===task.snapshot_id&&shown.metric_key===r.metric_keys?.[0]&&shown.hours===r.hours&&shown.evidence_id===e.evidence_id;break}
   case 'alarms':satisfied=(r.scope??[]).every(id=>valid.some(e=>e.tool_name==='alarm.list'&&e.data.scope?.includes(id)));break
  }
  if(!satisfied)gaps.push({outcome:r,reason:[r.device_id??r.scope?.join('、')??'当前视图',({focus:'相机到位、设备选中及实际绘制',overview:'总览复位及实际绘制',details:'设备资料查询结果',metrics:'指标查询结果',trend:'趋势的实际展示回执',alarms:'告警查询覆盖'} as const)[r.kind],r.metric_keys?.join('、'),r.hours?`${r.hours}h（截至 ${task.as_of}）`:null].filter(Boolean).join(' · ')})
 }
 if(requirements.intent==='DO_ALARM'){
  const alarms=new Map<string,any>();for(const e of valid)if(e.tool_name==='alarm.list')for(const a of e.data.alarms??[])if(a.deviceId===BASIN_ID&&a.metricKey==='do')alarms.set(a.alarmId,a)
  for(const [id] of alarms)if(!valid.some(e=>e.tool_name==='alarm.inspect'&&e.data.alarm?.alarmId===id&&e.device_id===BASIN_ID&&e.data.metric_key==='do'))gaps.push({outcome:null,reason:'低 DO 告警 '+id+' 的实际触发依据尚未查询'})
 }
 return gaps
}
