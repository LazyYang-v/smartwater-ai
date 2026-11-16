<script setup lang="ts">
import type {AgentTask,Finding} from '../../agent/taskRunner'
const props=defineProps<{task:AgentTask;findings:Finding[];scenarioId:string}>()
defineEmits<{trend:[evidenceId:string]}>()
const value=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v.toFixed(2):'—'
const time=(v:string)=>new Date(v).toLocaleString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'})
const label=(status:string)=>({RUNNING:'任务进行中',SUCCEEDED:'步骤完成 · 仅限演示快照',PARTIAL:'部分完成 · 有失败步骤',FAILED:'任务失败',CANCELLED:'任务已取消'}[status]??status)
</script>
<template>
 <section class="business-result" :data-task-id="task.task_id" :data-task-status="task.status" :data-snapshot-id="task.snapshot_id">
  <h3>结论 · {{label(task.status)}}</h3><p v-if="task.scenario_id!==scenarioId" class="quality-warning">历史场景结果，不能代表当前场景。</p><p class="task-asof">SIMULATED · 截至 {{time(task.as_of)}}</p><code>{{task.snapshot_id}}</code><p>检查范围：{{findings.length}} / 4 个设备 · {{task.tool_count}} 个实际工具步骤</p>
  <article v-for="item in findings" :key="item.device_id" class="finding" :data-finding-device="item.device_id"><strong>{{item.name}}</strong><code>{{item.device_id}}</code><p class="finding-verdict">{{item.verdict}}</p>
   <div v-for="metric in item.metrics" :key="metric.metric_key" class="metric-fact" :data-metric="metric.metric_key" :data-value="metric.latest.value"><span>{{metric.label}}：{{metric.latest.quality==='GOOD'?value(metric.latest.value):'—'}} {{metric.unit}}</span><span>质量 {{metric.latest.quality}} · {{time(metric.latest.observedAt)}}</span><p v-if="metric.history">{{metric.history.hours}}h：有效 {{metric.history.valid_samples}} / {{metric.history.expected_samples}}，缺测 {{metric.history.missing_samples}}，过期 {{metric.history.stale_samples}}；覆盖 {{(metric.history.coverage*100).toFixed(1)}}%<br/>有效样本最小 / 最大 / 均值：{{value(metric.history.min)}} / {{value(metric.history.max)}} / {{value(metric.history.mean)}} {{metric.unit}}</p></div>
   <p v-for="alarm in item.alarms" :key="alarm.alarmId">演示告警 {{alarm.status}} · {{time(alarm.occurredAt)}}</p><small v-for="limitation in item.limitations" :key="limitation">{{limitation}}</small>
   <div class="evidence-refs">依据：<code v-for="id in item.evidence_ids" :key="id">{{id}}</code></div>
  </article>
  <article v-for="e in task.evidence.filter(e=>e.tool_name==='alarm.inspect')" :key="e.evidence_id" class="finding alarm-basis"><strong>告警触发依据</strong><p>{{time(e.data.alarm.occurredAt)}} · 触发值 {{value(e.data.alarm.valueAtEvent)}} {{e.data.unit}}</p><p>演示规则：{{e.data.operator}} {{e.data.threshold}} {{e.data.unit}}；比较结果 {{e.data.trigger_comparison?'触发':'未触发'}}</p><p>事件质量 {{e.data.event_quality}}；当前质量 {{e.data.current_quality}}</p><small>{{e.data.event_quality_basis}}；{{e.data.limitation}}</small><code>{{e.evidence_id}}</code></article>
  <p v-for="error in task.errors" :key="error.code+error.tool" class="task-error">{{error.tool}} · {{error.code}}：{{error.message}}</p>
  <p v-if="task.explanation" class="task-explanation">{{task.explanation}}</p>
  <div class="result-trends"><button v-for="e in task.evidence.filter(e=>e.tool_name==='device.get_metrics'&&e.data.metrics?.some((m:any)=>m.history))" :key="e.evidence_id" class="secondary-button" :disabled="task.status==='RUNNING'||task.scenario_id!==scenarioId" @click="$emit('trend',e.evidence_id)">显示该证据时刻趋势</button></div>
  <details><summary>依据、权限与限制</summary><p>只读模拟数据；展示动作仅改变相机、选择和图表。没有告警或已建模不证明设备正常。不提供参数调整或现场健康认证。</p><p>历史序列快照保留最近十项任务；工具结果和执行记录保留。</p><code v-for="e in task.evidence" :key="e.evidence_id">{{e.evidence_id}} · {{e.tool_name}}</code></details>
 </section>
</template>
