<script setup lang="ts">
import { onMounted,onBeforeUnmount,watch,computed } from 'vue'
import DashboardShell from './components/dashboard/DashboardShell.vue'
import DashboardHeader from './components/dashboard/DashboardHeader.vue'
import KpiOverview from './components/dashboard/KpiOverview.vue'
import ProcessFlowPanel from './components/dashboard/ProcessFlowPanel.vue'
import DeviceSummary from './components/dashboard/DeviceSummary.vue'
import AlarmPanel from './components/dashboard/AlarmPanel.vue'
import TrendPanel from './components/dashboard/TrendPanel.vue'
import AgentWorkspace from './components/dashboard/AgentWorkspace.vue'
import SceneViewport from './components/dashboard/SceneViewport.vue'
import {useBusinessAgent} from './composables/useBusinessAgent'
import { useSceneWorkspace } from './composables/useSceneWorkspace'
import { useMockData } from './composables/useMockData'
import { useDashboardContext } from './composables/useDashboardContext'
import { SCENARIOS,ENTITIES,BASIN_ID,CLARIFIER_ID,type Scenario } from './data/mockDataProvider'
import {UNITS,findUnit} from './scene/units'
import { exposeDashboardQA } from './qa/exposeDashboardQA'
const scene=useSceneWorkspace(),data=useMockData(),context=useDashboardContext(scene.runtime,data.snapshot)
const agent=useBusinessAgent(scene,data,context)
const {runtime,records}=scene
const {mode,gateway,current:currentTask,resultFindings,taskState,message:agentMessage}=agent
const {snapshot,paused,hidden,systemTime}=data
const {contextId,entity,activeAlarmId,hours,activeTrend,leftCollapsed,processCollapsed,trendsExpanded}=context
function locate(id:string,trigger='对象信息定位') {
  if(ENTITIES.find(e=>e.id===id)?.modelStatus!=='MODELLED')return {status:'UNAVAILABLE',error:{code:'NO_3D_MODEL',message:'暂无三维模型，无法定位'}}
  if(!runtime.value?.state.loadedIds.includes(id))return {status:'UNAVAILABLE',error:{code:'UNIT_NOT_LOADED',message:'请先切换当前模型单元'}}
  return scene.dispatchUser({tool_name:'scene.focus_device',arguments:{device_id:id}},trigger)
}
async function switchUnit(id:string){await scene.switchUnit(id);if(runtime.value?.state.viewMode==='unit'&&runtime.value.state.deviceId===id)contextId.value=id;activeAlarmId.value=null}
function switchMode(mode:'unit'|'plant'|'plant4'){return scene.switchView(mode)}
watch(()=>records.value.at(-1),record=>{if(record?.status==='SUCCEEDED'&&record.tool_name==='scene.focus_device'){contextId.value=String(record.arguments.device_id);if(record.arguments.device_id===BASIN_ID)activeTrend.value='do'}})
const focusCommands=computed(()=>{const r=runtime.value;if(!r||r.state.viewMode==='unit')return ['定位'+(findUnit(r?.state.deviceId??BASIN_ID)?.name??'一号曝气池')];return UNITS.filter(u=>r.state.viewMode==='plant4'||u.water).map(u=>'定位'+u.name)})
const time=(v:string)=>new Date(v).toLocaleString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'})
let disposeQA:(()=>void)|undefined
onMounted(()=>{disposeQA=exposeDashboardQA(scene,data,context,locate);if(new URLSearchParams(location.search).has('qa'))Object.assign(window,{__SW_M4__:agent.history,__SW_M3__:{execute:agent.execute,cancel:agent.cancel,tasks:()=>JSON.parse(JSON.stringify(agent.tasks.value)),current:()=>agent.current.value?JSON.parse(JSON.stringify(agent.current.value)):null,mode:(value:'DEMO'|'LLM')=>{agent.mode.value=value},gateway:()=>agent.gateway.value,chart:()=>agent.pinned.value?{snapshot_id:agent.pinned.value.snapshot.snapshotId,device_id:agent.pinned.value.device_id,metric:agent.pinned.value.metric_key,hours:agent.pinned.value.hours,evidence_id:agent.pinned.value.evidence_id}:null}})})
onBeforeUnmount(()=>disposeQA?.())
</script>
<template>
  <DashboardShell :left-collapsed="leftCollapsed" :trends-expanded="trendsExpanded">
    <template #header><DashboardHeader :snapshot="snapshot" :system-time="systemTime"/></template>
    <template #controls><section class="demo-controls" aria-label="演示数据控制"><div><span class="eyebrow">BIOLOGICAL TREATMENT / 01</span><span class="demo-time">演示时间 <time>{{time(snapshot.demoTime)}}</time></span></div><div class="demo-control-actions"><label for="scenario">演示场景</label><select id="scenario" :value="snapshot.scenario" @change="data.switchScenario(($event.target as HTMLSelectElement).value as Scenario)"><option v-for="(label,key) in SCENARIOS" :key="key" :value="key">{{label}}</option></select><button class="secondary-button pause-demo" @click="data.setPaused(!paused)">{{paused?'恢复演示':'暂停演示'}}</button><span class="clock-status">{{hidden?'页面隐藏 · 已暂停':paused?'演示已暂停':'每 5 秒更新'}}</span><button class="secondary-button sidebar-toggle" @click="leftCollapsed=!leftCollapsed" :aria-expanded="!leftCollapsed">{{leftCollapsed?'展开信息':'收起信息'}}</button></div></section></template>
    <template #kpis><KpiOverview :snapshot="snapshot"/></template>
    <template #information><ProcessFlowPanel :context-id="contextId" :collapsed="processCollapsed" @context="context.context" @toggle="processCollapsed=!processCollapsed"/><AlarmPanel :snapshot="snapshot" :active-alarm-id="activeAlarmId" :context-id="contextId" :has-data="entity.metrics.length>0" :ready="runtime?.state.loadedIds.includes(BASIN_ID)??false" @select="context.selectAlarm" @locate="id=>locate(id,'告警定位')"/><DeviceSummary :snapshot="snapshot" :entity="entity" :selected-id="runtime?.state.selectedId??null" :loaded-ids="runtime?.state.loadedIds??[]" :ready="runtime?.state.status==='ready'" @locate="locate" @context="context.context"/></template>
    <template #scene><SceneViewport :runtime="runtime" @attach="scene.attach" @unit="switchUnit" @mode="switchMode" @reset="scene.dispatchUser({tool_name:'scene.reset_view',arguments:{}},'场景工具栏')"/></template>
    <template #trends><section class="trends-section" :data-active-tab="activeTrend"><div class="compact-trend-toolbar"><div role="tablist" aria-label="趋势指标"><button role="tab" :aria-selected="activeTrend==='do'" @click="activeTrend='do';trendsExpanded=true">DO 趋势</button><button role="tab" :aria-selected="activeTrend==='blower_power'" @click="activeTrend='blower_power';trendsExpanded=true">功率趋势</button></div><button class="text-button" @click="trendsExpanded=!trendsExpanded" :aria-expanded="trendsExpanded">{{trendsExpanded?'收起趋势':'展开趋势'}}</button></div><div class="trend-grid"><div class="trend-slot" :class="{'active-trend':activeTrend==='do'}"><TrendPanel :snapshot="agent.pinned.value?.metric_key==='do'?agent.pinned.value.snapshot:snapshot" :evidence-id="agent.pinned.value?.metric_key==='do'?agent.pinned.value.evidence_id:undefined" :available="contextId===BASIN_ID" @rendered="agent.onTrendRendered" metric="do" :hours="hours" :visible="true" :context-active="activeTrend==='do'" @range="agent.range($event)"/></div><div class="trend-slot" :class="{'active-trend':activeTrend==='blower_power'}"><TrendPanel :snapshot="agent.pinned.value?.metric_key==='blower_power'?agent.pinned.value.snapshot:snapshot" :evidence-id="agent.pinned.value?.metric_key==='blower_power'?agent.pinned.value.evidence_id:undefined" :available="contextId===BASIN_ID||entity.metrics.includes('blower_power')" @rendered="agent.onTrendRendered" metric="blower_power" :hours="hours" :visible="true" :context-active="activeTrend==='blower_power'" @range="agent.range($event)"/></div></div></section></template>
    <template #agent><AgentWorkspace :history="agent.history" @rerun="agent.rerun" :mode="mode" :gateway="gateway" :task="currentTask" :findings="resultFindings" :scenario-id="snapshot.scenario" @mode="mode=$event" @refresh-gateway="agent.refreshGateway" @trend="agent.reopen" :focus-commands="focusCommands" :plant-mode="runtime?.state.viewMode==='plant'" :focus-command="(runtime?.state.selectedId??runtime?.state.deviceId)===CLARIFIER_ID?'定位一号二沉池':'定位一号曝气池'" :records="records" :reply="agentMessage" :selected-id="runtime?.state.selectedId??null" :context-name="entity.name" :task-state="taskState" @send="agent.execute" @cancel="agent.cancel"/></template>
    <template #footer><footer class="statusbar"><span><i class="status-dot"/>SMARTWATER · {{runtime?.state.viewMode==='plant4'?'四单元试运行':runtime?.state.viewMode==='plant'?'双单元总览':'单元按需展示'}}</span><span>GLB 资产 · {{runtime?.state.status==='ready'?(runtime.state.loadMs/1000).toFixed(2)+' s 加载':'等待加载'}} · {{runtime?.state.calls||0}} DRAW CALLS</span><span>演示规则 / 演示尺寸 · 非工程校核</span></footer></template>
  </DashboardShell>
</template>
