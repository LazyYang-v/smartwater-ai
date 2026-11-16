import {computed,onMounted,onBeforeUnmount,ref,shallowRef,type Ref,type ShallowRef,type ComputedRef} from 'vue'
import {useMockData} from './useMockData'
import {ENTITIES,BASIN_ID,BLOWER_ID,METRICS,type Snapshot,type DataEntity,type MetricKey,type Scenario,type Alarm} from '../data/mockDataProvider'
import {businessRequest,businessLogin,businessLogout,BusinessApiError,type BusinessUser} from '../api/businessClient'
import {ownership} from '../diagnostics/stability'

export type DashboardData={
 snapshot:ShallowRef<Snapshot>;paused:Ref<boolean>;hidden:Ref<boolean>;running:ComputedRef<boolean>;systemTime:Ref<string>
 switchScenario:(s:Scenario)=>void;setPaused:(paused:boolean)=>void;advance:()=>void
 mode:'BUSINESS_API'|'OFFLINE_DEMO';entities:ComputedRef<DataEntity[]>;ready:ComputedRef<boolean>
 user:ShallowRef<BusinessUser|null>;status:Ref<string>;error:Ref<string>;ledger:ShallowRef<Alarm[]>
 login:(name:string,password:string)=>Promise<void>;logout:()=>Promise<void>;refresh:()=>Promise<void>;command:(id:string,action:'acknowledge'|'close',note:string,key:string)=>Promise<void>
}
export function emptyBusinessSnapshot():Snapshot {
 const at=new Date().toISOString(),id='BUSINESS_NOT_READY'
 return {snapshotId:id,version:'smartwater-business-v02',scenario:'NORMAL',tick:0,demoTime:at,updatedAt:at,readings:Object.fromEntries((Object.keys(METRICS) as MetricKey[]).map(key=>[key,{scopeType:'DEVICE',scopeId:key==='blower_power'?BLOWER_ID:BASIN_ID,metricKey:key,value:null,unit:METRICS[key].unit,observedAt:at,sampleAt:at,quality:'MISSING',source:'SIMULATED',snapshotId:id}])) as Snapshot['readings'],history:{do:[],blower_power:[]},alarms:[]}
}
export function useDashboardData():DashboardData {
 const offline=new URLSearchParams(location.search).get('data')==='demo'
 if(offline){const data=useMockData();return {...data,mode:'OFFLINE_DEMO',entities:computed(()=>ENTITIES),ready:computed(()=>true),user:shallowRef(null),status:ref('OFFLINE_DEMO'),error:ref(''),ledger:shallowRef([]),login:async()=>{},logout:async()=>{},refresh:async()=>data.advance(),command:async()=>{throw new Error('离线演示不写入业务记录')}}}
 const snapshot=shallowRef(emptyBusinessSnapshot()),user=shallowRef<BusinessUser|null>(null),status=ref('CONNECTING'),error=ref(''),paused=ref(false),hidden=ref(document.visibilityState!=='visible'),systemTime=ref(new Date().toISOString()),ledger=shallowRef<Alarm[]>([])
 const entities=computed(()=>[...(snapshot.value.backend?.devices??[]),...ENTITIES.filter(e=>e.modelStatus==='SCHEMATIC')])
 const ready=computed(()=>!!user.value&&status.value==='CONNECTED'&&!!snapshot.value.backend)
 const running=computed(()=>ready.value&&!paused.value&&!hidden.value)
 let timer:ReturnType<typeof setInterval>|undefined,request:AbortController|undefined,generation=0,disposed=false
 async function refresh(){
  if(!user.value||request||disposed)return
  const ticket=generation,controller=new AbortController();request=controller
  try{
   const next=await businessRequest<Snapshot>('/dashboard',{signal:controller.signal})
   const alarms=await businessRequest<Alarm[]>('/alarms',{signal:controller.signal})
   if(ticket!==generation||controller.signal.aborted||disposed)return
   snapshot.value=next;ledger.value=alarms;status.value='CONNECTED';error.value=''
  }catch(e){if(controller.signal.aborted)return;error.value=e instanceof Error?e.message:'业务请求失败';status.value=e instanceof BusinessApiError&&e.status===401?'AUTH_REQUIRED':'ERROR';if(status.value==='AUTH_REQUIRED')user.value=null}
  finally{if(request===controller)request=undefined}
 }
 function invalidate(){generation++;request?.abort();request=undefined}
 async function login(name:string,password:string){invalidate();error.value='';status.value='CONNECTING';try{user.value=await businessLogin(name,password);await refresh()}catch(e){user.value=null;status.value='AUTH_REQUIRED';error.value=e instanceof Error?e.message:'登录失败'}}
 async function logout(){invalidate();await businessLogout();user.value=null;snapshot.value=emptyBusinessSnapshot();ledger.value=[];status.value='AUTH_REQUIRED'}
 function stop(){if(timer!==undefined){clearInterval(timer);timer=undefined;ownership.dataTimers--;ownership.dataTimerStops++}}
 function start(){if(timer!==undefined||hidden.value)return;ownership.dataTimers++;ownership.dataTimerStarts++;let pulses=0;timer=setInterval(()=>{systemTime.value=new Date().toISOString();if(++pulses%5===0&&user.value&&!paused.value)void refresh()},1000)}
 function visibility(){hidden.value=document.visibilityState!=='visible';if(hidden.value){stop();invalidate()}else{start();if(!paused.value)void refresh()}}
 onMounted(async()=>{document.addEventListener('visibilitychange',visibility);ownership.listeners++;start();try{user.value=await businessRequest<BusinessUser>('/auth/me');if(!disposed)await refresh()}catch(e){if(disposed)return;status.value=e instanceof BusinessApiError&&e.status===401?'AUTH_REQUIRED':'ERROR';error.value=e instanceof BusinessApiError&&e.status===401?'':e instanceof Error?e.message:'连接失败'}})
 onBeforeUnmount(()=>{disposed=true;invalidate();stop();document.removeEventListener('visibilitychange',visibility);ownership.listeners--})
 async function command(id:string,action:'acknowledge'|'close',note:string,key:string){await businessRequest('/alarms/'+encodeURIComponent(id)+'/'+action,{method:'POST',body:{note},key});await refresh()}
 return {mode:'BUSINESS_API',snapshot,entities,ready,user,status,error,ledger,paused,hidden,running,systemTime,login,logout,refresh,command,switchScenario:()=>{error.value='业务场景由独立采集器上报，浏览器不生成业务数据'},setPaused:value=>{paused.value=value;if(!value)void refresh()},advance:()=>{void refresh()}}
}
