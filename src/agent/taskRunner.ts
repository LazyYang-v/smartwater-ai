import type {ActionRecord,ToolCall} from './types.ts'
import {AgentError,validateTool} from './contracts.ts'
import type {Evidence,QueryContext} from './businessTools.ts'
import {summarizeDevice,evidenceScope} from './evidenceSummary.ts'
import {resolveRequirements,requirementGaps,type TaskRequirements} from './taskRequirements.ts'
import {UNITS} from '../scene/units.ts'
import {BASIN_ID,BLOWER_ID,PUMP_ID,RULES,type Snapshot} from '../data/mockDataProvider.ts'
export const TASK_LIMITS={modelRequests:6,toolCalls:20,deadlineMs:120000,snapshots:10} as const
export const TASK_TEMPLATES=['定位一号鼓风机，查看最近六小时功率。','查看一号曝气池的低溶解氧告警，告诉我触发依据。','巡检当前四个单元，列出异常和缺少的数据。','检查提升泵运行是否正常。']
export type TaskStatus='RUNNING'|'SUCCEEDED'|'PARTIAL'|'FAILED'|'CANCELLED'
export type AgentTask={task_id:string;parent_task_id?:string;scenario_id:string;snapshot_id:string;as_of:string;started_at:string;finished_at:string|null;mode:'DEMO'|'LLM';input:string;status:TaskStatus;tool_count:number;model_requests:number;evidence:Evidence[];action_ids:string[];errors:{code:string;message:string;tool?:string;device_id?:string;details?:Record<string,unknown>}[];model_receipts:ModelReceipt[];model_feedback:{request:number;missing_outcomes:string[]}[];explanation:string;scope:string[];requirements?:TaskRequirements;data_mode?:'BUSINESS_API';data_version?:string;rule_snapshot?:{lowDo:{id:string;below:number;unit:string;label:string;version?:string}}}
export type ModelMessage={role:'user'|'assistant'|'tool';content:string|null;tool_calls?:{id:string;type:'function';function:{name:string;arguments:string}}[];tool_call_id?:string}
export type ModelReceipt={provider:string;model:string;request_id:string|null;response_id:string|null;http_status:number;elapsed_ms:number;usage:Record<string,number|undefined>|'UNKNOWN'}
export type ModelReply={receipt?:ModelReceipt;message:ModelMessage;calls:{id:string;call:ToolCall}[];explanation?:string;evidence_ids?:string[]}
export type ModelTransport=(messages:ModelMessage[],task:Pick<AgentTask,'task_id'|'snapshot_id'|'scenario_id'|'as_of'>,signal:AbortSignal)=>Promise<ModelReply>
export type Finding={device_id:string;name:string;verdict:string;metrics:any[];alarms:any[];evidence_ids:string[];limitations:string[]}
export function findings(task:AgentTask):Finding[]{
 return UNITS.filter(u=>evidenceScope(task).includes(u.id)).map(unit=>{
  const summary=summarizeDevice(task,unit.id,task.rule_snapshot??RULES,task.errors.some(e=>e.tool==='device.get_metrics'&&e.device_id===unit.id))
  return {...summary,device_id:unit.id,name:unit.name,verdict:summary.conclusion}
 })
}
export function validateExplanation(explanation:string,evidence:Evidence[]){
 const known=new Set(evidence.map(e=>e.evidence_id)),embedded=explanation.match(/EV_[A-Za-z0-9_]+/g)??[]
 let prose=explanation.replace(/EV_[A-Za-z0-9_]+/g,'')
 // Only verbatim application-owned alarm rules may carry numeric literals.
 const rules=evidence.flatMap(e=>e.tool_name==='alarm.inspect'?[e.data.rule_label]:e.tool_name==='alarm.list'?(e.data.alarms??[]).map((a:any)=>a.rule):[]).filter((rule:unknown):rule is string=>typeof rule==='string'&&rule.length>0)
 for(const rule of rules)for(const literal of [rule,rule.split(' · ')[0]!])prose=prose.split(literal).join('')
 prose=prose.replace(/(?:(?:不能|无法|不可|不足以|无从|未能|不)(?:据此)?(?:证明|说明|表明|代表|等于|意味着|确认|认定|判断|判定|保证|视为|认为|作为|构成|断言)|(?:没有|缺乏|尚无)(?:足够)?(?:证据|依据)(?:能够|可以)?(?:证明|说明|表明|确认|认定)|不是)(?:(?:设备|整体|一号|提升泵|鼓风机|曝气池|二沉池|其|该|这些|当前|是否|的|真实|现场|实际|任何|运行|健康|保证)){0,12}(?:运行正常|设备正常|无异常|运行良好|健康认证)(?:与否)?/g,'')
 prose=prose.replace(/(?:不|不会|不得|未)(?:提供|给出|提出|进行|执行)(?:(?:任何|具体|现场|设备|运行|控制|操作|参数|自动)){0,8}(?:建议|调频|调阀|自动控制|健康认证)/g,'')
 if(embedded.some(id=>!known.has(id))||/[0-9０-９]|调频|调阀|自动控制|健康认证|运行正常|设备正常|无异常|运行良好|故障原因为|导致|建议/.test(prose))throw Object.assign(new AgentError('UNSUPPORTED_MODEL_CLAIM','模型解释含未受支持的数值、状态或控制结论；以结构化工具结果为准'),{details:{rejected_explanation:explanation.slice(0,1200),kind:'FINAL_OUTPUT_NOT_INTERNAL_REASONING'}})
}
function frozen<T>(snapshot:T){const copy=structuredClone(snapshot);const freeze=(v:any)=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v)}};freeze(copy);return copy}
export class AgentTaskRunner{
 readonly tasks:AgentTask[]=[]
 private snapshots=new Map<string,Snapshot>();private controller:AbortController|null=null;private current:AgentTask|null=null;private evidenceSequence=0;private replayController:AbortController|null=null;private replayEpoch=0
 constructor(privateOptions:{snapshot:()=>Snapshot;dispatch:(call:ToolCall,id:string,context:Record<string,string>,signal:AbortSignal)=>Promise<ActionRecord>;cancelScene:(reason:string)=>void;transport?:ModelTransport;changed:()=>void;onEvent?:(kind:'created'|'terminal',task:AgentTask)=>void},limits:Partial<{modelRequests:number;toolCalls:number;deadlineMs:number;snapshots:number}>={}){this.options=privateOptions;this.limits={...TASK_LIMITS,...limits}}
 private options:{snapshot:()=>Snapshot;dispatch:(call:ToolCall,id:string,context:Record<string,string>,signal:AbortSignal)=>Promise<ActionRecord>;cancelScene:(reason:string)=>void;transport?:ModelTransport;changed:()=>void;onEvent?:(kind:'created'|'terminal',task:AgentTask)=>void}
 private limits:{modelRequests:number;toolCalls:number;deadlineMs:number;snapshots:number}
 private notify(kind:'created'|'terminal',task:AgentTask){try{this.options.onEvent?.(kind,task)}catch{/* Persistence observers must never change execution outcomes. */}}
 get active(){return this.current}
 context():QueryContext{
  const task=this.current,snapshot=task&&this.snapshots.get(task.task_id)
  if(!task||task.status!=='RUNNING'||!snapshot){const live=this.options.snapshot();return {task_id:'UI_'+crypto.randomUUID(),snapshot:live,nextEvidence:()=>`EV_UI_${crypto.randomUUID().replaceAll('-','')}`,findEvidence:()=>undefined,assertActive:()=>{}}}
  return this.forTask(task,snapshot,this.controller!.signal)
 }
 private forTask(task:AgentTask,snapshot:Snapshot,signal:AbortSignal):QueryContext{return {task_id:task.task_id,snapshot,nextEvidence:()=>`EV_${task.task_id.replaceAll('-','').slice(0,12)}_${++this.evidenceSequence}`,findEvidence:id=>task.evidence.find(e=>e.evidence_id===id),assertActive:()=>{if(signal.aborted||this.current!==task||task.status!=='RUNNING')throw new AgentError('CANCELLED','任务已失效')}}}
 cancel(code='CANCELLED',message='用户取消任务'){
  this.replayEpoch++;this.replayController?.abort({code,message});this.replayController=null
  if(this.current?.status!=='RUNNING')return
  this.current.status='CANCELLED';this.current.errors.push({code,message});this.current.finished_at=new Date().toISOString();this.controller?.abort({code,message});this.options.cancelScene(message);this.options.changed();this.notify('terminal',this.current)
 }
 async start(input:string,mode:'DEMO'|'LLM'='DEMO',parentTaskId?:string){
  this.cancel('CANCELLED','新任务接管前台');const snapshot=frozen(this.options.snapshot()),controller=new AbortController();this.controller=controller;this.evidenceSequence=0
  const task:AgentTask={task_id:crypto.randomUUID(),...(parentTaskId?{parent_task_id:parentTaskId}:{}),scenario_id:snapshot.scenario,snapshot_id:snapshot.snapshotId,as_of:snapshot.demoTime,started_at:new Date().toISOString(),finished_at:null,mode,input,...(snapshot.backend?{data_mode:'BUSINESS_API' as const,data_version:snapshot.version,rule_snapshot:snapshot.backend.rules}:{}),status:'RUNNING',tool_count:0,model_requests:0,evidence:[],action_ids:[],errors:[],model_receipts:[],model_feedback:[],explanation:'',scope:[],requirements:frozen(resolveRequirements(typeof input==='string'?input:''))};this.current=task;this.tasks.push(task);this.snapshots.set(task.task_id,snapshot);while(this.snapshots.size>this.limits.snapshots)this.snapshots.delete(this.snapshots.keys().next().value!)
  this.notify('created',task);this.options.changed();const deadline=setTimeout(()=>this.current===task&&this.cancel('TIMEOUT','任务超过总时限'),this.limits.deadlineMs)
  try{
   if(typeof input!=='string'||!input.trim()||input.length>1000)throw new AgentError('INVALID_INPUT','任务文本需为1–1000字符')
   if(task.requirements?.issues.length)throw new AgentError('UNVERIFIABLE_TASK_REQUIREMENTS',task.requirements.issues.join('；'))
   if(mode==='LLM')await this.runModel(task,controller.signal);else await this.runDemo(task,controller.signal)
   if(!controller.signal.aborted&&this.current===task){this.checkCompletion(task);task.status=task.errors.length?(task.evidence.length?'PARTIAL':'FAILED'):'SUCCEEDED';task.explanation||=task.evidence.length?'以下结论仅引用实际工具证据，不代表现场巡检或设备健康认证。':'未取得可用证据。'}
  }catch(error){if(!controller.signal.aborted&&this.current===task){const e=error as {code?:string;message?:string;details?:Record<string,unknown>};task.errors.push({code:e.code??'TASK_FAILED',message:e.message??'任务失败',...(e.details?{details:e.details}:{})});task.status=task.evidence.length?'PARTIAL':'FAILED';if(task.evidence.length)this.checkCompletion(task)}}
  finally{clearTimeout(deadline);task.finished_at??=new Date().toISOString();this.options.changed();this.notify('terminal',task)}
  return task
 }
 private async tool(task:AgentTask,call:ToolCall,signal:AbortSignal,origin:Record<string,string>={}):Promise<Evidence|null>{
  if(signal.aborted||this.current!==task)throw new AgentError('CANCELLED','任务已取消')
  if(task.tool_count>=this.limits.toolCalls)throw new AgentError('BUDGET_EXCEEDED','达到工具调用上限')
  task.tool_count++;validateTool(call.tool_name,call.arguments)
  if(call.arguments.device_id&&!task.scope.includes(String(call.arguments.device_id)))task.scope.push(String(call.arguments.device_id))
  const actionId=task.task_id+':'+task.tool_count;task.action_ids.push(actionId);this.options.changed()
  const record=await this.options.dispatch(call,actionId,{source:task.mode==='LLM'?'LLM':'DEMO_AGENT',trigger:task.mode==='LLM'?'模型工具调用':'确定性任务模板',task_id:task.task_id,snapshot_id:task.snapshot_id,as_of:task.as_of,...origin},signal)
  if(signal.aborted||this.current!==task)throw new AgentError('CANCELLED','任务已取消')
  if(record.status==='CANCELLED'){this.cancel(record.error?.code??'CANCELLED',record.error?.message??'展示动作被中断');throw new AgentError('CANCELLED','展示动作已取消')}
  if(record.status!=='SUCCEEDED'){task.errors.push({code:record.error?.code??'TOOL_FAILED',message:record.error?.message??'工具失败',tool:call.tool_name,...(call.arguments.device_id?{device_id:String(call.arguments.device_id)}:{})});this.options.changed();return null}
  const evidence=record.result as Evidence;task.evidence.push(evidence);this.options.changed();return evidence
 }
 private async runDemo(task:AgentTask,signal:AbortSignal){
  const text=task.input.trim().replace(/[。！!？?]+$/u,''),call=(tool_name:ToolCall['tool_name'],args:Record<string,unknown>)=>this.tool(task,{tool_name,arguments:args},signal)
  if(text==='定位一号鼓风机，查看最近六小时功率'||text==='定位一号鼓风机,查看最近六小时功率'){
   await call('scene.focus_device',{device_id:BLOWER_ID});const query=await call('device.get_metrics',{device_id:BLOWER_ID,metric_keys:['blower_power'],hours:6});if(query)await call('chart.show_trend',{device_id:BLOWER_ID,metric_key:'blower_power',hours:6,evidence_id:query.evidence_id})
  }else if(text==='查看一号曝气池的低溶解氧告警，告诉我触发依据'){
   const list=await call('alarm.list',{device_id:BASIN_ID});if(list?.data.alarms.length)await call('alarm.inspect',{alarm_id:list.data.alarms[0].alarmId})
   const query=await call('device.get_metrics',{device_id:BASIN_ID,metric_keys:['do'],hours:6});if(query)await call('chart.show_trend',{device_id:BASIN_ID,metric_key:'do',hours:6,evidence_id:query.evidence_id})
   if(list&&!list.data.alarms.length)task.explanation='该快照未查到告警记录；没有告警不等于设备正常。依据 '+list.evidence_id
  }else if(text==='巡检当前四个单元，列出异常和缺少的数据'){
   for(const unit of UNITS){await call('device.get_details',{device_id:unit.id});await call('device.get_metrics',{device_id:unit.id})}const alarms=await call('alarm.list',{});if(alarms)task.scope=UNITS.map(u=>u.id)
  }else if(text==='检查提升泵运行是否正常'){
   await call('device.get_details',{device_id:PUMP_ID});await call('device.get_metrics',{device_id:PUMP_ID});task.explanation='有模型和设备资料，但缺少运行指标，当前无法判断。依据 '+task.evidence.map(e=>e.evidence_id).join('、')
  }else {const {parseCommand}=await import('./demoParser.ts');const one=parseCommand(text);if(!one)throw new AgentError('UNSUPPORTED_TASK','确定性演示仅支持四个任务模板及已有定位/复位口令');await this.tool(task,one,signal)}
 }
 private completionGaps(task:AgentTask){return requirementGaps(task.requirements??resolveRequirements(task.input),task)}
 private checkCompletion(task:AgentTask){const absent=this.completionGaps(task);if(absent.length)task.errors.push({code:'INCOMPLETE_TASK',message:'尚未确认要求：'+absent.map(r=>r.reason).join('；')})}
 private async runModel(task:AgentTask,signal:AbortSignal){
  if(!this.options.transport)throw new AgentError('LLM_NOT_CONFIGURED','没有可用模型配置，未回退Demo')
  const messages:ModelMessage[]=[{role:'user',content:JSON.stringify({task:task.input,task_id:task.task_id,scenario_id:task.scenario_id,snapshot_id:task.snapshot_id,as_of:task.as_of,requirements:task.requirements,devices:UNITS.map(u=>({device_id:u.id,name:u.name,metrics:u.metrics}))})}]
  while(true){
   if(signal.aborted)throw new AgentError('CANCELLED','请求已取消')
   if(task.model_requests>=this.limits.modelRequests)throw new AgentError('BUDGET_EXCEEDED','达到模型请求上限')
   task.model_requests++;this.options.changed();const reply=await this.options.transport(messages,task,signal)
   if(signal.aborted||this.current!==task)throw new AgentError('CANCELLED','迟到模型回复已丢弃')
   if(reply.receipt)task.model_receipts.push(reply.receipt);this.options.changed();messages.push(reply.message)
   if(!reply.calls.length){
    const refs=reply.evidence_ids??[];if(!task.evidence.length||!refs.length||refs.some(id=>!task.evidence.some(e=>e.evidence_id===id)))throw new AgentError('INVALID_EVIDENCE_REFERENCE','模型没有引用本任务的真实证据')
    const explanation=reply.explanation??'';validateExplanation(explanation,task.evidence)
    const missing=this.completionGaps(task)
    if(task.requirements?.intent==='UNCLASSIFIED')throw new AgentError('UNVERIFIED_TASK_REQUIREMENTS','当前请求的完整完成条件尚未识别，保留实际结果但不能宣告全部完成')
    if(missing.length){
     const missing_outcomes=missing.map(r=>r.reason)
     task.model_feedback.push({request:task.model_requests,missing_outcomes});this.options.changed()
     messages.push({role:'user',content:'应用尚未确认这些用户需求结果：'+missing_outcomes.join('；')+'。请继续自主选择可用工具补齐实际结果，不能用口头完成声明代替；展示仅改变受控界面，不是现场控制。仍沿用同一任务快照与原调用预算。'})
     continue
    }
    task.explanation=explanation+' 依据 '+refs.join('、');return
   }
   for(const proposed of reply.calls){const result=await this.tool(task,proposed.call,signal,{model_call_id:proposed.id,model_request_id:reply.receipt?.request_id??reply.receipt?.response_id??'UNKNOWN',model_request_index:String(task.model_requests)});messages.push({role:'tool',tool_call_id:proposed.id,content:JSON.stringify(result??{error:task.errors.at(-1),snapshot_id:task.snapshot_id,source:'SIMULATED'})})}
  }
 }
 async replayTrend(task:AgentTask,evidenceId:string,display:(ctx:QueryContext,e:Evidence,signal:AbortSignal)=>Promise<unknown>){
  this.cancel('CANCELLED','用户查看历史证据趋势');const snapshot=this.snapshots.get(task.task_id);if(!snapshot)throw new AgentError('SNAPSHOT_EXPIRED','原始曲线仅保留最近十项任务，结果证据仍保留')
  if(snapshot.scenario!==this.options.snapshot().scenario)throw new AgentError('SCENARIO_CHANGED','当前场景不同，不能以旧场景覆盖当前趋势')
  const evidence=task.evidence.find(e=>e.evidence_id===evidenceId);if(!evidence)throw new AgentError('EVIDENCE_MISMATCH','找不到证据')
  const controller=new AbortController(),epoch=++this.replayEpoch;this.replayController=controller
  try{return await display({task_id:task.task_id,snapshot,nextEvidence:()=>`EV_REPLAY_${crypto.randomUUID().replaceAll('-','')}`,findEvidence:id=>task.evidence.find(e=>e.evidence_id===id),assertActive:()=>{if(controller.signal.aborted||epoch!==this.replayEpoch||snapshot.scenario!==this.options.snapshot().scenario)throw new AgentError('CANCELLED','历史趋势展示已失效')}},evidence,controller.signal)}finally{if(this.replayController===controller)this.replayController=null}
 }
}
