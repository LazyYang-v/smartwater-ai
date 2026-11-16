// App-owned registrations only; these counts do not describe browser/Vue internals.
export const ownership = { renderers:0, rendererCreated:0, rendererDisposed:0, observers:0, listeners:0, dataTimers:0, dataTimerStarts:0, dataTimerStops:0, trendMounts:0, trendUnmounts:0 }
export const diagnosticControls = { chartsPaused:false, scenePaused:false }
export const inputEvents:{event:string;at:number;actionId?:string;trusted?:boolean;eventTimestamp?:number}[]=[]
export let diagnosticsEnabled = false
export function enableDiagnostics(value:boolean) { diagnosticsEnabled=value }
export function traceInput(event:string,detail:Omit<(typeof inputEvents)[number],'event'|'at'>={}) {
  if(!diagnosticsEnabled)return
  inputEvents.push({event,at:performance.now(),...detail});if(inputEvents.length>500)inputEvents.shift()
}
