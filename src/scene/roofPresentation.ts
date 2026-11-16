// Viewer-only roof state. Auto inspection never overwrites a user's manual choice.
export class RoofPresentation {
  private manual=new Map<string,boolean>()
  private inspecting:string|null=null
  select(id:string|null){this.inspecting=id}
  set(id:string,visible:boolean){this.manual.set(id,visible);if(this.inspecting===id)this.inspecting=null}
  visible(id:string){return this.manual.get(id)!==false&&this.inspecting!==id}
  snapshot(){return {inspectionDevice:this.inspecting,manual:Object.fromEntries(this.manual)}}
}
