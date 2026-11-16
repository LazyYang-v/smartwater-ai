import { computed,ref,watch,onMounted,onBeforeUnmount,type ComputedRef,type ShallowRef } from 'vue'
import { BASIN_ID,ENTITIES,type Snapshot,type DataEntity } from '../data/mockDataProvider'
import type { SceneRuntime } from '../scene/runtime'

export function useDashboardContext(runtime:ShallowRef<SceneRuntime|undefined>,snapshot:ShallowRef<Snapshot>,entities?:ComputedRef<DataEntity[]>) {
  const contextId=ref(BASIN_ID),activeAlarmId=ref<string|null>(null),hours=ref<1|6|24>(1)
  const activeTrend=ref<'do'|'blower_power'>('do'),leftCollapsed=ref(innerWidth<1600),processCollapsed=ref(true),trendsExpanded=ref(false)
  const breakpoint=matchMedia('(max-width:1599px)')
  const breakpointChanged=()=>{leftCollapsed.value=breakpoint.matches}
  onMounted(()=>breakpoint.addEventListener('change',breakpointChanged))
  onBeforeUnmount(()=>breakpoint.removeEventListener('change',breakpointChanged))
  const entity=computed(()=>(entities?.value??ENTITIES).find(e=>e.id===contextId.value)??ENTITIES[0]!)
  function context(id:string) {
    const item=(entities?.value??ENTITIES).find(e=>e.id===id);if(!item)return false
    contextId.value=id
    if(item.modelStatus==='MODELLED'&&runtime.value?.state.status==='ready'&&runtime.value.state.loadedIds.includes(id))runtime.value.selectFromUser(id)
    if(item.metrics.includes('blower_power'))activeTrend.value='blower_power'
    if(item.metrics.includes('do'))activeTrend.value='do'
    return true
  }
  function selectAlarm(id:string) {
    const alarm=snapshot.value.alarms.find(a=>a.alarmId===id);if(!alarm)return
    activeAlarmId.value=id;contextId.value=alarm.deviceId;activeTrend.value='do';trendsExpanded.value=true
  }
  watch(()=>runtime.value?.state.selectedId,id=>{if(id){contextId.value=id;if(id===BASIN_ID)activeTrend.value='do';else if((entities?.value??ENTITIES).find(e=>e.id===id)?.metrics.includes('blower_power'))activeTrend.value='blower_power'}})
  watch(()=>snapshot.value.scenario,()=>{activeAlarmId.value=null})
  return {contextId,entity,context,activeAlarmId,selectAlarm,hours,activeTrend,leftCollapsed,processCollapsed,trendsExpanded}
}
