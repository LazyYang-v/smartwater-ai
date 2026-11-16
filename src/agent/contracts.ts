export const TOOL_NAMES=['scene.focus_device','scene.reset_view','device.get_details','device.get_metrics','chart.show_trend','alarm.list','alarm.inspect'] as const
export type AgentToolName=typeof TOOL_NAMES[number]
export type Field={type:'string'|'integer'|'array';maxLength?:number;enum?:readonly (string|number)[];items?:Field;maxItems?:number;uniqueItems?:boolean}
const device={type:'string',maxLength:80} as const,metric={type:'string',enum:['do','ph','depth','blower_power']} as const,hours={type:'integer',enum:[1,6,24]} as const
const definition=(name:AgentToolName,description:string,permission:'READ_DATA'|'PRESENTATION',properties:Record<string,Field>,required:string[],timeoutMs:number)=>({name,description,permission,inputSchema:{type:'object',properties,required,additionalProperties:false},resultSchema:{type:'object',required:['evidence_id','snapshot_id','as_of','source','quality','data'],properties:{evidence_id:{type:'string'},snapshot_id:{type:'string'},as_of:{type:'string'},source:{const:'SIMULATED'},quality:{type:'string'},data:{type:'object'}}},errors:['INVALID_ARGUMENTS','DEVICE_NOT_FOUND','METRIC_NOT_OWNED','HISTORY_NOT_AVAILABLE','ALARM_NOT_FOUND','EVIDENCE_MISMATCH','SCENE_NOT_READY','LOAD_FAILED','DISPLAY_FAILED','TIMEOUT','CANCELLED'],limits:{argumentBytes:4096,timeoutMs,maxItems:1441}})
export const TOOL_DEFINITIONS=[
 definition('scene.focus_device','定位已加载的指定设备，确认相机到位、选中并实际渲染；不修改现场设备。','PRESENTATION',{device_id:device},['device_id'],6500),
 definition('scene.reset_view','恢复当前场景总览并清除选择，确认实际渲染。','PRESENTATION',{},[],6500),
 definition('device.get_details','读取四单元设备资料、模型映射与可用指标；模型状态不是运行状态。','READ_DATA',{device_id:device},['device_id'],2000),
 definition('device.get_metrics','读取固定演示快照的指标；可按1/6/24小时计算已有DO/功率历史统计，缺测不补零。','READ_DATA',{device_id:device,metric_keys:{type:'array',items:metric,maxItems:4,uniqueItems:true},hours},['device_id'],2000),
 definition('chart.show_trend','以任务相同快照展示已有DO或功率趋势，复用原图表。','PRESENTATION',{device_id:device,metric_key:{type:'string',enum:['do','blower_power']},hours,evidence_id:{type:'string',maxLength:100}},['device_id','metric_key','hours'],3000),
 definition('alarm.list','读取该快照的演示告警，空集合不是设备正常证明。','READ_DATA',{device_id:device},[],2000),
 definition('alarm.inspect','读取具体告警的时间、触发值、演示阈值、质量与规则依据，不推断故障因果。','READ_DATA',{alarm_id:{type:'string',maxLength:120}},['alarm_id'],2000),
] as const
export class AgentError extends Error{code:string;constructor(code:string,message:string){super(message);this.code=code}}
function fieldValid(value:unknown,field:Field):boolean{
 if(field.type==='string'&&(typeof value!=='string'||!value.length||value.length>(field.maxLength??200)))return false
 if(field.type==='integer'&&(!Number.isInteger(value)||typeof value!=='number'))return false
 if(field.enum&&!field.enum.includes(value as string|number))return false
 if(field.type==='array'){if(!Array.isArray(value)||value.length>(field.maxItems??4)||value.some(v=>!fieldValid(v,field.items!)))return false;if(field.uniqueItems&&new Set(value).size!==value.length)return false}
 return true
}
export function validateTool(name:unknown,args:unknown):asserts name is AgentToolName{
 const def=TOOL_DEFINITIONS.find(d=>d.name===name);if(!def)throw new AgentError('TOOL_NOT_ALLOWED','工具不在只读白名单内')
 if(!args||typeof args!=='object'||Array.isArray(args)||Object.getPrototypeOf(args)!==Object.prototype||new TextEncoder().encode(JSON.stringify(args)).length>4096)throw new AgentError('INVALID_ARGUMENTS','参数必须为有界JSON对象')
 const entries=Object.entries(args);for(const key of def.inputSchema.required)if(!Object.hasOwn(args,key))throw new AgentError('INVALID_ARGUMENTS','缺少字段：'+key)
 for(const [key,value] of entries){const schema=(def.inputSchema.properties as Record<string,Field>)[key];if(!Object.hasOwn(def.inputSchema.properties,key)||!schema||!fieldValid(value,schema))throw new AgentError('INVALID_ARGUMENTS','非法或额外字段：'+key)}
}
