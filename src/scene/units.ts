export type UnitDescriptor={id:string;unitId:string;name:string;url:string;dimensions:string;assetRootNode:string;mechanicalNode:string;metrics:string[];water:boolean;roof:boolean;modelKey:string}
export const UNITS:readonly UnitDescriptor[]=[
 {id:'SW_BIO_AERATION_001',unitId:'SW_UNIT_BIO_001',name:'一号曝气池',url:'/models/aeration-tank.glb',dimensions:'42 × 18 m · 水深 4.8 m',assetRootNode:'SW_BIO_AERATION_001',mechanicalNode:'SW_BIO_AERATION_001',metrics:['do','ph','depth'],water:true,roof:false,modelKey:'aeration'},
 {id:'SW_CLR_TANK_001',unitId:'SW_UNIT_CLR_001',name:'一号二沉池',url:'/models/clarifier-tank.glb',dimensions:'Ø24 m · 二沉池样板',assetRootNode:'SW_CLR_TANK_001',mechanicalNode:'SW_CLR_TANK_001',metrics:[],water:true,roof:false,modelKey:'clarifier'},
 {id:'SW_AIR_BLOWER_001',unitId:'SW_UNIT_BLOWER_ROOM_001',name:'一号鼓风机',url:'/models/blower-unit.glb',dimensions:'12 × 9 m 机房 · 设备独立选择',assetRootNode:'SW_BLOWER_UNIT',mechanicalNode:'SW_AIR_BLOWER_001',metrics:['blower_power'],water:false,roof:true,modelKey:'blower'},
 {id:'SW_PRE_PUMP_001',unitId:'SW_UNIT_PUMP_ROOM_001',name:'一号提升泵',url:'/models/pump-unit.glb',dimensions:'10 × 8 m 泵房 · 演示设备',assetRootNode:'SW_PUMP_UNIT',mechanicalNode:'SW_PRE_PUMP_001',metrics:[],water:false,roof:true,modelKey:'pump'},
]
export const findUnit=(id:string)=>UNITS.find(unit=>unit.id===id)
