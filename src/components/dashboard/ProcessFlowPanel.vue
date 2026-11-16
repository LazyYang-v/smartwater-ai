<script setup lang="ts">
import { ENTITIES,PROCESS,BASIN_ID,CLARIFIER_ID } from '../../data/mockDataProvider'
defineProps<{contextId:string;collapsed:boolean}>()
defineEmits<{context:[id:string];toggle:[]}>()
</script>
<template>
  <section class="info-panel process-panel"><div class="panel-heading"><h2>工艺示意</h2><button class="text-button" @click="$emit('toggle')" :aria-expanded="!collapsed">{{collapsed?'展开':'收起'}}</button></div><p class="panel-caption">A²/O · 沿用参考工艺，曝气池、二沉池和提升泵为演示模型；关联鼓风机见对象信息</p><ol v-if="!collapsed" class="process-list"><li v-for="(id,index) in PROCESS" :key="id"><button :class="{current:contextId===id}" :data-process-id="id" @click="$emit('context',id)"><span class="process-index">{{String(index+1).padStart(2,'0')}}</span><span>{{ENTITIES.find(e=>e.id===id)?.name}}<small v-if="id===BASIN_ID">生化处理 · 好氧段</small></span><em>{{ENTITIES.find(e=>e.id===id)?.modelStatus==='MODELLED'?'单池模型':'示意 / 未建模'}}</em></button></li></ol><p v-else class="panel-caption">进水 → 格栅/提升 → 初沉 → 生化 A²/O → 二沉 → 深度处理/消毒 → 出水</p></section>
</template>
