export class FrameSample {
  readonly started:number
  timestamps:number[]=[];intervals:number[]=[];calls:number[]=[];submissions=0
  hidden:{at:number;state:string}[]=[]
  constructor(now:number,visible:boolean){this.started=now;if(!visible)this.visibility(now,'hidden')}
  visibility(now:number,state:string){this.hidden.push({at:now,state})}
  callback(now:number){const previous=this.timestamps.at(-1);if(previous!==undefined)this.intervals.push(now-previous);this.timestamps.push(now)}
  submitted(calls:number){this.submissions++;this.calls.push(calls)}
  finish(now:number){
    const duration=now-this.started,sorted=[...this.intervals].sort((a,b)=>a-b)
    const p=(q:number)=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor(sorted.length*q))]!:null
    return {total_duration_ms:duration,sampled_duration_ms:duration,sample_count:this.intervals.length,raf_callbacks:this.timestamps.length,scene_submissions:this.submissions,average_fps:this.submissions*1000/duration,raf_callback_hz:this.timestamps.length*1000/duration,p95_frame_ms:p(.95),p99_frame_ms:p(.99),median_frame_ms:p(.5),frames_over_50_ms:this.intervals.filter(x=>x>50).length,frames_over_100_ms:this.intervals.filter(x=>x>100).length,frame_times_ms:this.intervals,raf_timestamps_ms:this.timestamps,draw_calls_min:this.calls.length?Math.min(...this.calls):null,draw_calls_max:this.calls.length?Math.max(...this.calls):null,page_visible_throughout:!this.hidden.some(e=>e.state!=='visible'),visibility_events:this.hidden,interpretation:'Scene submissions per elapsed sample time; rAF intervals are raw and unclamped. Neither is a measurement of presented frames or GPU time.'}
  }
}
