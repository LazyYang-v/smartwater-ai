import {test} from 'node:test'
import assert from 'node:assert/strict'
import {businessToolSource} from '../src/api/businessToolSource.ts'
import {createBusinessTools,queryMetrics} from '../src/agent/businessTools.ts'
import {createSnapshot,BASIN_ID,PUMP_ID} from '../src/data/mockDataProvider.ts'
import {validateTool} from '../src/agent/contracts.ts'
import {AgentTaskRunner,TASK_TEMPLATES,findings} from '../src/agent/taskRunner.ts'
import {captureTask} from '../src/history/records.ts'
import {UNITS} from '../src/scene/units.ts'
import {ActionDispatcher} from '../src/agent/actionDispatcher.ts'
const signal=new AbortController().signal
function view(){const s=createSnapshot('LOW_DO');s.snapshotId='db-view-1';for(const r of [...Object.values(s.readings),...s.history.do,...s.history.blower_power])r.snapshotId=s.snapshotId;s.backend={snapshotId:s.snapshotId,revision:12,dataMode:'BUSINESS_API',source:'SIMULATED',devices:[],rules:{lowDo:{id:'DEMO_DO_LOW',below:2,unit:'mg/L',label:'DB rule',version:'demo-do-v1'}}};return s}
test('business query uses pinned API URL/version and rejects mismatching evidence; does not fall back to browser data',async()=>{
 const original=globalThis.fetch,snapshot=view(),context={task_id:'task',snapshot,nextEvidence:()=>'',findEvidence:()=>undefined,assertActive:()=>{}};const urls:string[]=[]
 try{
  globalThis.fetch=async(url,options)=>{urls.push(String(url));assert.equal(options?.credentials,'same-origin');return new Response(JSON.stringify({snapshot_id:snapshot.snapshotId,as_of:snapshot.demoTime,source:'SIMULATED',evidence_id:'EV_DB_actual',data:{metrics:[]}}))}
  const result=await businessToolSource('device.get_metrics',{device_id:BASIN_ID,metric_keys:['do'],hours:6},context,signal);assert.equal(result.evidence_id,'EV_DB_actual');assert.match(urls[0]!,/snapshots\/db-view-1\/devices\/SW_BIO_AERATION_001\/metrics\?metricKeys=do&hours=6/)
  globalThis.fetch=async()=>new Response(JSON.stringify({snapshot_id:'different',as_of:snapshot.demoTime,source:'SIMULATED',data:{}}));await assert.rejects(businessToolSource('alarm.list',{},context,signal),/版本/)
  globalThis.fetch=async()=>new Response(JSON.stringify({error:{code:'AUTH_REQUIRED',message:'登录已失效'}}),{status:401});await assert.rejects(businessToolSource('device.get_details',{device_id:PUMP_ID},context,signal),/登录已失效/)
 }finally{globalThis.fetch=original}
})
test('same dispatcher executes database-backed patrol, preserves server evidence and distinguishes unmonitored pump',async()=>{
 const snapshot=view(),handlers:any={},dispatcher=new ActionDispatcher(handlers);let runner:AgentTaskRunner,calls=0
 runner=new AgentTaskRunner({snapshot:()=>snapshot,dispatch:(c,id,m,s)=>dispatcher.dispatch(c,id,m,s),cancelScene:r=>dispatcher.cancel(r),changed:()=>{}})
 Object.assign(handlers,createBusinessTools(()=>runner.context(),{focus:async id=>({selected_id:id,arrival_verified:true,rendered_frame:1}),reset:async()=>({}),modelState:()=> 'ready',showTrend:async()=>({displayed:true})},async(name,args,ctx)=>{
  calls++;return {snapshot_id:ctx.snapshot.snapshotId,as_of:ctx.snapshot.demoTime,source:'SIMULATED',evidence_id:'EV_DB_'+calls,data:name==='device.get_metrics'?queryMetrics(snapshot,String(args.device_id),args.metric_keys as string[]|undefined,args.hours as number|undefined):name==='alarm.list'?{alarms:snapshot.alarms,scope:UNITS.map(u=>u.id)}:{id:String(args.device_id),name:String(args.device_id),available_metrics:args.device_id===BASIN_ID?['do','ph','depth']:[]}}
 }))
 const task=await runner.start(TASK_TEMPLATES[2]!);assert.equal(task.status,'SUCCEEDED');assert.equal(calls,9);assert.ok(task.evidence.every(e=>e.evidence_id.startsWith('EV_DB_')&&e.data_mode==='BUSINESS_API'));assert.match(findings(task).find(f=>f.device_id===PUMP_ID)!.verdict,/无法判断/);const archive=captureTask(task);assert.equal(archive.data_version,snapshot.version);assert.deepEqual(archive.rules,snapshot.backend!.rules);assert.equal(archive.task.evidence[0]!.data_mode,'BUSINESS_API')
})
test('business chart uses server statistics and still requires actual display receipt from existing presentation path',async()=>{
 const snapshot=view();let shown=0
 const tools=createBusinessTools(()=>({task_id:'a',snapshot,nextEvidence:()=> 'EV_client_chart',findEvidence:()=>undefined,assertActive:()=>{}}),{focus:async()=>({}),reset:async()=>({}),modelState:()=> 'ready',showTrend:async v=>{shown++;return {displayed:true,snapshot_id:v.context.snapshot.snapshotId,hours:v.hours,evidence_id:v.evidence_id}}},async(_name,_args,ctx)=>({evidence_id:'EV_DB_stats',snapshot_id:ctx.snapshot.snapshotId,as_of:ctx.snapshot.demoTime,source:'SIMULATED',data:{metrics:[{metric_key:'do',unit:'mg/L',latest:snapshot.readings.do,history:{hours:6,valid_samples:19,mean:1.23456}}]}}))
 const result:any=await tools['chart.show_trend']({device_id:BASIN_ID,metric_key:'do',hours:6},signal);assert.equal(result.data.metrics[0].history.valid_samples,19);assert.equal(result.data.metrics[0].history.mean,1.23456);assert.equal(result.backend_query_evidence_id,'EV_DB_stats');assert.equal(result.data.shown.displayed,true);assert.equal(shown,1)
})
test('independent collector produces stable SIMULATED acquisition records, missing nulls and exact 4.8m depth',async()=>{
 const {batch}=await import('../collector/simulator.mjs');const first=batch('MISSING_DATA',Date.parse('2026-11-17T00:00:00Z'))
 assert.deepEqual(first,batch('MISSING_DATA',Date.parse('2026-11-17T00:00:00Z')));assert.equal(first.find((r:any)=>r.metricKey==='do').value,null);assert.equal(first.find((r:any)=>r.metricKey==='depth').value,4.8);assert.ok(first.every((r:any)=>r.source==='SIMULATED'));assert.equal(first.length,4)
})

