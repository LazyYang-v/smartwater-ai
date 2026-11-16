import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Group,Mesh,BoxGeometry,MeshBasicMaterial,Vector3} from 'three'
import {parseCommand} from '../src/agent/demoParser.ts'
import {DeviceRegistry} from '../src/scene/deviceRegistry.ts'
import {RoofPresentation} from '../src/scene/roofPresentation.ts'
import {UNITS} from '../src/scene/units.ts'
import {BLOWER_ID,PUMP_ID,ENTITIES,createSnapshot} from '../src/data/mockDataProvider.ts'
test('blower model maps to existing power identity; pump defines no invented metrics',()=>{
 const data=createSnapshot(),blower=ENTITIES.filter(e=>e.id===BLOWER_ID)
 assert.equal(blower.length,1);assert.equal(blower[0]!.modelStatus,'MODELLED');assert.deepEqual(blower[0]!.metrics,['blower_power']);assert.equal(data.readings.blower_power.scopeId,BLOWER_ID)
 assert.deepEqual(ENTITIES.find(e=>e.id===PUMP_ID)!.metrics,[]);assert.equal(Object.values(data.readings).some(r=>r.scopeId===PUMP_ID),false)
 assert.deepEqual(UNITS.find(u=>u.id===BLOWER_ID)!.metrics,['blower_power']);assert.notEqual(UNITS.find(u=>u.id===BLOWER_ID)!.assetRootNode,BLOWER_ID)
})
test('all four device phrases retain exactly the existing focus tool',()=>{
 for(const [name,id] of [['一号曝气池','SW_BIO_AERATION_001'],['一号二沉池','SW_CLR_TANK_001'],['一号鼓风机',BLOWER_ID],['一号提升泵',PUMP_ID]])assert.deepEqual(parseCommand('定位'+name),{tool_name:'scene.focus_device',arguments:{device_id:id}})
 assert.equal(parseCommand('启动提升泵'),null);assert.deepEqual(parseCommand('回到总览'),{tool_name:'scene.reset_view',arguments:{}})
})
test('mechanical bounds exclude room shell and roof; building is not a business entity',()=>{
 const unit=new Group(),device=new Group(),shell=new Mesh(new BoxGeometry(12,5,9),new MeshBasicMaterial());unit.add(shell);unit.position.set(-23,0,-23);device.userData.device_id=BLOWER_ID;device.add(new Mesh(new BoxGeometry(5,3,2.6),new MeshBasicMaterial()));unit.add(device)
 const registry=new DeviceRegistry();registry.register(unit,BLOWER_ID);assert.equal(registry.resolve(shell),null);assert.equal(registry.bounds(BLOWER_ID).getSize(new Vector3()).x,5);assert.equal(registry.bounds(BLOWER_ID).getCenter(new Vector3()).z,-23)
})
test('auto inspection restores roofs on cancel/reset/target switch without erasing manual overrides',()=>{
 const view=new RoofPresentation();view.select(BLOWER_ID);assert.equal(view.visible(BLOWER_ID),false);assert.equal(view.visible(PUMP_ID),true)
 view.select(PUMP_ID);assert.equal(view.visible(BLOWER_ID),true);assert.equal(view.visible(PUMP_ID),false)
 view.select(null);assert.equal(view.visible(PUMP_ID),true);view.set(BLOWER_ID,false);view.select(PUMP_ID);view.select(null);assert.equal(view.visible(BLOWER_ID),false);assert.equal(view.visible(PUMP_ID),true)
 view.set(BLOWER_ID,true);view.select(BLOWER_ID);assert.equal(view.visible(BLOWER_ID),false);view.select(null);assert.equal(view.visible(BLOWER_ID),true)
})
test('water and roof are disjoint capabilities for the four declared devices',()=>{
 assert.equal(UNITS.length,4);for(const unit of UNITS)assert.notEqual(unit.water,unit.roof)
})
