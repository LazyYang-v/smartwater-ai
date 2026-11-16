<script setup lang="ts">
import { PhDrop,PhCube } from '@phosphor-icons/vue'
import type { Snapshot } from '../../data/mockDataProvider'
defineProps<{snapshot:Snapshot;systemTime:string}>()
const time=(v:string)=>new Date(v).toLocaleTimeString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'})
</script>
<template>
  <header class="dashboard-header">
    <a class="brand" href="/" aria-label="SmartWater 首页"><span class="brand-mark"><PhDrop :size="27" weight="duotone"/></span><span><strong>SmartWater <em>AI</em></strong><small>智慧污水厂 · 三维运营空间</small></span></a>
    <div class="header-title"><h1>智慧水务运营大屏</h1><p><PhCube :size="14"/> v0.1 · 四单元只读 Agent 演示版</p></div>
    <div class="header-clocks"><span>系统时间 <time>{{time(systemTime)}}</time></span><span>数据更新 <time>{{time(snapshot.updatedAt)}}</time></span></div>
    <span class="simulation-badge"><i/>SIMULATED · 演示数据</span>
  </header>
</template>
