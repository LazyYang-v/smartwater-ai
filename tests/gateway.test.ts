import {test} from 'node:test'
import assert from 'node:assert/strict'
import {request} from 'node:http'
import {createGateway,configuration,status} from '../server/gateway.mjs'
const config={apiKey:'unit-test-synthetic-not-a-credential',model:'test-model'}
const body=(id='task_1')=>({task:{task_id:id,snapshot_id:'test:NORMAL:0',scenario_id:'NORMAL',as_of:'2026-01-15T08:00:00Z'},messages:[{role:'user',content:'只读工具测试'}]})
async function serve(cfg:any=config,fetcher:any=async()=>Response.json({choices:[{message:{role:'assistant',content:JSON.stringify({explanation:'请查看证据',evidence_ids:['EV_fixture']})}}]})){
 const server=createGateway(cfg,fetcher);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address() as any
 const send=(data:any=body(),options:any={})=>new Promise<any>((resolve,reject)=>{const req=request({host:'127.0.0.1',port:address.port,path:options.path??'/api/agent/step',method:options.method??'POST',headers:{host:'127.0.0.1:8787',origin:'http://127.0.0.1:4173','content-type':'application/json',...options.headers}},res=>{let out='';res.on('data',c=>out+=c);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(out)}))});req.on('error',reject);req.end(data===null?undefined:JSON.stringify(data))})
 return {server,send,port:address.port,close:()=>new Promise<void>(r=>{server.closeAllConnections();server.close(()=>r())})}
}
test('gateway missing configuration reports only names and rejects model call without fallback',async()=>{
 assert.equal(status(configuration({})).ready,false);const s=await serve({apiKey:'',model:''});try{const info=await s.send(null,{method:'GET',path:'/api/agent/status'});assert.deepEqual(info.data.missing,['SMARTWATER_OPENAI_API_KEY','SMARTWATER_MODEL']);assert.equal((await s.send()).data.error.code,'LLM_NOT_CONFIGURED')}finally{await s.close()}
})
test('gateway fixes endpoint and protocol, limits origins, fields, bytes, task identity and six requests',async()=>{
 let upstream:any;const s=await serve(config,async(url:any,options:any)=>{upstream={url,options,body:JSON.parse(options.body)};return Response.json({choices:[{message:{role:'assistant',content:JSON.stringify({explanation:'查看证据',evidence_ids:['EV_fixture']})}}]})});try{
  assert.equal((await s.send(body(),{headers:{origin:'https://evil.invalid'}})).status,403)
  assert.equal((await s.send({...body(),url:'https://evil.invalid'})).data.error.code,'INVALID_REQUEST')
  assert.equal((await s.send({...body(),messages:[{role:'user',content:'x'.repeat(50000)}]})).status,413)
  for(let i=0;i<6;i++)assert.equal((await s.send()).status,200)
  assert.equal((await s.send()).data.error.code,'BUDGET_EXCEEDED');assert.equal(upstream.url,'https://api.openai.com/v1/chat/completions');assert.equal(upstream.body.parallel_tool_calls,true);assert.equal(upstream.body.tools.length,7);assert.equal(upstream.body.max_completion_tokens,1200);assert.equal(upstream.options.redirect,'error');assert.ok(!JSON.stringify(upstream.body).includes(config.apiKey))
  assert.equal((await s.send({...body(),task:{...body().task,snapshot_id:'changed'}})).data.error.code,'TASK_CONTEXT_MISMATCH')
 }finally{await s.close()}
})
test('upstream exceptions and unsupported tools are sanitized, client disconnect aborts local upstream request',async()=>{
 const broken=await serve(config,async()=>{throw new Error('SECRET-'+config.apiKey)});try{const r=await broken.send();assert.equal(r.data.error.code,'MODEL_UNAVAILABLE');assert.ok(!JSON.stringify(r).includes(config.apiKey))}finally{await broken.close()}
 let aborted=false,started:()=>void=()=>{};const began=new Promise<void>(r=>started=r);const s=await serve(config,async(_:any,{signal}:any)=>{started();return new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new Error('aborted'))},{once:true}))});try{const req=request({host:'127.0.0.1',port:s.port,path:'/api/agent/step',method:'POST',headers:{host:'127.0.0.1:8787',origin:'http://127.0.0.1:4173','content-type':'application/json'}});req.on('error',()=>{});req.end(JSON.stringify(body()));await began;req.destroy();await new Promise(r=>setTimeout(r,30));assert.equal(aborted,true)}finally{await s.close()}
})

