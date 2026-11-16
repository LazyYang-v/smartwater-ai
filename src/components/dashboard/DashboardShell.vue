<script setup lang="ts">
defineProps<{leftCollapsed:boolean;trendsExpanded:boolean}>()
</script>
<template>
  <div class="dashboard m1-dashboard"><slot name="header"/><slot name="controls"/><slot name="kpis"/>
    <main class="dashboard-workspace" :class="{'left-collapsed':leftCollapsed,'trends-expanded':trendsExpanded}"><aside class="info-sidebar"><slot name="information"/></aside><div class="center-stack"><slot name="scene"/><slot name="trends"/></div><slot name="agent"/></main><slot name="footer"/>
  </div>
</template>
