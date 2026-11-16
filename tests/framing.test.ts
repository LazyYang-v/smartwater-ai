import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Box3,PerspectiveCamera,Vector3 } from 'three'
import { fitBox,projectedBounds } from '../src/scene/framing.ts'

for (const [width,height] of [[1440,659],[989,434]]) {
  test(`perspective site fits and centers in ${width}x${height} actual viewport`,()=>{
    const camera=new PerspectiveCamera(40,width!/height!,.15,400)
    const box=new Box3(new Vector3(-32,-.24,-20),new Vector3(32,1,20))
    const pose=fitBox(box,camera,new Vector3(.52,.96,1),.87)
    camera.position.copy(pose.position);camera.lookAt(pose.target)
    const frame=projectedBounds(box,camera)
    assert.ok(Math.max(Math.abs(frame.top),Math.abs(frame.bottom),Math.abs(frame.left),Math.abs(frame.right))<=.89)
    assert.ok(Math.abs(frame.top+frame.bottom)<.015,'Vertical framing is not centered')
    assert.ok(Math.max(frame.top-frame.bottom,frame.right-frame.left)>1.68,'Object is unnecessarily small')
  })
}