test('live-model compatible request uses explicit none effort and returns safe usage/request receipt',async()=>{
 let payload:any;const s=await serve({...config,model:'gpt-6-luna'},async(_:any,options:any)=>{payload=JSON.parse(options.body);return Response.json({id:'chatcmpl_fixture',model:'gpt-6-luna',usage:{prompt_tokens:20,completion_tokens:4,total_tokens:24,completion_tokens_details:{reasoning_tokens:0}},choices:[{message:{role:'assistant',content:JSON.stringify({explanation:'查看依据',evidence_ids:['EV_fixture']})}}]},{headers:{'x-request-id':'req_fixture'}})});try{const r=await s.send();assert.equal(r.status,200);assert.equal(payload.reasoning_effort,'none');assert.equal(payload.tool_choice,'auto');assert.equal(r.data.receipt.request_id,'req_fixture');assert.equal(r.data.receipt.response_id,'chatcmpl_fixture');assert.equal(r.data.receipt.usage.total_tokens,24);assert.equal(r.data.receipt.usage.reasoning_tokens,0);assert.ok(!JSON.stringify(r).includes(config.apiKey))}finally{await s.close()}
})
test('provider error body distinguishes quota, limits, model access, parameters and auth without secret echo',async()=>{
 for(const [http,upstream,expected] of [[429,{code:'insufficient_quota',type:'insufficient_quota'},'MODEL_QUOTA_EXCEEDED'],[429,{code:'rate_limit_exceeded'},'MODEL_RATE_LIMITED'],[404,{code:'model_not_found'},'MODEL_NOT_AVAILABLE'],[400,{type:'invalid_request_error',param:'reasoning_effort'},'MODEL_INVALID_REQUEST'],[401,{code:'invalid_api_key'},'MODEL_AUTH_FAILED'],[403,{code:'permission_denied'},'MODEL_ACCESS_DENIED'],[500,{code:'server_error'},'MODEL_UPSTREAM_ERROR']] as const){const s=await serve(config,async()=>Response.json({error:{...upstream,message:'echo '+config.apiKey}},{status:http,headers:{'x-request-id':'req_error'}}));try{const r=await s.send();assert.equal(r.data.error.code,expected);assert.equal(r.data.error.details.request_id,'req_error');assert.equal(r.data.error.details.http_status,http);assert.ok(!JSON.stringify(r).includes(config.apiKey));assert.ok(!JSON.stringify(r).includes('echo'))}finally{await s.close()}}
})
test('connection timeout is distinct from upstream authentication and masked injected details never leak',async()=>{
 const s=await serve(config,async()=>{throw Object.assign(new Error('network'),{cause:{code:'UND_ERR_CONNECT_TIMEOUT'},details:{Authorization:'Bearer '+config.apiKey}})});try{const r=await s.send();assert.equal(r.data.error.code,'MODEL_NETWORK_TIMEOUT');assert.ok(!JSON.stringify(r).includes(config.apiKey));assert.equal(r.data.error.details,undefined)}finally{await s.close()}
})

test('rejected model protocol still preserves actual request id and usage, without response reasoning',async()=>{
 const s=await serve(config,async()=>Response.json({id:'chatcmpl_rejected',model:'test-model',usage:{prompt_tokens:30,completion_tokens:10,total_tokens:40},choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,reasoning_content:'private fixture reasoning',tool_calls:Array.from({length:21},(_,i)=>({id:'call_'+i,type:'function',function:{name:'alarm_list',arguments:'{}'}}))}}]},{headers:{'x-request-id':'req_rejected'}}));try{const r=await s.send();assert.equal(r.data.error.code,'MODEL_PROTOCOL_ERROR');assert.equal(r.data.error.details.request_id,'req_rejected');assert.equal(r.data.error.details.usage.total_tokens,40);assert.equal(r.data.error.details.rejection.tool_call_count,21);assert.ok(!JSON.stringify(r).includes('private fixture reasoning'))}finally{await s.close()}
})
