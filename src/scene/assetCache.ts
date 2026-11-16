// Two-asset, runtime-owned cache: share in-flight work and never dispose on view changes.
export class AssetCache<T> {
  private pending=new Map<string,Promise<T>>()
  private closed=false
  readonly requests:Record<string,number>={}
  private loader:(key:string)=>Promise<T>
  private release:(value:T)=>void
  constructor(loader:(key:string)=>Promise<T>,release:(value:T)=>void){this.loader=loader;this.release=release}
  get(key:string):Promise<T>{
    if(this.closed)return Promise.reject(new Error('ASSET_CACHE_DISPOSED'))
    const existing=this.pending.get(key);if(existing)return existing
    this.requests[key]=(this.requests[key]??0)+1
    const promise=this.loader(key).then(value=>{if(this.closed){this.release(value);throw new Error('ASSET_CACHE_DISPOSED')}return value}).catch(error=>{if(this.pending.get(key)===promise)this.pending.delete(key);throw error})
    this.pending.set(key,promise);return promise
  }
  dispose(){if(this.closed)return;this.closed=true;for(const value of this.pending.values())void value.then(this.release,()=>{});this.pending.clear()}
}
