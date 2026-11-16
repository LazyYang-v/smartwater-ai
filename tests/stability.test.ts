import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LoopLifecycle } from '../src/scene/loopLifecycle.ts'
import { FrameSample } from '../src/scene/frameSample.ts'
import { ActionDispatcher } from '../src/agent/actionDispatcher.ts'

test('repeated visibility/resume signals never duplicate the owned Three loop',()=>{
 let starts=0,stops=0
 const loop=new LoopLifecycle(()=>starts++,()=>stops++)
 loop.sync(true);loop.sync(true);loop.sync(false);loop.sync(false)
 loop.sync(true);loop.sync(true);loop.dispose();loop.dispose();loop.sync(true)
 assert.equal(starts,2);assert.equal(stops,2);assert.equal(loop.active,false)
})
test('FPS uses submissions and elapsed wall time; raw long intervals remain in P95',()=>{
 const meter=new FrameSample(0,true)
 for(const t of [10,20,30,230]){meter.callback(t);meter.submitted(50)}
 const result=meter.finish(250)
 assert.equal(result.average_fps,16);assert.deepEqual(result.frame_times_ms,[10,10,200])
 assert.equal(result.p95_frame_ms,200);assert.equal(result.frames_over_50_ms,1);assert.equal(result.frames_over_100_ms,1)
 assert.equal(result.scene_submissions,4);assert.equal(result.draw_calls_max,50)
})
test('a foreground sample retains hidden intervals and becomes explicitly ineligible',()=>{
 const meter=new FrameSample(0,true);meter.callback(1);meter.submitted(50)
 meter.visibility(10,'hidden');meter.visibility(200,'visible');meter.callback(210);meter.submitted(50)
 const result=meter.finish(220)
 assert.equal(result.page_visible_throughout,false);assert.deepEqual(result.frame_times_ms,[209]);assert.equal(result.visibility_events.length,2)
})
test('PAGE_HIDDEN keeps its reason and produces exactly one CANCELLED terminal record',async()=>{
 const handler=async()=>{throw {code:'PAGE_HIDDEN',message:'页面隐藏'}}
 const dispatcher=new ActionDispatcher({'scene.focus_device':handler,'scene.reset_view':handler})
 const record=await dispatcher.dispatch({tool_name:'scene.reset_view',arguments:{}},'hidden')
 assert.equal(record.status,'CANCELLED');assert.equal(record.error?.code,'PAGE_HIDDEN');assert.ok(record.finished_at)
 assert.equal(await dispatcher.dispatch({tool_name:'scene.reset_view',arguments:{}},'hidden'),record)
 assert.equal(dispatcher.records.length,1)
})
