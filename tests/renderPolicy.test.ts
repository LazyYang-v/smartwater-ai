import {test} from 'node:test'
import assert from 'node:assert/strict'
import {shouldKeepRendering} from '../src/scene/renderPolicy.ts'
test('interaction priority stops at idle but keeps camera and manual controls rendering',()=>{
 assert.equal(shouldKeepRendering('interactive',false,false),false)
 assert.equal(shouldKeepRendering('interactive',true,false),true)
 assert.equal(shouldKeepRendering('interactive',false,true),true)
 assert.equal(shouldKeepRendering('full',false,false),true)
})
