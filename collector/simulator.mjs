/** Independent simulated acquisition process. No browser or model credentials. */
import {createSnapshot,DEMO_START,METRICS} from '../src/data/mockDataProvider.ts'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
const scenarios=['NORMAL','LOW_DO','MISSING_DATA']
export function batch(scenario,at,{seed=false}={}){
 if(!scenarios.includes(scenario))throw new Error('Unsupported simulated scenario')
 const snapshot=createSnapshot(scenario),offset=at-DEMO_START,all=seed?[...snapshot.history.do,...snapshot.history.blower_power,snapshot.readings.ph,snapshot.readings.depth]:Object.values(snapshot.readings)
 return all.map(r=>{
  // For simulated STALE slots observedAt is the acquisition slot; quality explicitly marks the stale value.
  const observedAt=new Date(Date.parse(r.sampleAt)+offset).toISOString()
  return {sampleId:`sim-v02:${r.scopeId}:${r.metricKey}:${observedAt}`,deviceId:r.scopeId,metricKey:r.metricKey,value:r.value,unit:METRICS[r.metricKey].unit,quality:r.quality,source:'SIMULATED',observedAt}
 })
}
export async function publish(scenario,{seed=false,url='http://127.0.0.1:8080',at=Date.now(),token=process.env.SW_COLLECTOR_TOKEN}={}){
 if(!token)throw new Error('Missing server-side SW_COLLECTOR_TOKEN; use scripts/business.py collect')
 const points=batch(scenario,at,{seed}),results=[]
 for(let i=0;i<points.length;i+=500){const payload=JSON.stringify({scenario,readings:points.slice(i,i+500)}),key='sim-'+createHash('sha256').update(payload).digest('hex');const response=await fetch(url+'/api/business/telemetry',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key,Authorization:'Bearer '+token},body:payload,signal:AbortSignal.timeout(15000)});const result=await response.json();if(!response.ok)throw new Error(`${response.status}: ${result.error?.code??'INGEST_FAILED'} ${result.error?.message??''}`);results.push(result)}
 return {scenario,source:'SIMULATED',samples:points.length,inserted:results.reduce((n,r)=>n+r.inserted,0),duplicates:results.reduce((n,r)=>n+r.duplicates,0),revision:results.at(-1)?.revision}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),scenario=args.find(v=>scenarios.includes(v))??'NORMAL',seed=args.includes('--seed'),continuous=args.includes('--continuous');let stopped=false;process.once('SIGINT',()=>stopped=true);process.once('SIGTERM',()=>stopped=true)
 try{console.log(JSON.stringify(await publish(scenario,{seed})));while(continuous&&!stopped){await new Promise(resolve=>setTimeout(resolve,60000));if(!stopped)console.log(JSON.stringify(await publish(scenario)))}}catch(error){console.error(error.message);process.exitCode=1}
}
