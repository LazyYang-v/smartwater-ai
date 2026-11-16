<script setup lang="ts">
import {computed} from 'vue'
import { RULES,type Snapshot } from '../../data/mockDataProvider'
const props=defineProps<{snapshot:Snapshot;activeAlarmId:string|null;ready:boolean;contextId:string;hasData:boolean}>()
const alarms=computed(()=>props.snapshot.alarms.filter(alarm=>alarm.deviceId===props.contextId))
defineEmits<{select:[id:string];locate:[id:string]}>()
const time=(v:string)=>new Date(v).toLocaleTimeString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'})
</script>
<template>
  <section class="info-panel alarm-panel"><div class="panel-heading"><h2>当前告警</h2><span class="count-badge">{{alarms.length}}</span></div>
    <p v-if="contextId==='SW_BIO_AERATION_001'" class="panel-caption">{{RULES.lowDo.label}} · 非运行建议</p>
    <div v-if="!alarms.length" class="alarm-empty">{{hasData?'暂无该设备演示告警':'暂无该设备数据'}}<small>{{hasData?'依据本快照指标与演示规则':'不使用其他设备的指标推断正常状态'}}</small></div>
    <article v-for="alarm in alarms" :key="alarm.alarmId" class="alarm-item" :data-alarm-id="alarm.alarmId" :data-status="alarm.status"><button class="alarm-select" @click="$emit('select',alarm.alarmId)" :aria-expanded="activeAlarmId===alarm.alarmId"><span>预警 · 一号曝气池 DO 偏低</span><time>{{time(alarm.occurredAt)}}</time></button><p>{{alarm.status==='ACTIVE'?'事件生效':'待数据确认 · 未解除'}}</p>
      <div v-if="activeAlarmId===alarm.alarmId" class="alarm-detail"><code>{{alarm.alarmId}}</code><p>设备 {{alarm.deviceId}}</p><p>{{alarm.rule}}；发生时 {{alarm.valueAtEvent.toFixed(2)}} mg/L。</p><p>来源 SIMULATED · 指标溶解氧</p></div>
      <button class="secondary-button alarm-locate" :disabled="!ready" @click="$emit('locate',alarm.deviceId)">定位设备</button>
    </article>
  </section>
</template>
