import {createServer} from 'node:http'
import {providerTools,MODEL_POLICY,parseModelReply,validateMessages} from '../src/agent/llmProtocol.ts'
import {modelReceipt,classifyUpstream,MODEL_ERRORS} from './modelResponse.mjs'
const ENDPOINT='https://api.openai.com/v1/chat/completions'
export const GATEWAY_LIMITS={requestBytes:49152,responseBytes:131072,timeoutMs:12000,requestsPerTask:6,toolsPerTask:20,maxCompletionTokens:1200,perMinute:24}
const HOSTS=new Set(['127.0.0.1:8787','localhost:8787','127.0.0.1:4173','localhost:4173','127.0.0.1:5173','localhost:5173'])
const ORIGINS=new Set([...HOSTS].map(host=>'http://'+host))
export function configuration(env=process.env){return {apiKey:env.SMARTWATER_OPENAI_API_KEY??'',model:env.SMARTWATER_MODEL??''}}
export function status(config){const missing=[];if(!config.apiKey)missing.push('SMARTWATER_OPENAI_API_KEY');if(!config.model||!/^[A-Za-z0-9._:-]{1,80}$/.test(config.model))missing.push('SMARTWATER_MODEL');return {ready:missing.length===0,protocol:'openai-chat-completions',missing,limits:GATEWAY_LIMITS}}
const fail=(code,message,http=400)=>Object.assign(new Error(message),{code,http})
async function limitedText(stream,maximum){let size=0;const chunks=[];for await(const chunk of stream){const b=Buffer.from(chunk);size+=b.length;if(size>maximum)throw fail('PAYLOAD_TOO_LARGE','请求或响应超过大小限制',413);chunks.push(b)}return Buffer.concat(chunks).toString('utf8')}
export function createGateway(config=configuration(),fetcher=fetch){
 const sessions=new Map();let active=0,rate=[]
 const server=createServer(async(req,res)=>{
  const send=(http,body)=>{if(!res.destroyed&&!res.writableEnded){res.writeHead(http,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(config.apiKey?JSON.stringify(body).replaceAll(config.apiKey,'[REDACTED]'):JSON.stringify(body))}}
  try{
   if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||!HOSTS.has(req.headers.host))throw fail('LOCAL_ONLY','仅允许指定本地入口',403)
   const origin=req.headers.origin
   if(origin&&!ORIGINS.has(origin))throw fail('ORIGIN_REJECTED','来源不在白名单',403)
   if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin')}
   if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET, POST');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.writeHead(204);res.end();return}
   if(req.url==='/api/agent/status'&&req.method==='GET'){send(200,status(config));return}
   if(req.url!=='/api/agent/step'||req.method!=='POST')throw fail('NOT_FOUND','没有此接口',404)
   if(!origin)throw fail('ORIGIN_REQUIRED','模型调用必须来自本地页面',403)
   if(req.headers['content-type']?.split(';')[0]!=='application/json')throw fail('INVALID_REQUEST','仅接受JSON',415)
   if(!status(config).ready)throw fail('LLM_NOT_CONFIGURED','缺少服务端模型或凭据，未回退Demo',503)
   const body=JSON.parse(await limitedText(req,GATEWAY_LIMITS.requestBytes))
   if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['task','messages'].includes(k)))throw fail('INVALID_REQUEST','请求字段无效')
   const task=body.task
   if(!task||Object.keys(task).some(k=>!['task_id','snapshot_id','scenario_id','as_of'].includes(k))||typeof task.task_id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(task.task_id)||typeof task.snapshot_id!=='string'||task.snapshot_id.length>150||!['NORMAL','LOW_DO','MISSING_DATA'].includes(task.scenario_id)||typeof task.as_of!=='string'||!Number.isFinite(Date.parse(task.as_of)))throw fail('INVALID_REQUEST','任务快照标识无效')
   validateMessages(body.messages)
   const now=Date.now();for(const [key,s] of sessions)if(now-s.at>600000)sessions.delete(key);if(sessions.size>=128&&!sessions.has(task.task_id))throw fail('GATEWAY_BUSY','会话容量已满',429)
   const identity=JSON.stringify([task.snapshot_id,task.scenario_id,task.as_of]),session=sessions.get(task.task_id)??{count:0,identity,at:now};if(session.identity!==identity)throw fail('TASK_CONTEXT_MISMATCH','同一任务不能更换快照')
   if(session.count>=GATEWAY_LIMITS.requestsPerTask)throw fail('BUDGET_EXCEEDED','达到模型请求上限',429)
   rate=rate.filter(t=>now-t<60000);if(rate.length>=GATEWAY_LIMITS.perMinute||active>=1)throw fail('GATEWAY_BUSY','本地调用速率或并发已达上限',429)
   session.count++;sessions.set(task.task_id,session);rate.push(now);active++
   const controller=new AbortController();let timedOut=false;const timer=setTimeout(()=>{timedOut=true;controller.abort()},GATEWAY_LIMITS.timeoutMs),closed=()=>{if(!res.writableEnded)controller.abort()};res.on('close',closed)
   try{
    const started=Date.now(),upstream=await fetcher(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.apiKey},body:JSON.stringify({model:config.model,messages:[{role:'system',content:MODEL_POLICY},...body.messages],tools:providerTools(),tool_choice:'auto',parallel_tool_calls:true,max_completion_tokens:GATEWAY_LIMITS.maxCompletionTokens,response_format:{type:'json_object'},store:false,...(config.model==='gpt-6-luna'?{reasoning_effort:'none'}:{})}),signal:controller.signal,redirect:'error'})
    const raw=JSON.parse(await limitedText(upstream.body,GATEWAY_LIMITS.responseBytes)),receipt=modelReceipt(upstream,raw,config.model,started)
    if(!upstream.ok){const failure=classifyUpstream(upstream.status,raw);throw Object.assign(fail(failure.code,MODEL_ERRORS[failure.code],502),{safeDetails:{...receipt,upstream_error:failure.upstream_error}})}
    let reply;try{reply=parseModelReply(raw)}catch(error){error.safeDetails={...receipt,rejection:{code:error.code,reason:error.message,tool_call_count:Array.isArray(raw?.choices?.[0]?.message?.tool_calls)?raw.choices[0].message.tool_calls.length:0,finish_reason:['stop','length','tool_calls','content_filter'].includes(raw?.choices?.[0]?.finish_reason)?raw.choices[0].finish_reason:'UNKNOWN'}};throw error}send(200,{...reply,receipt})
   }catch(error){if(controller.signal.aborted)throw fail(timedOut?'MODEL_TIMEOUT':'REQUEST_CANCELLED',timedOut?'模型请求超时':'本地请求已取消；不保证上游计算或计费停止',timedOut?504:499);if(error?.cause?.code==='UND_ERR_CONNECT_TIMEOUT'||error?.code==='ETIMEDOUT')throw fail('MODEL_NETWORK_TIMEOUT',MODEL_ERRORS.MODEL_NETWORK_TIMEOUT,504);throw error}
   finally{active--;clearTimeout(timer);res.removeListener('close',closed)}
  }catch(error){const allowed=new Set(['LOCAL_ONLY','ORIGIN_REJECTED','ORIGIN_REQUIRED','NOT_FOUND','INVALID_REQUEST','LLM_NOT_CONFIGURED','PAYLOAD_TOO_LARGE','TASK_CONTEXT_MISMATCH','BUDGET_EXCEEDED','GATEWAY_BUSY','MODEL_TIMEOUT','REQUEST_CANCELLED','MODEL_PROTOCOL_ERROR','TOOL_NOT_ALLOWED','INVALID_ARGUMENTS',...Object.keys(MODEL_ERRORS)]);const code=allowed.has(error?.code)?error.code:'MODEL_UNAVAILABLE';send(error?.http??(allowed.has(error?.code)?400:502),{error:{code,message:({LLM_NOT_CONFIGURED:'缺少服务端凭据或模型配置；未回退Demo',BUDGET_EXCEEDED:'达到调用预算上限',ORIGIN_REJECTED:'来源不在本地白名单',ORIGIN_REQUIRED:'缺少本地页面来源',LOCAL_ONLY:'仅允许指定本地入口',PAYLOAD_TOO_LARGE:'请求或响应超过大小限制',MODEL_TIMEOUT:'模型请求超时',REQUEST_CANCELLED:'本地请求已取消；不保证上游计算或计费停止',GATEWAY_BUSY:'本地网关调用上限已达',...MODEL_ERRORS}[code]??'请求未完成，错误详情已脱敏；未回退Demo'),...(error?.safeDetails?{details:error.safeDetails}:{})}})}
 })
 server.headersTimeout=5000;server.requestTimeout=15000;server.keepAliveTimeout=5000;return server
}
