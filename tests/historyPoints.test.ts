import {test} from 'node:test'
import assert from 'node:assert/strict'
import {historyPoints} from '../src/charts/historyPoints.ts'
import {createSnapshot} from '../src/data/mockDataProvider.ts'
test('sparse API series breaks unreported intervals without fabricating zeroes, records or statistics',()=>{
 const source=createSnapshot().history.do.slice(0,5),sparse=[source[0]!,source[4]!],before=structuredClone(sparse),render=historyPoints(sparse,60000)
 assert.equal(render.length,3);assert.equal(render[1]![1],null);assert.equal(render[1]![2],-1);assert.deepEqual(sparse,before);assert.equal(render[2]![2],1)
 assert.equal(historyPoints(source,60000).length,source.length)
 const missing=structuredClone(source);missing[2]!.quality='MISSING';missing[2]!.value=null;assert.equal(historyPoints(missing,60000)[2]![1],null)
})
