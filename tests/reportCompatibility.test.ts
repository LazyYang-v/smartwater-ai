import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {reportJSON,reportMarkdown,type TaskReport} from '../src/history/report.ts'
test('the original real M4 report exports remain byte-for-byte compatible',()=>{
 const name='SWR_20261116122414720_8cabc68a-b175-490f-83d3-c07f4dd5cc7c',root=new URL('../docs/acceptance/m4-reports/',import.meta.url),json=readFileSync(new URL(name+'.json',root),'utf8'),markdown=readFileSync(new URL(name+'.md',root),'utf8'),report=JSON.parse(json) as TaskReport
 assert.equal(reportJSON(report),json);assert.equal(reportMarkdown(report),markdown)
})
