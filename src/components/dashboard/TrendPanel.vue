<script setup lang="ts">
import {historyPoints} from '../../charts/historyPoints'
import { computed,onBeforeUnmount,onMounted,ref,watch,nextTick } from 'vue'
import type { EChartsType } from 'echarts/core'
import { diagnosticControls,ownership } from '../../diagnostics/stability'
import { createChart,disposeChart,chartStats } from '../../charts/runtime'
import { trendWindow,chartValue,displayValue,qualityLabel,RULES,METRICS,type Snapshot } from '../../data/mockDataProvider'
const props=defineProps<{snapshot:Snapshot;metric:'do'|'blower_power';hours:1|6|24;visible:boolean;contextActive:boolean;available:boolean;evidenceId?:string}>()
const emit=defineEmits<{range:[hours:1|6|24];rendered:[proof:{snapshotId:string;metric:string;hours:number;evidenceId?:string}]}>()
const host=ref<HTMLElement>()
let chart:EChartsType|undefined,observer:ResizeObserver|undefined,resizeFrame=0,lastWidth=0,lastHeight=0,needsUpdate=true
const points=computed(()=>trendWindow(props.snapshot,props.metric,props.hours))
const seriesPoints=computed(()=>historyPoints(points.value,60000))
const current=computed(()=>props.snapshot.readings[props.metric])
const metricInfo=computed(()=>METRICS[props.metric])
const time=(v:string)=>new Date(v).toLocaleTimeString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'})
function update() {
  if(!props.available||diagnosticControls.chartsPaused||document.visibilityState!=='visible'||!chart||!props.visible||!host.value?.clientWidth||!host.value?.clientHeight){needsUpdate=true;return}
  const color=props.metric==='do'?'#64d6e8':'#8caaf5'
  chart.setOption({animation:false,aria:{enabled:true},textStyle:{fontFamily:'PingFang SC, sans-serif'},
    grid:{left:43,right:18,top:24,bottom:31},legend:{data:[metricInfo.value.label],top:0,right:0,textStyle:{color:'#a9c1d3',fontSize:11}},
    tooltip:{trigger:'axis',backgroundColor:'#0c2032',borderColor:'#3a637c',textStyle:{color:'#e6f1f7'},formatter:(params:unknown)=>{
      const p=(params as {data:[number,number|null,number]}[])[0];const item=p&&points.value[p.data[2]]
      return item?`${time(item.sampleAt)}<br/>${metricInfo.value.label}：${displayValue(item)} ${item.unit}<br/>质量：${qualityLabel(item.quality)} · SIMULATED`:'无上报记录 · 区间断线 · SIMULATED'
    }},
    xAxis:{type:'time',min:Date.parse(props.snapshot.demoTime)-props.hours*3600_000,max:Date.parse(props.snapshot.demoTime),splitNumber:4,axisLabel:{color:'#9fb4c7',fontSize:11,formatter:(value:number)=>time(new Date(value).toISOString()).slice(0,5)},axisLine:{lineStyle:{color:'#32495c'}},axisTick:{show:false},splitLine:{show:false}},
    yAxis:{type:'value',name:metricInfo.value.unit,nameTextStyle:{color:'#9fb4c7',fontSize:11},min:props.metric==='do'?0:60,max:props.metric==='do'?4:100,splitNumber:3,axisLabel:{color:'#9fb4c7',fontSize:11},splitLine:{lineStyle:{color:'#223a4c',type:'dashed'}}},
    series:[{id:props.metric,name:metricInfo.value.label,type:'line',data:seriesPoints.value,encode:{x:0,y:1},showSymbol:false,connectNulls:false,smooth:false,lineStyle:{width:2,color},itemStyle:{color},areaStyle:{color,opacity:.07},
      markLine:props.metric==='do'?{silent:true,symbol:'none',label:{show:true,formatter:'演示阈值 '+(props.snapshot.backend?.rules??RULES).lowDo.below.toFixed(1),color:'#d0ae75',fontSize:10,position:'insideEndTop'},lineStyle:{color:'#bc965d',type:'dashed',width:1},data:[{yAxis:(props.snapshot.backend?.rules??RULES).lowDo.below}]}:undefined}],
  },{notMerge:false,lazyUpdate:false});needsUpdate=false;chartStats.updates++;emit('rendered',{snapshotId:props.snapshot.snapshotId,metric:props.metric,hours:props.hours,evidenceId:props.evidenceId})
}
function resize() {
  if(!host.value||!props.visible||document.visibilityState!=='visible')return
  const width=host.value.clientWidth,height=host.value.clientHeight
  if(!width||!height)return
  if(!chart) {chart=createChart(host.value);lastWidth=width;lastHeight=height;update();return}
  if(width!==lastWidth||height!==lastHeight){lastWidth=width;lastHeight=height;chart.resize();chartStats.resizes++}
  if(needsUpdate)update()
}
function visibilityChanged(){if(document.visibilityState==='visible'){resize();update()}}
onMounted(()=>{ownership.trendMounts++;ownership.observers++;ownership.listeners++;document.addEventListener('visibilitychange',visibilityChanged);observer=new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(resize)});observer.observe(host.value!);resize()})
watch(()=>props.snapshot.snapshotId,update)
watch(()=>props.hours,update)
watch(()=>props.available,async()=>{await nextTick();resize();update()})
watch(()=>props.contextActive,async()=>{await nextTick();resize();update()})
watch(()=>props.evidenceId,update)
watch(()=>props.visible,async()=>{await nextTick();resize();update()})
onBeforeUnmount(()=>{ownership.trendUnmounts++;ownership.observers--;ownership.listeners--;document.removeEventListener('visibilitychange',visibilityChanged);observer?.disconnect();cancelAnimationFrame(resizeFrame);if(chart)disposeChart(chart)})
</script>
<template>
  <section class="trend-panel info-panel"  :data-trend="metric" :data-snapshot-id="snapshot.snapshotId" :data-hours="hours" :class="{'context-active':contextActive,'trend-unavailable':!available}" :data-last-value="available?current.value:undefined">
    <div class="trend-heading"><div><h2>{{available?(metric==='do'?'一号曝气池 DO':'关联鼓风机功率'):'设备趋势 · 未配置'}}</h2><span class="trend-current" :data-quality="current.quality">{{available?displayValue(current)+' '+current.unit+' · '+qualityLabel(current.quality):'暂无该设备数据'}}</span></div><div class="range-switch" aria-label="趋势时间范围"><button v-for="range in [1,6,24] as const" :key="range" :aria-pressed="hours===range" @click="emit('range',range)">{{range}}h</button></div></div>
    <div v-if="!available" class="trend-empty">暂无该设备数据<br/><small>未定义过程模拟指标，不借用其他设备曲线</small></div><div ref="host" class="trend-chart" :aria-hidden="!available" role="img" :aria-label="`${metricInfo.label} ${hours}小时演示趋势，末值 ${displayValue(current)} ${current.unit}，${qualityLabel(current.quality)}`"/>
    <div v-if="evidenceId" class="pinned-trend-label">任务快照 · 截至 {{time(snapshot.demoTime)}} · {{evidenceId}}</div><div v-show="available" class="trend-caption"><span>SIMULATED · {{snapshot.backend?'数据库查询时间':'演示时间'}} / 北京时间</span><span v-if="current.quality!=='GOOD'" class="quality-warning">{{qualityLabel(current.quality)}}保留断点，不补零</span><span v-else>{{metric==='do'?'阈值仅供演示':'kW 为功率，非电量'}}</span><details class="sample-table"><summary>样本</summary><table><caption>最近五个模拟样本</caption><thead><tr><th>时间</th><th>值 / 单位</th><th>质量</th></tr></thead><tbody><tr v-for="p in points.slice(-5)" :key="p.sampleAt"><td>{{time(p.sampleAt)}}</td><td>{{displayValue(p)}} {{p.unit}}</td><td>{{qualityLabel(p.quality)}}</td></tr></tbody></table></details></div>
  </section>
</template>
