import type {Reading} from '../data/mockDataProvider.ts'
// Render-only gap marker; never creates a telemetry record or enters statistics.
export function historyPoints(points:Reading[],cadenceMs:number):[number,number|null,number][]{
 const result:[number,number|null,number][]=[]
 for(let i=0;i<points.length;i++){
  const point=points[i]!,at=Date.parse(point.sampleAt),previous=points[i-1]
  if(previous&&at-Date.parse(previous.sampleAt)>cadenceMs*1.5)result.push([Date.parse(previous.sampleAt)+cadenceMs,null,-1])
  result.push([at,point.quality==='GOOD'?point.value:null,i])
 }
 return result
}
