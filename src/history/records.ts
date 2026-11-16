import type {AgentTask} from '../agent/taskRunner.ts'
import type {ActionRecord} from '../agent/types.ts'
import type {Evidence} from '../agent/businessTools.ts'
import {DATA_VERSION,RULES} from '../data/mockDataProvider.ts'
import {UNITS} from '../scene/units.ts'
export type ExecutionStatus=AgentTask['status']|'INTERRUPTED'
export type SaveState={status:'SAVING'|'SAVED'|'ERROR';message:string}
export type TaskArchive={schema_version:1;task:AgentTask;execution_status:ExecutionStatus;steps:ActionRecord[];rules:typeof RULES;data_version:string;catalog:{id:string;name:string;metrics:string[]}[];report_id:string|null;revision:number;interrupted_at?:string}
export type TaskSummary={task_id:string;parent_task_id?:string;input:string;started_at:string;mode:'DEMO'|'LLM';model:string;execution_status:ExecutionStatus;completed_steps:number;total_steps:number;report_id:string|null}
const SECRET_FIELD=/^(?:authorization|headers?|api[_-]?key|.*secret.*|.*token|environment|reasoning|chain_of_thought)$/i
export function safeText(s:string){return s.replace(/\bsk-[A-Za-z0-9_-]{8,}/g,'[REDACTED]').replace(/Bearer\s+[^\s"<>]+/gi,'[REDACTED]').replace(/((?:[A-Z_]*API_KEY|api[_-]?key)\s*[=:]\s*)[^\s"<>]+/gi,'$1[REDACTED]')}
// Only allowlisted domain payloads enter the archive. Never serialize live application state.
function clean(value:unknown,depth=0):any{if(depth>16)return '[DEPTH_LIMIT]';if(value===null||typeof value==='boolean')return value;if(typeof value==='number')return Number.isFinite(value)?value:null;if(typeof value==='string')return safeText(value).slice(0,20000);if(Array.isArray(value))return value.slice(0,500).map(v=>clean(v,depth+1));if(value&&Object.getPrototypeOf(value)===Object.prototype)return Object.fromEntries(Object.entries(value).filter(([key])=>!SECRET_FIELD.test(key)).map(([k,v])=>[k,clean(v,depth+1)]));return undefined}
function pick(value:any,keys:string[]){return Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,clean(value[k])]))}
const DATA_KEYS:Record<string,string[]>={
 'device.get_details':['id','name','description','modelStatus','metrics','unit_id','asset_root_node','mechanical_node','available_metrics','model_load_state','operating_state','limitation'],
 'device.get_metrics':['outcome','device_name','device_id','metrics','limitation','hours'],
 'alarm.list':['alarms','scope','limitation'],
 'alarm.inspect':['alarm','metric_key','unit','threshold','operator','rule_id','rule_label','trigger_comparison','event_quality','event_quality_basis','current_quality','current_value','limitation'],
 'chart.show_trend':['device_id','metrics','shown','query_evidence_id','reference_kind','hours','limitation'],
 'scene.focus_device':['selected_id','camera','target','zoom','rendered_frame','arrival_verified','device_id','roof_presentation'],
 'scene.reset_view':['selected_id','camera','target','zoom','rendered_frame','arrival_verified','roof_presentation'],
}
export function archiveEvidence(value:any):Evidence|null{if(!value||!DATA_KEYS[value.tool_name]||typeof value.evidence_id!=='string')return null;return {...pick(value,['evidence_id','tool_name','task_id','snapshot_id','scenario_id','as_of','source','quality','device_id','metric_key','unit']),data:pick(value.data,DATA_KEYS[value.tool_name]!)} as Evidence}
export function archiveStep(step:ActionRecord):ActionRecord{const args=pick(step.arguments,['device_id','metric_keys','metric_key','hours','evidence_id','alarm_id']);return {...pick(step,['action_id','tool_name','status','started_at','finished_at','source','trigger','task_id','snapshot_id','as_of','model_call_id','model_request_id','model_request_index']),arguments:args,...(step.result?{result:archiveEvidence(step.result)}:{}),...(step.error?{error:pick(step.error,['code','message'])}:{})} as ActionRecord}
export function captureTask(task:AgentTask,previous?:TaskArchive,steps:ActionRecord[]=[]):TaskArchive{
 const copy={...pick(task,['task_id','parent_task_id','scenario_id','snapshot_id','as_of','started_at','finished_at','mode','input','status','tool_count','model_requests','action_ids','explanation','scope']),errors:task.errors.map(e=>pick(e,['code','message','tool'])),evidence:task.evidence.map(archiveEvidence).filter(Boolean),model_receipts:task.model_receipts.map(r=>pick(r,['provider','model','request_id','response_id','http_status','elapsed_ms','usage'])),model_feedback:task.model_feedback.map(f=>pick(f,['request','missing_outcomes']))} as AgentTask
 const savedSteps=steps.map(archiveStep)
 for(const step of savedSteps){const e=step.status==='SUCCEEDED'?archiveEvidence(step.result):null;if(e&&!copy.evidence.some(v=>v.evidence_id===e.evidence_id))copy.evidence.push(e)}
 return {schema_version:1,task:copy,execution_status:task.status,steps:savedSteps,rules:structuredClone(previous?.rules??RULES),catalog:structuredClone(previous?.catalog??UNITS.map(u=>({id:u.id,name:u.name,metrics:[...u.metrics]}))),data_version:previous?.data_version??DATA_VERSION,report_id:previous?.report_id??null,revision:(previous?.revision??0)+1}
}
export function summary(a:TaskArchive):TaskSummary{return {task_id:a.task.task_id,parent_task_id:a.task.parent_task_id,input:a.task.input,started_at:a.task.started_at,mode:a.task.mode,model:a.task.mode==='DEMO'?'未调用模型':a.task.model_receipts.length?[...new Set(a.task.model_receipts.map(r=>r.provider+' / '+r.model))].join(', '):'未知（未取得上游回执）',execution_status:a.execution_status,completed_steps:a.steps.filter(s=>s.status==='SUCCEEDED').length,total_steps:a.task.tool_count,report_id:a.report_id}}
export const statusLabel=(s:string)=>({RUNNING:'执行中',SUCCEEDED:'已完成',PARTIAL:'部分完成',FAILED:'失败',CANCELLED:'已取消',INTERRUPTED:'执行中断 / 结果未确认',SAVING:'正在保存',SAVED:'已保存',ERROR:'保存失败',PENDING:'待执行'} as Record<string,string>)[s]??s
