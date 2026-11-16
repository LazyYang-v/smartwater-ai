<script setup lang="ts">
import { computed } from 'vue'
import { PhDrop,PhWaves,PhLightning,PhWarningCircle } from '@phosphor-icons/vue'
import { displayValue, qualityLabel, RULES, type Snapshot } from '../../data/mockDataProvider'
const props=defineProps<{snapshot:Snapshot}>()
const items=computed(()=>[
  {key:'do',title:'当前溶解氧',icon:PhDrop,reading:props.snapshot.readings.do,note:'一号曝气池 · '+RULES.lowDo.label},
  {key:'depth',title:'当前水深',icon:PhWaves,reading:props.snapshot.readings.depth,note:'一号曝气池 · 固定演示水深'},
  {key:'blower_power',title:'关联鼓风机功率',icon:PhLightning,reading:props.snapshot.readings.blower_power,note:'B-01 · 同一设备 / 三维映射'},
])
</script>
<template>
  <section class="kpi-overview" aria-label="关键模拟指标" :data-snapshot-id="snapshot.snapshotId">
    <article v-for="item in items" :key="item.key" class="kpi-card" :data-metric="item.key" :data-alert="item.key==='do'&&snapshot.alarms.length>0" :data-quality="item.reading.quality" :data-value="item.reading.value">
      <span class="kpi-icon"><component :is="item.icon" :size="24"/></span><div><div class="kpi-label">{{item.title}}<span class="quality" :data-quality="item.reading.quality">{{qualityLabel(item.reading.quality)}}</span></div><div class="kpi-number">{{displayValue(item.reading)}}<small>{{item.reading.unit}}</small></div><p>{{item.note}}</p></div>
    </article>
    <article class="kpi-card alarm-kpi" data-metric="alarm_count" :data-value="snapshot.alarms.length" :data-active="snapshot.alarms.length>0"><span class="kpi-icon"><PhWarningCircle :size="25"/></span><div><div class="kpi-label">当前有效告警<span class="quality">演示规则</span></div><div class="kpi-number">{{snapshot.alarms.length}}<small>项</small></div><p>{{snapshot.alarms.some(a=>a.status==='AWAITING_DATA')?'含待数据确认事件 · 未自动解除':'根据当前告警集合计算'}}</p></div></article>
  </section>
</template>
