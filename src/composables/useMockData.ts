import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { ownership } from '../diagnostics/stability'
import { MockDataProvider,SimulationClock,type Scenario } from '../data/mockDataProvider'

export function useMockData() {
  const provider=new MockDataProvider()
  const snapshot=shallowRef(provider.snapshot)
  const paused=ref(false),hidden=ref(document.visibilityState!=='visible'),systemTime=ref(new Date().toISOString())
  const clock=new SimulationClock();clock.reset(performance.now())
  let timer:ReturnType<typeof setInterval>|undefined
  const running=computed(()=>!paused.value&&!hidden.value)
  const publish=()=>{snapshot.value=provider.advance(new Date().toISOString())}
  function switchScenario(value:Scenario) { clock.reset(performance.now());snapshot.value=provider.switchScenario(value,new Date().toISOString()) }
  function setPaused(value:boolean) { paused.value=value;clock.reset(performance.now()) }
  function stopTimer(){if(timer!==undefined){clearInterval(timer);timer=undefined;ownership.dataTimers--;ownership.dataTimerStops++}}
  function startTimer(){
    if(timer!==undefined||hidden.value)return
    ownership.dataTimers++;ownership.dataTimerStarts++
    timer=setInterval(()=>{
      const now=performance.now();systemTime.value=new Date().toISOString()
      if(clock.pulse(now,running.value))publish()
    },1000)
  }
  function visibilityChanged() { hidden.value=document.visibilityState!=='visible';clock.reset(performance.now());if(hidden.value)stopTimer();else {systemTime.value=new Date().toISOString();startTimer()} }
  onMounted(()=>{
    snapshot.value=provider.switchScenario('NORMAL',new Date().toISOString())
    document.addEventListener('visibilitychange',visibilityChanged)
    ownership.listeners++;startTimer()
  })
  onBeforeUnmount(()=>{stopTimer();ownership.listeners--;document.removeEventListener('visibilitychange',visibilityChanged)})
  return {snapshot,paused,hidden,running,systemTime,switchScenario,setPaused,advance:publish}
}
