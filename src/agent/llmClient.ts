import type {ModelMessage,ModelReply,ModelTransport} from './taskRunner'
import {AgentError} from './contracts'
export const requestModel:ModelTransport=async(messages,task,signal)=>{
 const deadline=AbortSignal.timeout(15000),combined=AbortSignal.any([signal,deadline])
 let response:Response
 try{response=await fetch('/api/agent/step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages,task:{task_id:task.task_id,snapshot_id:task.snapshot_id,scenario_id:task.scenario_id,as_of:task.as_of}}),signal:combined})}catch{if(signal.aborted)throw new AgentError('CANCELLED','模型请求已取消；不保证上游计算或计费停止');if(deadline.aborted)throw new AgentError('MODEL_TIMEOUT','模型网关请求超时，未回退Demo');throw new AgentError('MODEL_UNAVAILABLE','模型请求失败，未回退Demo')}
 const result=await response.json().catch(()=>({error:{code:'MODEL_PROTOCOL_ERROR',message:'网关响应不可解析'}}))
 if(!response.ok||result.error)throw Object.assign(new AgentError(result.error?.code??'MODEL_FAILED',result.error?.message??'模型调用失败'),{details:result.error?.details})
 return result as ModelReply
}
