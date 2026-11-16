import * as THREE from 'three'
import dual from '../../config/plant-layout.json' with {type:'json'}
import bio from '../../config/aeration.json' with {type:'json'}
import clr from '../../config/clarifier.json' with {type:'json'}
import four from '../../config/equipment-layout.json' with {type:'json'}
export type PlantLayout={placements:{deviceId:string;position:number[];yaw:number}[];site:{length:number;width:number;centerZ?:number;thickness:number;roadZ:number;roadWidth:number;plantingZ:number;serviceRoadZ?:number};overviewDirection:number[];overviewFill:number}
export const PLANT_LAYOUT:PlantLayout=dual,FOUR_LAYOUT:PlantLayout=four
export function createPlantGroundGeometry(layout:PlantLayout=PLANT_LAYOUT){
  const {length,width,thickness}=layout.site,shape=new THREE.Shape()
  const z=layout.site.centerZ??0;shape.moveTo(-length/2,-width/2-z);shape.lineTo(length/2,-width/2-z);shape.lineTo(length/2,width/2-z);shape.lineTo(-length/2,width/2-z);shape.closePath()
  for(const unit of layout.placements){
    const points:THREE.Vector2[]=[],[x,,z]=unit.position as [number,number,number]
    if(unit.deviceId==='SW_BIO_AERATION_001'){
      const hx=bio.basin.inner_length/2+bio.basin.wall_thickness,hz=bio.basin.inner_width/2+bio.basin.wall_thickness
      for(const [px,pz] of [[-hx,-hz],[-hx,hz],[hx,hz],[hx,-hz]])points.push(new THREE.Vector2(x+px!*Math.cos(unit.yaw)+pz!*Math.sin(unit.yaw),-(z-px!*Math.sin(unit.yaw)+pz!*Math.cos(unit.yaw))))
    }else if(unit.deviceId==='SW_CLR_TANK_001'){const radius=clr.basin.inner_radius+clr.basin.wall_thickness;for(let i=0;i<256;i++){const angle=i/256*Math.PI*2;points.push(new THREE.Vector2(x+Math.cos(angle)*radius,-z+Math.sin(angle)*radius))}}
    if(points.length)shape.holes.push(new THREE.Path(points))
  }
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false,steps:1});geometry.rotateX(-Math.PI/2);geometry.translate(0,-thickness,0)
  return geometry
}
export function createPlantSite(layout:PlantLayout=PLANT_LAYOUT){
  const root=new THREE.Group();root.name='SW_SITE_CONTEXT'
  const concrete=new THREE.MeshStandardMaterial({color:'#bfc5c1',roughness:.88}),asphalt=new THREE.MeshStandardMaterial({color:'#646b69',roughness:.95}),grass=new THREE.MeshStandardMaterial({color:'#748c54',roughness:1}),curb=new THREE.MeshStandardMaterial({color:'#cdd1ca',roughness:.8}),paint=new THREE.MeshStandardMaterial({color:'#dbd9bf',roughness:.8})
  const ground=new THREE.Mesh(createPlantGroundGeometry(layout),concrete);ground.name='SITE_SharedGround_WithTwoOpenings';ground.receiveShadow=true;root.add(ground)
  function box(name:string,size:number[],at:number[],material:THREE.Material){const mesh=new THREE.Mesh(new THREE.BoxGeometry(size[0],size[1],size[2]),material);mesh.name=name;mesh.position.fromArray(at);mesh.receiveShadow=true;root.add(mesh);return mesh}
  const s=layout.site
  box('SITE_ConnectingRoad',[s.length,.04,s.roadWidth],[0,.02,s.roadZ],asphalt)
  for(const sign of [-1,1])box('SITE_RoadCurb',[s.length,.16,.20],[0,.08,s.roadZ+sign*(s.roadWidth/2+.10)],curb)
  for(let x=-48;x<50;x+=7)box('SITE_RoadMarking',[2.6,.014,.1],[x,.05,s.roadZ],paint)
  for(const [x,length] of [[-22,43],[31,27]])box('SITE_ReusedGrassMaterialStrip',[length!,.07,1.5],[x!,.035,s.plantingZ],grass)
  box('SITE_MaintenanceConnection',[9,.06,2.2],[8.5,.03,0],concrete)
  if(s.serviceRoadZ!==undefined){
    box('SITE_AddedServiceRoad',[67,.035,3.2],[-16.5,.018,s.serviceRoadZ],asphalt)
    for(const x of [-42,-23])box('SITE_EquipmentApronLink',[3,.045,3.5],[x,.023,-18.4],concrete)
    const route=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-23,.07,-17),new THREE.Vector3(-23,.07,-12)])
    const relation=new THREE.Line(route,new THREE.LineDashedMaterial({color:'#387a88',dashSize:.55,gapSize:.4}));relation.name='PROCESS_SCHEMATIC_NOT_PIPE';relation.computeLineDistances();root.add(relation)
  }
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>()
  root.traverse(node=>{if(node instanceof THREE.Mesh||node instanceof THREE.Line){geometries.add(node.geometry);for(const m of Array.isArray(node.material)?node.material:[node.material])materials.add(m)}})
  return {root,dispose:()=>{geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
