import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ActionDispatcher } from '../src/agent/actionDispatcher.ts'
import { parseCommand } from '../src/agent/demoParser.ts'
import type { ToolCall, ToolHandler } from '../src/agent/types.ts'

const focus: ToolCall = {tool_name:'scene.focus_device',arguments:{device_id:'SW_BIO_AERATION_001'}}
const reset: ToolCall = {tool_name:'scene.reset_view',arguments:{}}

test('only the two demonstration commands resolve to allowed calls',()=>{
  assert.deepEqual(parseCommand(' 定位一号曝气池。 '),focus)
  assert.deepEqual(parseCommand('回到总览'),reset)
  assert.equal(parseCommand('启动鼓风机'),null)
  assert.equal(parseCommand(''),null)
})
test('a repeated action id executes once and returns the same promise',async()=>{
  let count=0
  const handler:ToolHandler=async()=>{count++;return {rendered_frame:42}}
  const dispatcher=new ActionDispatcher({'scene.focus_device':handler,'scene.reset_view':handler})
  const first=dispatcher.dispatch(focus,'repeat'),second=dispatcher.dispatch(focus,'repeat')
  assert.equal(first,second)
  assert.equal((await first).status,'SUCCEEDED')
  assert.equal(count,1)
  assert.equal(dispatcher.records.length,1)
  await assert.rejects(dispatcher.dispatch(reset,'repeat'),/ACTION_ID_CONFLICT/)
})
test('a superseded operation cannot report success even if its handler resolves late',async()=>{
  let release:()=>void=()=>{}
  const dispatcher=new ActionDispatcher({'scene.focus_device':async()=>new Promise(resolve=>{release=()=>resolve({rendered_frame:1})}),'scene.reset_view':async()=>({rendered_frame:2})})
  const old=dispatcher.dispatch(focus,'old')
  await Promise.resolve()
  const current=dispatcher.dispatch(reset,'current')
  release()
  assert.equal((await old).status,'CANCELLED')
  assert.equal((await current).status,'SUCCEEDED')
  assert.equal(dispatcher.records[0]?.result,undefined)
})
test('failure is terminal, timestamped, and replaying its id does not retry',async()=>{
  let count=0
  const handler:ToolHandler=async()=>{count++;throw new Error('DEVICE_NOT_FOUND: absent')}
  const dispatcher=new ActionDispatcher({'scene.focus_device':handler,'scene.reset_view':handler})
  const result=await dispatcher.dispatch(focus,'failed')
  assert.equal(result.status,'FAILED')
  assert.equal(result.error?.code,'DEVICE_NOT_FOUND')
  assert.ok(result.finished_at)
  await dispatcher.dispatch(focus,'failed')
  assert.equal(count,1)
})
test('user-origin metadata is retained without changing idempotency or tool semantics',async()=>{
 let calls=0
 const handler:ToolHandler=async()=>{calls++;return {arrival_verified:true,rendered_frame:2}}
 const dispatcher=new ActionDispatcher({'scene.focus_device':handler,'scene.reset_view':handler})
 const first=await dispatcher.dispatch(focus,'ui-origin',{source:'USER',trigger:'告警定位'})
 const repeated=await dispatcher.dispatch(focus,'ui-origin',{source:'DEMO_AGENT',trigger:'其他入口'})
 assert.equal(first.source,'USER');assert.equal(first.trigger,'告警定位');assert.equal(repeated.source,'USER')
 assert.equal(first.status,'SUCCEEDED');assert.equal(calls,1)
})

test('clarifier command reuses focus_device and does not add an Agent tool',()=>{
 assert.deepEqual(parseCommand('定位一号二沉池'),{tool_name:'scene.focus_device',arguments:{device_id:'SW_CLR_TANK_001'}})
})
