<script setup lang="ts">
import { BASIN_ID,METRICS,displayValue,qualityLabel,type Snapshot,type DataEntity } from '../../data/mockDataProvider'
defineProps<{snapshot:Snapshot;entity:DataEntity;selectedId:string|null;ready:boolean;loadedIds:string[]}>()
defineEmits<{locate:[id:string];context:[id:string]}>()
</script>
<template>
  <section class="info-panel device-summary" :data-context-id="entity.id" :data-snapshot-id="snapshot.snapshotId">
    <div class="panel-heading"><h2>对象信息</h2><span class="subtle-badge">{{entity.modelStatus==='MODELLED'?'有三维模型':entity.modelStatus==='DATA_ONLY'?'DATA_ONLY':'示意 / 未建模'}}</span></div>
    <h3>{{entity.name}}</h3><code class="device-id">{{entity.id}}</code><p class="description">{{entity.description}}</p>
    <dl class="reading-list"><div v-for="key in entity.metrics" :key="key" :data-detail-metric="key" :data-value="snapshot.readings[key].value"><dt>{{METRICS[key].label}}</dt><dd>{{displayValue(snapshot.readings[key])}} <small>{{METRICS[key].unit}}</small><span class="quality" :data-quality="snapshot.readings[key].quality">{{qualityLabel(snapshot.readings[key].quality)}}</span></dd></div></dl>
    <p v-if="!entity.metrics.length" class="unmodelled-reason">暂无该设备数据</p><p class="selection-note">{{selectedId===entity.id?'三维：该设备已选中':selectedId?'三维：当前选中其他设备':'三维：无选中对象'}}</p>
    <button class="secondary-button locate-context" :disabled="entity.modelStatus!=='MODELLED'||!ready||!loadedIds.includes(entity.id)" @click="$emit('locate',entity.id)">定位设备</button>
    <p v-if="entity.modelStatus!=='MODELLED'" class="unmodelled-reason">暂无三维模型，无法定位；不会飞往其他对象。</p><p v-else-if="!loadedIds.includes(entity.id)" class="unmodelled-reason">该单元尚未加载，请先切换当前模型单元。</p><p v-else-if="!ready" class="unmodelled-reason">场景未就绪，定位暂不可用。</p>
    <button v-if="entity.id===BASIN_ID" class="text-button linked-blower" @click="$emit('context','SW_AIR_BLOWER_001')">查看关联鼓风机 →</button>
  </section>
</template>
