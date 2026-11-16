import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Group,Object3D} from 'three'
import {DeviceRegistry,DEVICE_ID} from '../src/scene/deviceRegistry.ts'
test('same registry accepts the explicitly loaded clarifier and rejects absent aeration id',()=>{
 const root=new Group(),device=new Object3D();device.userData.device_id='SW_CLR_TANK_001';root.add(device)
 const registry=new DeviceRegistry();registry.register(root,'SW_CLR_TANK_001')
 assert.equal(registry.get('SW_CLR_TANK_001'),device)
 assert.throws(()=>registry.get(DEVICE_ID),/DEVICE_NOT_FOUND/)
 assert.equal(registry.resolve(device),'SW_CLR_TANK_001')
})

test('one registry replaces aeration with clarifier and removes previous root selection',()=>{
 const root=new Group(),bio=new Object3D();bio.userData.device_id=DEVICE_ID;root.add(bio)
 const second=new Group(),clarifier=new Object3D();clarifier.userData.device_id='SW_CLR_TANK_001';second.add(clarifier)
 const registry=new DeviceRegistry();registry.register(root);registry.select(DEVICE_ID);registry.register(second,'SW_CLR_TANK_001')
 assert.equal(registry.selectedId,null);assert.throws(()=>registry.get(DEVICE_ID),/DEVICE_NOT_FOUND/);assert.equal(registry.get('SW_CLR_TANK_001'),clarifier)
})
