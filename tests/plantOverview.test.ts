import {test} from 'node:test'
import assert from 'node:assert/strict'
import {BoxGeometry,Group,Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three'
import {AssetCache} from '../src/scene/assetCache.ts'
import {createPlantGroundGeometry,PLANT_LAYOUT} from '../src/scene/plantSite.ts'
import {DeviceRegistry} from '../src/scene/deviceRegistry.ts'

test('dual-unit registry bounds use world placement and exclude site or labels',()=>{
 const root=new Group(),registry=new DeviceRegistry()
 for(const p of PLANT_LAYOUT.placements){const device=new Group();device.userData.device_id=p.deviceId;device.position.fromArray(p.position);device.rotation.y=p.yaw;device.add(new Mesh(new BoxGeometry(4,2,4),new MeshBasicMaterial()));root.add(device)}
 const unrelated=new Mesh(new BoxGeometry(1000,1000,1000),new MeshBasicMaterial());root.add(unrelated)
 registry.register(root,PLANT_LAYOUT.placements.map(p=>p.deviceId))
 for(const p of PLANT_LAYOUT.placements){const b=registry.bounds(p.deviceId);assert.equal(b.getCenter(new Vector3()).x,p.position[0]);assert.equal(b.getSize(new Vector3()).x,4)}
 assert.equal(registry.ids().length,2);registry.select('SW_CLR_TANK_001');assert.equal(registry.selectedId,'SW_CLR_TANK_001')
})
test('shared ground has both pool openings at original ground level, with solid ground between',()=>{
 const geometry=createPlantGroundGeometry(),mesh=new Mesh(geometry,new MeshBasicMaterial())
 const hit=(x:number,z:number)=>new Raycaster(new Vector3(x,3,z),new Vector3(0,-1,0)).intersectObject(mesh)
 assert.equal(hit(-22,0).length,0);assert.equal(hit(-42,8).length,0);assert.equal(hit(31,0).length,0);assert.equal(hit(40,0).length,0)
 const between=hit(8,0);assert.ok(between.length);assert.ok(Math.abs(between[0]!.point.y)<.00001)
 geometry.dispose();(mesh.material as MeshBasicMaterial).dispose()
})
test('asset cache reuses in-flight and ready requests without releasing mode-shared resources',async()=>{
 let resolve:(value:{id:number})=>void=()=>{},calls=0,releases=0
 const cache=new AssetCache<{id:number}>(()=>{calls++;return new Promise(r=>resolve=r)},()=>releases++)
 const a=cache.get('bio'),b=cache.get('bio');assert.equal(a,b);resolve({id:1});assert.equal(await a,await b);assert.equal(await cache.get('bio'),await a)
 assert.equal(calls,1);assert.equal(releases,0);cache.dispose();await Promise.resolve();assert.equal(releases,1)
})
test('failed cache entry can retry and late completion after disposal cannot be promoted',async()=>{
 let calls=0,release:(value:{id:number})=>void=()=>{},releases=0
 const cache=new AssetCache<{id:number}>(async()=>{calls++;if(calls===1)throw new Error('LOAD_FAILED');return new Promise(r=>release=r)},()=>releases++)
 await assert.rejects(cache.get('clarifier'),/LOAD_FAILED/);const pending=cache.get('clarifier');cache.dispose();release({id:2});await assert.rejects(pending,/ASSET_CACHE_DISPOSED/);assert.equal(calls,2);assert.equal(releases,1)
})
