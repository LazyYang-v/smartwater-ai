import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BASIN_ID,BLOWER_ID,DEMO_START,DATA_VERSION,RULES,MockDataProvider,SimulationClock,createSnapshot,trendWindow,chartValue,displayValue } from '../src/data/mockDataProvider.ts'

test('NORMAL has one coherent snapshot, fixed 4.8m depth and no calculated alarms',()=>{
 const s=createSnapshot('NORMAL',0)
 assert.equal(s.alarms.length,0);assert.equal(s.readings.depth.value,4.8)
 assert.equal(s.readings.do.scopeId,BASIN_ID);assert.equal(s.readings.blower_power.scopeId,BLOWER_ID)
 assert.equal(s.readings.blower_power.unit,'kW')
 for(const p of Object.values(s.readings)){
  assert.equal(p.quality,'GOOD');assert.equal(p.source,'SIMULATED');assert.equal(p.snapshotId,s.snapshotId)
  for(const k of ['scopeType','scopeId','metricKey','value','unit','observedAt','quality','source','snapshotId'])assert.ok(Object.hasOwn(p,k))
 }
 assert.equal(s.version,DATA_VERSION);assert.equal(Date.parse(s.demoTime),DEMO_START)
})
test('LOW_DO alarm refers to an actually low GOOD reading and its event time sample',()=>{
 const s=createSnapshot('LOW_DO'),a=s.alarms[0]!
 assert.ok(s.readings.do.value!<RULES.lowDo.below)
 assert.equal(a.status,'ACTIVE');assert.equal(a.deviceId,s.readings.do.scopeId)
 const point=s.history.do.find(p=>p.sampleAt===a.occurredAt)!
 assert.equal(a.valueAtEvent,point.value);assert.ok(a.valueAtEvent<RULES.lowDo.below)
 assert.equal(a.snapshotId,s.snapshotId);assert.equal(a.source,'SIMULATED')
})
test('MISSING_DATA leaves actual null gaps and does not clear existing low DO event',()=>{
 const s=createSnapshot('MISSING_DATA')
 assert.equal(s.readings.do.value,null);assert.equal(s.readings.do.quality,'MISSING');assert.equal(displayValue(s.readings.do),'—')
 assert.equal(s.readings.blower_power.quality,'STALE');assert.equal(displayValue(s.readings.blower_power),'—');assert.equal(chartValue(s.readings.blower_power),null)
 assert.ok(Date.parse(s.readings.blower_power.observedAt)<Date.parse(s.demoTime))
 assert.equal(s.alarms.length,1);assert.equal(s.alarms[0]!.status,'AWAITING_DATA')
 assert.ok(s.history.do.some(p=>p.value!==null));assert.ok(s.history.do.slice(-10).every(p=>chartValue(p)===null))
})
test('scenario switches publish atomically and reproduce data without accumulating prior alarms',()=>{
 const p=new MockDataProvider();const first=p.switchScenario('LOW_DO','2026-01-15T10:00:00Z')
 p.advance('2026-01-15T10:00:05Z');p.switchScenario('MISSING_DATA','2026-01-15T11:00:00Z')
 const repeated=p.switchScenario('LOW_DO','2026-01-15T10:00:00Z')
 assert.deepEqual(first,repeated)
 for(const v of [...Object.values(repeated.readings),...repeated.alarms,...repeated.history.do,...repeated.history.blower_power])assert.equal(v.snapshotId,repeated.snapshotId)
 assert.equal(p.switchScenario('NORMAL','2026-01-15T10:00:00Z').alarms.length,0)
})
for(const scenario of ['NORMAL','LOW_DO','MISSING_DATA'] as const) {
 test(`${scenario}: KPI/device raw readings equal trend endpoints in every time window`,()=>{
  const s=createSnapshot(scenario,7)
  for(const key of ['do','blower_power'] as const)for(const hours of [1,6,24] as const){
   const w=trendWindow(s,key,hours);assert.equal(w.length,hours*60+1)
   assert.equal(w.at(-1),s.readings[key]);assert.equal(w.at(-1)!.value,s.readings[key].value)
   assert.equal(w[0]!.sampleAt,new Date(Date.parse(s.demoTime)-hours*3600_000).toISOString())
  }
 })
}
test('advancing demo changes time by five seconds, preserves depth and event occurrence',()=>{
 const p=new MockDataProvider();const a=p.switchScenario('LOW_DO',new Date().toISOString()),b=p.advance(new Date().toISOString())
 assert.equal(Date.parse(b.demoTime)-Date.parse(a.demoTime),5000)
 assert.equal(b.readings.depth.value,4.8);assert.equal(a.alarms[0]!.occurredAt,b.alarms[0]!.occurredAt)
 assert.notEqual(a.snapshotId,b.snapshotId)
})
test('central clock pauses hidden time and never catches up with a publication storm',()=>{
 const c=new SimulationClock();c.reset(0)
 assert.equal(c.pulse(4000,true),false);assert.equal(c.pulse(5000,true),true)
 assert.equal(c.pulse(500000,false),false);c.reset(500000)
 assert.equal(c.pulse(504000,true),false);assert.equal(c.pulse(505000,true),true)
 assert.equal(c.pulse(900000,true),true);assert.equal(c.pulse(900001,true),false)
})
