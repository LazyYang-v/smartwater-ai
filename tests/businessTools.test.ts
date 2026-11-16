import {test} from 'node:test'
import assert from 'node:assert/strict'
import {TOOL_DEFINITIONS,validateTool} from '../src/agent/contracts.ts'
import {createBusinessTools,queryMetrics,type Evidence} from '../src/agent/businessTools.ts'
import {createSnapshot,BLOWER_ID,PUMP_ID,BASIN_ID} from '../src/data/mockDataProvider.ts'
import {AgentTaskRunner,findings,TASK_TEMPLATES} from '../src/agent/taskRunner.ts'
import {ActionDispatcher} from '../src/agent/actionDispatcher.ts'
function setup(options:any={}){let live=createSnapshot(options.scenario??'NORMAL'),runner:AgentTaskRunner,shown:any;const handlers:any={};const dispatcher=new ActionDispatcher(handlers);runner=new AgentTaskRunner({snapshot:()=>live,dispatch:(call,id,meta,signal)=>dispatcher.dispatch(call,id,meta,signal),cancelScene:reason=>dispatcher.cancel(reason),changed:()=>{},transport:options.transport},options.limits);Object.assign(handlers,createBusinessTools(()=>runner.context(),{focus:async(id,signal)=>{if(options.focus)return options.focus(id,signal);return {arrival_verified:true,rendered_frame:1,selected_id:id}},reset:async()=>({selected_id:null,arrival_verified:true,rendered_frame:2}),modelState:()=> 'ready',showTrend:async value=>{shown=value;return {displayed:true,snapshot_id:value.context.snapshot.snapshotId,metric_key:value.metric_key,hours:value.hours,evidence_id:value.evidence_id}}}));return {runner,dispatcher,handlers,shown:()=>shown,setSnapshot:(s:any)=>live=s}}
test('seven documented tools reject unknown, extra, wrong ownership fields and oversized input',()=>{
 assert.equal(TOOL_DEFINITIONS.length,7)
 for(const key of ['__proto__','constructor','toString'])assert.throws(()=>validateTool('device.get_details',JSON.parse('{"device_id":"'+PUMP_ID+'","'+key+'":{}}')))
 for(const [name,args] of [['pump.start',{}],['device.get_details',{device_id:PUMP_ID,control:true}],['device.get_metrics',{device_id:BLOWER_ID,hours:2}],['device.get_metrics',{device_id:BLOWER_ID,metric_keys:'do'}],['alarm.inspect',{alarm_id:'x'.repeat(5000)}]])assert.throws(()=>validateTool(name,args))
 assert.throws(()=>queryMetrics(createSnapshot(),PUMP_ID,['blower_power']),/指标不属于/)
 assert.throws(()=>queryMetrics(createSnapshot(),'UNKNOWN'),/四单元/)
})
test('A executes actual shared tools, computes6h stats and pins all evidence and chart to one snapshot',async()=>{
 const s=setup();const start=createSnapshot('NORMAL',3);s.setSnapshot(start);const task=await s.runner.start(TASK_TEMPLATES[0]!);assert.equal(task.status,'SUCCEEDED');assert.equal(task.tool_count,3)
 const q=task.evidence.find(e=>e.tool_name==='device.get_metrics')!;const m=q.data.metrics[0];assert.equal(m.unit,'kW');assert.equal(m.history.valid_samples,361);assert.equal(m.history.expected_samples,361);assert.equal(m.latest.value,start.readings.blower_power.value)
 assert.ok(task.evidence.every(e=>e.snapshot_id===start.snapshotId&&e.as_of===start.demoTime));assert.equal(s.shown().context.snapshot.snapshotId,start.snapshotId);assert.equal(s.shown().hours,6)
 assert.equal(task.action_ids.length,s.dispatcher.records.length)
})
test('snapshot remains consistent while live source advances during a multi-step task',async()=>{
 let release:()=>void=()=>{};const s=setup({focus:()=>new Promise(resolve=>{release=()=>resolve({arrival_verified:true})})});const before=createSnapshot('NORMAL',1);s.setSnapshot(before);const pending=s.runner.start(TASK_TEMPLATES[0]!);await new Promise(r=>setImmediate(r));s.setSnapshot(createSnapshot('NORMAL',9));release();const task=await pending;assert.equal(task.snapshot_id,before.snapshotId);assert.ok(task.evidence.every(e=>e.snapshot_id===before.snapshotId))
})
test('B distinguishes no alarms, trigger basis and current missing quality',async()=>{
 const normal=setup();const a=await normal.runner.start(TASK_TEMPLATES[1]!);assert.match(a.explanation,/没有告警不等于/)
 const low=setup({scenario:'LOW_DO'});const b=await low.runner.start(TASK_TEMPLATES[1]!);const inspect=b.evidence.find(e=>e.tool_name==='alarm.inspect')!;assert.ok(inspect.data.trigger_comparison);assert.equal(inspect.data.threshold,2);assert.equal(inspect.data.unit,'mg/L')
 const missing=setup({scenario:'MISSING_DATA'});const c=await missing.runner.start(TASK_TEMPLATES[1]!);assert.equal(c.evidence.find(e=>e.tool_name==='alarm.inspect')!.data.current_quality,'MISSING');const stats=c.evidence.find(e=>e.tool_name==='device.get_metrics')!.data.metrics[0].history;assert.ok(stats.missing_samples>0);assert.ok(stats.coverage<1)
})
test('patrol covers four devices without certifying missing metrics or unconfigured thresholds as normal',async()=>{
 const s=setup({scenario:'LOW_DO'});const task=await s.runner.start(TASK_TEMPLATES[2]!);assert.equal(task.tool_count,9);assert.equal(task.status,'SUCCEEDED');assert.equal(task.evidence.length,9);assert.ok(task.evidence.filter(e=>e.tool_name==='device.get_details').every(e=>e.quality==='NOT_OBSERVED'));const result=findings(task);assert.equal(result.length,4);assert.match(result.find(r=>r.device_id===PUMP_ID)!.verdict,/无法判断/);assert.match(result.find(r=>r.device_id===BASIN_ID)!.verdict,/触发/);assert.match(result.find(r=>r.device_id===BLOWER_ID)!.verdict,/未配置评价规则/)
 const pump=await s.runner.start(TASK_TEMPLATES[3]!);assert.match(pump.explanation,/缺少运行指标/);assert.equal(pump.evidence.find(e=>e.tool_name==='device.get_metrics')!.quality,'NO_DATA')
})
test('display failure is partial, keeps query evidence and does not claim whole task success',async()=>{
 const s=setup({focus:async()=>{throw new Error('DEVICE_NOT_FOUND: not loaded')}});const task=await s.runner.start(TASK_TEMPLATES[0]!);assert.equal(task.status,'PARTIAL');assert.equal(task.errors[0]!.code,'DEVICE_NOT_FOUND');assert.ok(task.evidence.find(e=>e.tool_name==='device.get_metrics'));assert.ok(task.evidence.find(e=>e.tool_name==='chart.show_trend'))
})
test('cancelled or scenario-invalidated tasks cannot emit success or schedule late tools',async()=>{
 let release:()=>void=()=>{};const s=setup({focus:()=>new Promise(resolve=>release=()=>resolve({arrival_verified:true}))});const pending=s.runner.start(TASK_TEMPLATES[0]!);await new Promise(r=>setImmediate(r));s.runner.cancel('SCENARIO_CHANGED','scenario changed');release();const task=await pending;assert.equal(task.status,'CANCELLED');assert.equal(task.tool_count,1);assert.equal(task.evidence.length,0);assert.equal(s.dispatcher.records[0]!.status,'CANCELLED')
})

