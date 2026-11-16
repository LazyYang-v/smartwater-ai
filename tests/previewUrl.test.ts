import {test} from 'node:test'
import assert from 'node:assert/strict'
import {unitPreviewUrl} from '../src/scene/units.ts'
test('independent preview URLs map all four registered devices and never default an unknown selection to clarifier',()=>{
 assert.equal(unitPreviewUrl('SW_BIO_AERATION_001'),'/viewer.html?model=aeration')
 assert.equal(unitPreviewUrl('SW_CLR_TANK_001'),'/viewer.html?model=clarifier')
 assert.equal(unitPreviewUrl('SW_AIR_BLOWER_001'),'/viewer.html?model=blower')
 assert.equal(unitPreviewUrl('SW_PRE_PUMP_001'),'/viewer.html?model=pump')
 assert.equal(unitPreviewUrl(null),null);assert.equal(unitPreviewUrl('not_a_device'),null)
})
