import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PerspectiveCamera,Vector3 } from 'three'
import { CameraController } from '../src/scene/cameraController.ts'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'

test('a late animation callback cannot succeed ahead of its delayed deadline timer',async()=>{
 const camera=new PerspectiveCamera(),controls={target:new Vector3()} as OrbitControls
 const motion=new CameraController(camera,controls,()=>null)
 const started=performance.now(),result=motion.move(new Vector3(1,2,3),new Vector3(),null,undefined,50)
 motion.update(started+1000);motion.afterRender(1)
 await assert.rejects(result,(error:{code?:string})=>error.code==='TIMEOUT')
 assert.equal(motion.busy,false)
})

test('a hidden page cancels before another camera mutation or success',async()=>{
 const camera=new PerspectiveCamera(),controls={target:new Vector3()} as OrbitControls
 let visible=true
 const motion=new CameraController(camera,controls,()=>null,()=>visible)
 const result=motion.move(new Vector3(4,5,6),new Vector3(),null)
 const before=camera.position.clone();visible=false
 motion.update(performance.now()+1000);motion.afterRender(1)
 await assert.rejects(result,(error:{code?:string})=>error.code==='PAGE_HIDDEN')
 assert.deepEqual(camera.position,before);assert.equal(motion.busy,false)
 visible=true;motion.update(performance.now()+1500);motion.afterRender(2)
 assert.deepEqual(camera.position,before)
})

test('abort after arrival but before render cannot produce a success receipt',async()=>{
 const camera=new PerspectiveCamera(),controls={target:new Vector3()} as OrbitControls
 const motion=new CameraController(camera,controls,()=>null),abort=new AbortController()
 const result=motion.move(new Vector3(1,2,3),new Vector3(),null,abort.signal)
 motion.update(performance.now()+901);abort.abort('用户取消');motion.afterRender(1)
 await assert.rejects(result,(error:{code?:string})=>error.code==='CANCELLED')
 const before=camera.position.clone();motion.update(performance.now()+2000)
 assert.deepEqual(camera.position,before)
})

test('deadline is checked again between camera arrival and render acknowledgement',async(t)=>{
 let now=0;t.mock.method(performance,'now',()=>now)
 const camera=new PerspectiveCamera(),controls={target:new Vector3()} as OrbitControls
 const motion=new CameraController(camera,controls,()=>null)
 const result=motion.move(new Vector3(1,2,3),new Vector3(),null)
 now=901;motion.update(now)
 now=6000;motion.afterRender(1)
 await assert.rejects(result,(error:{code?:string})=>error.code==='TIMEOUT')
})