test('current patrol readings do not fabricate pH/depth history and unsupported history errors are actionable',()=>{
 const snapshot=createSnapshot();assert.throws(()=>queryMetrics(snapshot,BASIN_ID,['do','ph','depth'],6),/ph.*省略 hours/)
 const query=queryMetrics(snapshot,BASIN_ID,['do','ph','depth']);assert.equal(query.metrics.length,3);assert.ok(query.metrics.every(m=>m.history===null&&m.latest.snapshotId===snapshot.snapshotId))
})

test('trend accepts current-reading or alarm evidence of the same pinned version but rejects wrong history windows and devices',async()=>{
 const snapshot=createSnapshot('LOW_DO');let reference:any={evidence_id:'EV_ref',tool_name:'device.get_metrics',device_id:BLOWER_ID,snapshot_id:snapshot.snapshotId,data:queryMetrics(snapshot,BLOWER_ID)},shows=0
 const tools=createBusinessTools(()=>({task_id:'reference_test',snapshot,nextEvidence:()=> 'EV_display',findEvidence:()=>reference,assertActive:()=>{}}),{focus:async()=>({}),reset:async()=>({}),modelState:()=> 'ready',showTrend:async value=>{shows++;assert.equal(value.context.snapshot,snapshot);return {displayed:true}}})
 const args={device_id:BLOWER_ID,metric_key:'blower_power',hours:6,evidence_id:'EV_ref'},signal=new AbortController().signal
 const first:any=await tools['chart.show_trend'](args,signal);assert.equal(first.reference_kind,'SAME_SNAPSHOT_READING');assert.equal(first.data.metrics[0].history.valid_samples,361)
 reference.data=queryMetrics(snapshot,BLOWER_ID,['blower_power'],1);await assert.rejects(tools['chart.show_trend'](args,signal),/EVIDENCE_MISMATCH|同一时窗/)
 reference={evidence_id:'EV_ref',tool_name:'alarm.inspect',device_id:BASIN_ID,snapshot_id:snapshot.snapshotId,data:{metric_key:'do',alarm:snapshot.alarms[0]}}
 const second:any=await tools['chart.show_trend']({...args,device_id:BASIN_ID,metric_key:'do'},signal);assert.equal(second.reference_kind,'SAME_SNAPSHOT_ALARM')
 reference.snapshot_id='other_snapshot';await assert.rejects(tools['chart.show_trend']({...args,device_id:BASIN_ID,metric_key:'do'},signal));assert.equal(shows,2)
})
