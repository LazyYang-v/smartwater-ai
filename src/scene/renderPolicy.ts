export type RenderMode='interactive'|'full'
export function shouldKeepRendering(mode:RenderMode,cameraBusy:boolean,userInteracting:boolean){return mode==='full'||cameraBusy||userInteracting}
