import {businessRequest} from './businessClient.ts'
import {AgentError} from '../agent/contracts.ts'
import type {BusinessToolSource} from '../agent/businessTools.ts'
export const businessToolSource:BusinessToolSource=async(name,args,context,signal)=>{
 if(!context.snapshot.backend)throw new AgentError('BUSINESS_DATA_NOT_READY','业务快照尚未就绪，未使用离线数据替代')
 const base='/snapshots/'+encodeURIComponent(context.snapshot.snapshotId),device=encodeURIComponent(String(args.device_id??''))
 let path:string
 if(name==='device.get_details')path=base+'/devices/'+device+'/details'
 else if(name==='device.get_metrics'){
  const query=new URLSearchParams();if(args.metric_keys)query.set('metricKeys',(args.metric_keys as string[]).join(','));if(args.hours!==undefined)query.set('hours',String(args.hours));path=base+'/devices/'+device+'/metrics?'+query
 }else if(name==='alarm.list')path=base+'/alarms'+(args.device_id?'?deviceId='+device:'')
 else path=base+'/alarms/'+encodeURIComponent(String(args.alarm_id))
 const result=await businessRequest<Awaited<ReturnType<BusinessToolSource>>>(path,{signal});context.assertActive()
 if(result.snapshot_id!==context.snapshot.snapshotId||Date.parse(result.as_of)!==Date.parse(context.snapshot.demoTime)||result.source!=='SIMULATED')throw new AgentError('SNAPSHOT_MISMATCH','服务端证据版本与任务快照不一致')
 return result
}
