<script setup lang="ts">
defineProps<{leftCollapsed:boolean;trendsExpanded:boolean;business?:boolean}>()
</script>
<template>
  <div class="dashboard m1-dashboard" :class="{'business-dashboard':business}"><slot name="header"/><slot name="controls"/><slot name="kpis"/>
    <main class="dashboard-workspace" :class="{'left-collapsed':leftCollapsed,'trends-expanded':trendsExpanded}"><aside class="info-sidebar"><slot name="information"/></aside><div class="center-stack"><slot name="scene"/><slot name="trends"/></div><slot name="agent"/></main><slot name="footer"/>
  </div>
</template>
<style scoped>
.dashboard.business-dashboard{grid-template-rows:66px auto 100px minmax(0,1fr) 22px}
@media(min-width:1600px) and (max-height:950px){.dashboard.business-dashboard{grid-template-rows:60px auto 90px minmax(0,1fr) 20px}}
@media(max-width:1599px){.dashboard.business-dashboard{grid-template-rows:60px auto 88px minmax(0,1fr) 18px}}
@media(max-width:900px){.dashboard.business-dashboard{grid-template-rows:auto auto auto auto auto}}
</style>