test('metrics contract rejects empty arrays before invoking the source; omitting the field still supports unmonitored devices',async()=>{
 assert.throws(()=>validateTool('device.get_metrics',{device_id:PUMP_ID,metric_keys:[]}),/INVALID_ARGUMENTS|非法/)
 validateTool('device.get_metrics',{device_id:PUMP_ID});let requests=0;const snapshot=view()
 const tools=createBusinessTools(()=>({task_id:'empty',snapshot,nextEvidence:()=> 'EV_empty',findEvidence:()=>undefined,assertActive:()=>{}}),{focus:async()=>({}),reset:async()=>({}),modelState:()=> 'ready',showTrend:async()=>({})},async(_name,_args,ctx)=>{requests++;return {snapshot_id:ctx.snapshot.snapshotId,as_of:ctx.snapshot.demoTime,source:'SIMULATED',evidence_id:'EV_DB_empty',data:{outcome:'NO_DEFINED_METRICS',metrics:[]}}})
 await assert.rejects(tools['device.get_metrics']({device_id:PUMP_ID,metric_keys:[]},signal));assert.equal(requests,0)
 const result:any=await tools['device.get_metrics']({device_id:PUMP_ID},signal);assert.equal(result.data.outcome,'NO_DEFINED_METRICS');assert.equal(requests,1)
})

test('late business API reply cannot append evidence or start the next step after cancellation',async()=>{
 const snapshot=view(),handlers:any={},dispatcher=new ActionDispatcher(handlers);let runner:AgentTaskRunner,release:(value:any)=>void=()=>{}
 runner=new AgentTaskRunner({snapshot:()=>snapshot,dispatch:(c,id,m,s)=>dispatcher.dispatch(c,id,m,s),cancelScene:r=>dispatcher.cancel(r),changed:()=>{}})
 Object.assign(handlers,createBusinessTools(()=>runner.context(),{focus:async()=>({}),reset:async()=>({}),modelState:()=> 'ready',showTrend:async()=>({})},()=>new Promise(resolve=>{release=resolve})))
 const pending=runner.start(TASK_TEMPLATES[3]!);await new Promise(resolve=>setImmediate(resolve));runner.cancel('PAGE_HIDDEN','页面隐藏')
 release({evidence_id:'EV_DB_late',snapshot_id:snapshot.snapshotId,as_of:snapshot.demoTime,source:'SIMULATED',data:{id:PUMP_ID,available_metrics:[]}})
 const task=await pending;assert.equal(task.status,'CANCELLED');assert.equal(task.tool_count,1);assert.equal(task.evidence.length,0);assert.equal(dispatcher.records[0]!.status,'CANCELLED')
})
