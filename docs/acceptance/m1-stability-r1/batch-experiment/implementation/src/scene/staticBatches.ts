import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Diagnostic experiment: identical opaque static geometry/materials, grouped within
// each existing device/site root. Original identifiers and bounds remain intact.
export function staticBatches(root:THREE.Object3D) {
 root.updateWorldMatrix(true,true)
 const entries:{original:THREE.Mesh;visible:boolean}[]=[],batches:THREE.Mesh[]=[]
 for(const name of ['SW_BIO_AERATION_001','SW_SITE_CONTEXT']) {
  const parent=root.getObjectByName(name);if(!parent)continue
  const inverse=parent.matrixWorld.clone().invert(),groups=new Map<string,THREE.Mesh[]>()
  parent.traverse(object=>{
   if(!(object instanceof THREE.Mesh)||object instanceof THREE.SkinnedMesh||object instanceof THREE.InstancedMesh||Array.isArray(object.material)||object.material.transparent||object.name==='WATER_Surface'||object.geometry.morphAttributes.position||!object.visible||object.matrixWorld.determinant()<=0)return
   const attrs=Object.entries(object.geometry.attributes as Record<string,THREE.BufferAttribute|THREE.InterleavedBufferAttribute>).map(([k,v])=>`${k}:${v.itemSize}:${v.normalized}`).sort().join(',')
   const key=[object.material.uuid,object.castShadow,object.receiveShadow,attrs,!!object.geometry.index].join('|')
   const list=groups.get(key)??[];list.push(object);groups.set(key,list)
  })
  for(const list of groups.values()) {
   if(list.length<2)continue
   const copies=list.map(mesh=>mesh.geometry.clone().applyMatrix4(inverse.clone().multiply(mesh.matrixWorld)))
   const geometry=mergeGeometries(copies,false);copies.forEach(g=>g.dispose())
   if(!geometry)continue
   geometry.computeBoundingBox();geometry.computeBoundingSphere()
   const mesh=new THREE.Mesh(geometry,list[0]!.material);mesh.name='SW_DIAGNOSTIC_STATIC_BATCH_'+batches.length;mesh.castShadow=list[0]!.castShadow;mesh.receiveShadow=list[0]!.receiveShadow;mesh.visible=false
   parent.add(mesh);batches.push(mesh);for(const original of list)entries.push({original,visible:original.visible})
  }
 }
 return {set(enabled:boolean){for(const {original,visible} of entries)original.visible=enabled?false:visible;for(const mesh of batches)mesh.visible=enabled},stats:()=>({eligibleOriginals:entries.length,batchMeshes:batches.length})}
}
