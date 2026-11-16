import {summary,type TaskArchive,type TaskSummary} from './records.ts'
import type {TaskReport} from './report.ts'
export const TASK_DB='smartwater-tasks-v1'
export type HistoryPage={items:TaskSummary[];next:string|null}
export interface TaskStorage{open():Promise<void>;save(archive:TaskArchive,report?:TaskReport):Promise<void>;get(id:string):Promise<TaskArchive|undefined>;report(id:string):Promise<TaskReport|undefined>;list(before?:string|null,limit?:number):Promise<HistoryPage>;running():Promise<TaskArchive[]>;close():void}
const request=<T>(r:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
export class TaskRepository implements TaskStorage{
 private db:IDBDatabase|null=null
 readonly name:string
 private factory:IDBFactory|undefined
 constructor(name=TASK_DB,factory:IDBFactory|undefined=globalThis.indexedDB){this.name=name;this.factory=factory}
 async open(){if(this.db)return;if(!this.factory)throw new Error('STORAGE_UNAVAILABLE: 浏览器不支持 IndexedDB');this.db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=this.factory!.open(this.name,1);r.onupgradeneeded=()=>{const db=r.result,store=db.createObjectStore('tasks',{keyPath:'task.task_id'});store.createIndex('started_at','task.started_at');store.createIndex('execution_status','execution_status');db.createObjectStore('reports',{keyPath:'report_id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('STORAGE_BLOCKED: 请关闭同站点旧版本标签页后重试'));});this.db.onversionchange=()=>this.close()}
 private database(){if(!this.db)throw new Error('STORAGE_UNAVAILABLE: 数据库尚未打开');return this.db}
 async save(archive:TaskArchive,report?:TaskReport){const db=this.database();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(report?['tasks','reports']:['tasks'],'readwrite');tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new Error('WRITE_ABORTED'));tx.onerror=()=>{/* onabort owns the final failure */};tx.objectStore('tasks').put(archive);if(report){const store=tx.objectStore('reports'),r=store.get(report.report_id);r.onsuccess=()=>{if(!r.result)store.add(report)}}})}
 async get(id:string){return await request(this.database().transaction('tasks').objectStore('tasks').get(id)) as TaskArchive|undefined}
 async report(id:string){return await request(this.database().transaction('reports').objectStore('reports').get(id)) as TaskReport|undefined}
 async list(before:string|null=null,limit=20):Promise<HistoryPage>{const bound=before?JSON.parse(before) as [string,string]:null;return new Promise((resolve,reject)=>{const items:TaskSummary[]=[];let last:TaskArchive|undefined;const store=this.database().transaction('tasks').objectStore('tasks'),r=store.index('started_at').openCursor(bound?IDBKeyRange.upperBound(bound[0]):null,'prev');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const c=r.result;if(!c){resolve({items,next:null});return}const a=c.value as TaskArchive;if(bound&&a.task.started_at===bound[0]&&a.task.task_id>=bound[1]){c.continue();return}if(items.length===limit){resolve({items,next:last?JSON.stringify([last.task.started_at,last.task.task_id]):null});return}items.push(summary(a));last=a;c.continue()}})}
 async running():Promise<TaskArchive[]>{return await request(this.database().transaction('tasks').objectStore('tasks').index('execution_status').getAll('RUNNING')) as TaskArchive[]}
 close(){this.db?.close();this.db=null}
}
export function storageMessage(error:unknown){const e=error as {name?:string;message?:string};return e.name==='QuotaExceededError'?'存储配额不足；当前结果仍在内存中，请导出。':e.name==='SecurityError'?'浏览器禁止本地存储；当前结果仍可导出。':(e.message??'本地写入失败')+'；当前结果保留在内存中，可重试保存或导出。'}
