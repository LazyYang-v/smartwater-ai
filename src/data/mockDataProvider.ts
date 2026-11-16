export const BASIN_ID = 'SW_BIO_AERATION_001'
export const CLARIFIER_ID='SW_CLR_TANK_001'
export const PUMP_ID='SW_PRE_PUMP_001'
export const BLOWER_ID = 'SW_AIR_BLOWER_001'
export const DATA_VERSION = 'smartwater-m1.2'
export const DEMO_START = Date.parse('2026-01-15T08:00:00Z')
export const CLOCK = { publishMs: 5000, sampleMs: 60_000, historyHours: 24, seed: 4107 } as const
export type RuleSnapshot={lowDo:{id:string;below:number;unit:string;label:string;version?:string}}
export const RULES = { lowDo: { id: 'DEMO_DO_LOW', below: 2, unit: 'mg/L', label: 'DO < 2.0 mg/L · 演示阈值' } } as const
export type Scenario = 'NORMAL' | 'LOW_DO' | 'MISSING_DATA'
export type Quality = 'GOOD' | 'MISSING' | 'STALE'
export type MetricKey = 'do' | 'ph' | 'depth' | 'blower_power'
export type Reading = {
  scopeType: 'DEVICE'; scopeId: string; metricKey: MetricKey; value: number | null
  unit: string; observedAt: string; sampleAt: string; quality: Quality; source: 'SIMULATED'; snapshotId: string
}
export type Alarm = {
  alarmId: string; deviceId: string; metricKey: MetricKey; occurredAt: string; level: 'WARNING'
  ruleId: string; rule: string; status: 'ACTIVE' | 'AWAITING_DATA' | 'ACKNOWLEDGED' | 'RECOVERED' | 'CLOSED'; source: 'SIMULATED'
  valueAtEvent: number; snapshotId: string; lifecycleStatus?:'ACTIVE'|'RECOVERED'|'CLOSED'; acknowledgedAt?:string|null; acknowledgedBy?:string|null; recoveredAt?:string|null; closedAt?:string|null; ruleVersion?:string; occurrenceCount?:number; quality?:Quality
}
export type Snapshot = {
  snapshotId: string; version: string; scenario: Scenario; tick: number; demoTime: string; updatedAt: string
  backend?: {snapshotId:string;revision:number;dataMode:'BUSINESS_API';source:'SIMULATED';devices:DataEntity[];rules?:RuleSnapshot};
  readings: Record<MetricKey, Reading>; alarms: Alarm[]; history: Record<'do' | 'blower_power', Reading[]>
}
export type DataEntity = { id: string; name: string; modelStatus: 'MODELLED' | 'DATA_ONLY' | 'SCHEMATIC'; description: string; metrics: MetricKey[] }
// Data descriptions only. The existing Three.js DeviceRegistry remains the sole scene registry.
export const ENTITIES: DataEntity[] = [
  { id: BASIN_ID, name: '一号曝气池', modelStatus: 'MODELLED', description: '生化处理 A²/O 好氧段样板 · 42 × 18 m；演示尺寸未经工程校核。', metrics: ['do','ph','depth'] },
  { id:CLARIFIER_ID,name:'一号二沉池',modelStatus:'MODELLED',description:'Ø24m二沉池样板。只有模型，未配置过程模拟指标；顶部KPI仍属于一号曝气池及其关联鼓风机；本设备暂无过程指标或趋势。',metrics:[] },
  { id: BLOWER_ID, name: '一号鼓风机 B-01', modelStatus: 'MODELLED', description: '鼓风机房内重点设备；沿用既有B-01功率模拟数据，具备三维映射。功率不是全厂能耗或电量。', metrics: ['blower_power'] },
  {id:PUMP_ID,name:'一号提升泵',modelStatus:'MODELLED',description:'泵房内重点提升泵；仅为三维演示，暂无该设备指标，未定义流量、压力或效率模拟数据。',metrics:[]},
  ...[
    ['inlet','进水'],['screen','格栅 / 提升泵房'],['primary','初沉池'],['secondary','二沉池'],['tertiary','深度处理 / 消毒'],['outlet','出水'],
  ].map(([id,name]) => ({id:'PROCESS_'+id,name:name!,modelStatus:'SCHEMATIC' as const,description:'沿用参考工艺的示意节点，尚未建模；未建模不代表停机、故障或离线。',metrics:[]})),
]
export const PROCESS = ['PROCESS_inlet',PUMP_ID,'PROCESS_primary',BASIN_ID,CLARIFIER_ID,'PROCESS_tertiary','PROCESS_outlet']
export const SCENARIOS: Record<Scenario,string> = { NORMAL:'正常演示', LOW_DO:'低 DO 事件', MISSING_DATA:'缺测 / 过期' }
export const METRICS: Record<MetricKey,{label:string;unit:string;digits:number}> = {
  do:{label:'溶解氧',unit:'mg/L',digits:2},ph:{label:'pH',unit:'无量纲',digits:2},depth:{label:'水深',unit:'m',digits:1},blower_power:{label:'关联鼓风机功率',unit:'kW',digits:1},
}
const iso = (time:number) => new Date(time).toISOString()
function noise(time:number,salt:number) {
  let x=(Math.floor(time/CLOCK.sampleMs)+CLOCK.seed+salt*101)|0
  x=Math.imul(x^(x>>>16),0x45d9f3b);x=Math.imul(x^(x>>>16),0x45d9f3b)
  return ((x^(x>>>16))>>>0)/0xffffffff-.5
}
function reading(metricKey:MetricKey,time:number,scenario:Scenario,snapshotId:string,end:number):Reading {
  const minutes=(time-DEMO_START)/60_000
  let value:number, quality:Quality='GOOD', observedAt=iso(time)
  if(metricKey==='depth') value=4.8
  else if(metricKey==='ph') value=7.2+.08*Math.sin(minutes/35)+noise(time,3)*.03
  else if(metricKey==='blower_power') value=82+5*Math.sin(minutes/57)+noise(time,2)*1.2
  else value=2.65+.20*Math.sin(minutes/28)+noise(time,1)*.07
  const relative=(time-DEMO_START)/60_000
  if(scenario!=='NORMAL' && metricKey==='do' && relative>=-40) value=relative>=-22 ? 1.62+.07*Math.sin(minutes/9) : 2.65-(relative+40)/18*1.03
  if(scenario==='MISSING_DATA') {
    if(relative>=-12&&(metricKey==='do'||metricKey==='ph')) { value=NaN;quality='MISSING' }
    // After the last real simulated observation, every later history slot is stale too.
    // Never retain an older cache value while claiming newer GOOD observations exist.
    if(metricKey==='blower_power'&&relative>-13) { const last=DEMO_START-13*60_000;value=82+5*Math.sin(-13/57)+noise(last,2)*1.2;quality='STALE';observedAt=iso(last) }
  }
  return {scopeType:'DEVICE',scopeId:metricKey==='blower_power'?BLOWER_ID:BASIN_ID,metricKey,value:Number.isNaN(value)?null:value,unit:METRICS[metricKey].unit,observedAt,sampleAt:iso(time),quality,source:'SIMULATED',snapshotId}
}
export function createSnapshot(scenario:Scenario='NORMAL',tick=0,updatedAt=iso(DEMO_START)):Snapshot {
  const end=DEMO_START+tick*CLOCK.publishMs,snapshotId=`${DATA_VERSION}:${scenario}:${tick}`
  const history:Snapshot['history']={do:[],blower_power:[]}
  for(let i=CLOCK.historyHours*60;i>=0;i--) {
    const time=end-i*CLOCK.sampleMs
    history.do.push(reading('do',time,scenario,snapshotId,end))
    history.blower_power.push(reading('blower_power',time,scenario,snapshotId,end))
  }
  const readings={do:history.do.at(-1)!,blower_power:history.blower_power.at(-1)!,ph:reading('ph',end,scenario,snapshotId,end),depth:reading('depth',end,scenario,snapshotId,end)}
  const alarms:Alarm[]=scenario==='NORMAL'?[]:[{
    alarmId:`scenario:${scenario}:DO:001`,deviceId:BASIN_ID,metricKey:'do',occurredAt:iso(DEMO_START-28*60_000),level:'WARNING',
    ruleId:RULES.lowDo.id,rule:RULES.lowDo.label,status:scenario==='MISSING_DATA'?'AWAITING_DATA':'ACTIVE',source:'SIMULATED',
    valueAtEvent:reading('do',DEMO_START-28*60_000,scenario,snapshotId,end).value!,snapshotId,
  }]
  return {snapshotId,version:DATA_VERSION,scenario,tick,demoTime:iso(end),updatedAt,readings,alarms,history}
}
export function trendWindow(snapshot:Snapshot,key:'do'|'blower_power',hours:1|6|24) {
  const start=Date.parse(snapshot.demoTime)-hours*3600_000
  return snapshot.history[key].filter(p=>Date.parse(p.sampleAt)>=start)
}
export function chartValue(reading:Reading) { return reading.quality==='GOOD'?reading.value:null }
export function displayValue(reading:Reading) { return reading.quality==='GOOD'&&reading.value!==null?reading.value.toFixed(METRICS[reading.metricKey].digits):'—' }
export function qualityLabel(quality:Quality) { return {GOOD:'有效',MISSING:'缺测',STALE:'过期'}[quality] }
export class MockDataProvider {
  private scenario:Scenario='NORMAL'
  private tick=0
  snapshot:Snapshot
  constructor() { this.snapshot=createSnapshot() }
  switchScenario(scenario:Scenario,updatedAt:string) { this.scenario=scenario;this.tick=0;return this.snapshot=createSnapshot(scenario,0,updatedAt) }
  advance(updatedAt:string) { return this.snapshot=createSnapshot(this.scenario,++this.tick,updatedAt) }
}
// One monotonic clock, at most one publication per pulse; hidden/pause time is never replayed.
export class SimulationClock {
  private elapsed=0
  private last=0
  reset(now:number) {this.elapsed=0;this.last=now}
  pulse(now:number,active:boolean) {
    const delta=Math.max(0,now-this.last);this.last=now
    if(!active){this.elapsed=0;return false}
    this.elapsed+=delta
    if(this.elapsed<CLOCK.publishMs)return false
    this.elapsed=0;return true
  }
}
