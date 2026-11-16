// One owner for the application's Three loop, independent of ECharts animation.
export class LoopLifecycle {
  active=false;starts=0;stops=0;disposed=false
  private startLoop:()=>void;private stopLoop:()=>void
  constructor(start:()=>void,stop:()=>void) {this.startLoop=start;this.stopLoop=stop}
  sync(visible:boolean) {
    const wanted=visible&&!this.disposed
    if(wanted===this.active)return
    this.active=wanted
    if(wanted){this.starts++;this.startLoop()}else{this.stops++;this.stopLoop()}
  }
  dispose(){this.disposed=true;this.sync(false)}
}
