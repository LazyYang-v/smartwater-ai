<script setup lang="ts">
import {onMounted,ref,computed} from 'vue'
import {PhCube,PhCrosshair,PhEye,PhEyeSlash,PhArrowCounterClockwise} from '@phosphor-icons/vue'
import {UNITS,findUnit,unitPreviewUrl} from '../../scene/units'
import type {SceneRuntime} from '../../scene/runtime'
const props=defineProps<{runtime:SceneRuntime|undefined}>()
const emit=defineEmits<{attach:[host:HTMLElement];reset:[];unit:[id:string];mode:[mode:'unit'|'plant'|'plant4']}>()
const host=ref<HTMLElement>(),plant=computed(()=>!!props.runtime&&props.runtime.state.viewMode!=='unit')
const four=computed(()=>props.runtime?.state.viewMode==='plant4')
const activeId=computed(()=>plant.value?props.runtime?.state.selectedId:props.runtime?.state.deviceId)
const previewHref=computed(()=>unitPreviewUrl(activeId.value))
const activeUnit=computed(()=>findUnit(activeId.value??''))
const currentName=computed(()=>findUnit(props.runtime?.state.selectedId??props.runtime?.state.deviceId??'')?.name)
const waterDisabled=computed(()=>props.runtime?.state.status!=='ready'||!activeUnit.value?.water)
onMounted(()=>emit('attach',host.value!))
</script>
<template>
 <section class="scene-panel" aria-label="三维场景"><div class="scene-toolbar"><div class="scene-title"><span class="live-dot"/><strong>{{four?'四单元演示厂区':plant?'双单元厂区':'三维现场'}}</strong><small>{{plant?'演示厂区 · 试运行':currentName+'样板'}}</small></div><div class="scene-actions">
 <select class="view-mode-select" aria-label="视图模式" :value="runtime?.state.viewMode" @change="$emit('mode',($event.target as HTMLSelectElement).value as 'unit'|'plant'|'plant4')"><option value="unit">单元查看</option><option value="plant">双单元总览</option><option value="plant4">四单元总览 · 试运行</option></select>
 <select v-if="!plant" class="unit-select" aria-label="当前模型单元" :value="runtime?.state.deviceId" @change="$emit('unit',($event.target as HTMLSelectElement).value)"><option v-for="unit in UNITS" :key="unit.id" :value="unit.id">{{unit.name}}</option></select>
 <a v-if="previewHref" class="asset-preview-link" :href="previewHref" target="_blank" rel="noopener">独立预览 ↗</a><span v-else class="asset-preview-link" aria-disabled="true" title="请先选择要独立预览的设备">独立预览 · 先选择设备</span>
 <label class="render-mode">绘制模式 <select :value="runtime?.state.renderMode" :disabled="plant" @change="runtime?.setRenderMode(($event.target as HTMLSelectElement).value as 'interactive'|'full')"><option value="interactive">交互优先</option><option value="full">完整效果 · 未验证稳定</option></select></label>
 <button data-action="water" :disabled="waterDisabled" :title="plant?'仅作用于当前选中设备；未选择时禁用':'作用于当前单元'" @click="runtime?.setWater(!runtime.state.waterVisible)" :aria-pressed="runtime?.state.waterVisible"><PhEye v-if="runtime?.state.waterVisible" :size="16"/><PhEyeSlash v-else :size="16"/>{{!activeUnit?.water?'仅池体水面':runtime?.state.waterVisible?'隐藏水面':'显示水面'}}</button><button v-if="activeUnit?.roof" data-action="roof" :disabled="runtime?.state.status!=='ready'" :aria-pressed="runtime?.state.roofStates[activeId!]" @click="runtime?.setRoof(!runtime.state.roofStates[activeId!],activeId!)">{{runtime?.state.roofStates[activeId!]?'隐藏屋顶':'显示屋顶'}}</button><button @click="emit('reset')" :disabled="runtime?.state.status!=='ready'"><PhArrowCounterClockwise :size="16"/>恢复总览</button></div></div>
 <div class="viewport"><div ref="host" class="canvas-host"/><div class="view-corner"><span>N</span><i/><small>局部坐标 · 米制</small></div>
 <div v-if="runtime?.state.status!=='ready'" class="load-state" role="status"><PhCube :size="38" weight="thin"/><h2>{{runtime?.state.status==='loading'?'正在载入三维资产':'资产加载失败'}}</h2><p>{{runtime?.state.error||'读取 GLB 与环境光照资源'}}</p><button v-if="runtime?.state.status!=='loading'" @click="runtime?.load()">重新加载</button><small>数据与面板仍可使用</small></div>
 <div v-else-if="runtime.state.error" class="partial-load-error" role="status">部分设备不可用：{{runtime.state.error}} <button @click="runtime?.load()">重试</button></div>
 <div v-if="runtime?.state.selectedId" class="selected-tag"><PhCrosshair :size="16"/>{{currentName}} · 已选中</div><div v-if="runtime?.state.selectedId==='SW_CLR_TANK_001'||(!plant&&runtime?.state.deviceId==='SW_CLR_TANK_001')" class="data-scope-note">二沉池暂无过程指标 · 顶部 KPI 仍属曝气池与关联鼓风机</div><div class="mode-tradeoff">{{four?'四单元试运行 · 交互优先 / 屋顶与水面分开控制':plant?'双单元 · 交互优先 / 水面仅作用于选中设备':runtime?.state.renderMode==='interactive'?'交互优先 · 静止按需绘制 / 水纹动画暂停':'完整效果 · 未验证稳定'}}</div><div class="viewport-hint">拖动旋转 · 滚轮缩放 · 点击选择设备</div><div class="scale-bar"><i/><span>{{four?'演示场地 104 × 52 m':plant?'演示场地 104 × 44 m':runtime?.state.deviceId==='SW_CLR_TANK_001'?'局部场地 40 × 40 m':activeUnit?.roof?'设备单元检修预览':'局部场地 64 × 40 m'}}</span></div></div>
 <div class="scene-footer"><span><i class="status-dot"/>{{four?'四单元演示厂区 · 非工程设计':plant?'两座工艺单元演示 · 非工程设计':runtime?.state.status==='ready'?'场景就绪':'等待资产'}}</span><span>{{plant?runtime?.state.loadedIds.length+(four?' / 4 设备就绪':' / 2 设备就绪'):findUnit(runtime?.state.deviceId??'')?.dimensions}}</span><code>{{runtime?.state.selectedId??(plant?'无设备选中':runtime?.state.deviceId)}}</code></div></section>
</template>
