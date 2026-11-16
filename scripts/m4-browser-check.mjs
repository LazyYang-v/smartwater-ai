// Local browser integration tests. Faults/fixtures are restricted to an isolated IndexedDB library.
const task=await taskSpace(62),page=task.page('p1'),out='/Users/leizhenyang/projects/smartwater-ai/docs/acceptance/m4-reports';
const {writeFile}=await import('node:fs/promises');const checks=[];
async function submit(){await page.cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});await page.cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})}
function check(name,value,detail){checks.push({name,passed:!!value,detail});if(!value)throw Error(name+': '+JSON.stringify(detail))}
await page.goto('http://127.0.0.1:4173/?qa=1&historyDb=smartwater-m4-test-chain');
await page.cdp('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:2,mobile:false});
await page.waitForFunction(()=>__SW_M4__?.ready.value&&__SW_M0__.snapshot().status==='ready',undefined,{timeout:60000});
await page.evaluate(()=>{window.__m4Fetches=0;const fetch=window.fetch;window.fetch=(...args)=>{if(String(args[0]).includes('/api/agent/step'))window.__m4Fetches++;return fetch(...args)}});
await page.selectOption('#scenario','LOW_DO');
await page.fill('#command','巡检当前四个单元，列出异常和缺少的数据。');await submit();
await page.waitForFunction(()=>__SW_M3__.current()?.status==='SUCCEEDED'&&__SW_M4__.saveStates.value[__SW_M3__.current().task_id]?.status==='SAVED');
const patrol=await page.evaluate(()=>({task:__SW_M3__.current(),id:__SW_M3__.current().task_id}));
await page.click('text="历史任务"');await page.click('[data-task-id="'+patrol.id+'"]');await page.waitForFunction(()=>__SW_M4__.report.value!==null);
const frozen=await page.evaluate(()=>__SW_M4__.testing.content());check('Demo patrol is complete with immutable report',JSON.parse(frozen.json).kind==='FOUR_UNIT_INSPECTION',JSON.parse(frozen.json).coverage);
await page.click('.close-report');await page.selectOption('#scenario','MISSING_DATA');await page.click('[data-task-id="'+patrol.id+'"]');await page.waitForFunction(()=>__SW_M4__.selected.value?.task.task_id===__SW_M4__.list.value.find(v=>v.input.includes('巡检'))?.task_id);
check('scenario switch leaves old report bytes unchanged',await page.evaluate(old=>__SW_M4__.testing.content().json===old,frozen.json));await page.click('.close-report');
await page.evaluate(()=>__SW_M4__.testing.fault('QuotaExceededError'));await page.click('text="当前任务"');await page.fill('#command','检查提升泵运行是否正常。');await submit();
await page.waitForFunction(()=>__SW_M3__.current()?.input==='检查提升泵运行是否正常。'&&__SW_M4__.saveStates.value[__SW_M3__.current().task_id]?.status==='ERROR');
const failedSave=await page.evaluate(()=>({task:__SW_M3__.current(),save:__SW_M4__.saveStates.value[__SW_M3__.current().task_id]}));check('quota injection preserves successful execution and explicit save failure',failedSave.task.status==='SUCCEEDED'&&failedSave.save.status==='ERROR',failedSave.save);
await page.click('text="查看记录 / 导出"');await page.waitForFunction(()=>!!__SW_M4__.report.value);check('save failure retains exportable in-memory report',await page.evaluate(()=>__SW_M4__.testing.content().markdown.includes('无法判断')));
await page.evaluate(()=>__SW_M4__.testing.fault(null));await page.click('.retry-save');await page.waitForFunction(()=>__SW_M4__.saveStates.value[__SW_M4__.selected.value.task.task_id]?.status==='SAVED');await page.click('.close-report');
await page.fill('#command','启动提升泵');await submit();await page.waitForFunction(()=>__SW_M3__.current()?.status==='FAILED'&&__SW_M4__.saveStates.value[__SW_M3__.current().task_id]?.status==='SAVED');
const failed=await page.evaluate(()=>__SW_M3__.current().task_id);check('failed task retained',!!failed);
await page.cdp('Page.bringToFront');await page.waitForFunction(()=>document.visibilityState==='visible');await page.fill('#command','定位一号曝气池');await submit();await page.waitForFunction(()=>__SW_M3__.current()?.status==='RUNNING'&&__SW_M0__.records().at(-1)?.status==='RUNNING');
const hit=await page.evaluate(()=>{const b=document.querySelector('.cancel-task'),r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,enabled:!b.disabled,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b,id:__SW_M3__.current().task_id}});check('visible cancel is hit-testable during RUNNING',hit.enabled&&hit.hit,hit);
await page.cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:hit.x,y:hit.y,button:'left',clickCount:1});await page.cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:hit.x,y:hit.y,button:'left',clickCount:1});await page.waitForFunction(()=>__SW_M3__.current()?.status==='CANCELLED'&&__SW_M4__.saveStates.value[__SW_M3__.current().task_id]?.status==='SAVED');
check('native cancel persists CANCELLED without old success',await page.evaluate(id=>__SW_M3__.tasks().find(t=>t.task_id===id).status==='CANCELLED',hit.id));
await page.fill('#command','回到总览');await submit();await page.waitForFunction(()=>__SW_M3__.current()?.status==='SUCCEEDED');
await page.click('text="历史任务"');await page.click('[data-task-id="'+failedSave.task.task_id+'"]');await page.waitForFunction(()=>!!__SW_M4__.report.value);
await page.evaluate(()=>__SW_M1__.advance());await page.click('.rerun-task');await page.waitForFunction(()=>__SW_M3__.current()?.parent_task_id!==undefined&&__SW_M3__.current()?.status==='SUCCEEDED');
const rerun=await page.evaluate(()=>__SW_M3__.current());check('explicit rerun has new id, parent and new snapshot',rerun.task_id!==failedSave.task.task_id&&rerun.parent_task_id===failedSave.task.task_id&&rerun.snapshot_id!==failedSave.task.snapshot_id,{id:rerun.task_id,parent:rerun.parent_task_id,snapshot:rerun.snapshot_id});
await page.evaluate(()=>__SW_M4__.flush());await page.reload();await page.waitForFunction(()=>__SW_M4__?.ready.value);
await page.click('text="历史任务"');await page.waitForFunction(()=>__SW_M4__.list.value.length>=5);
const statuses=await page.evaluate(()=>__SW_M4__.list.value.map(v=>({id:v.task_id,status:v.execution_status})));check('completed failed cancelled records survive reload',statuses.some(v=>v.status==='FAILED')&&statuses.some(v=>v.status==='CANCELLED')&&statuses.some(v=>v.status==='SUCCEEDED'),statuses);
await page.click('[data-task-id="'+patrol.id+'"]');await page.waitForFunction(()=>__SW_M4__.report.value?.task_id===__SW_M4__.selected.value?.task.task_id);
check('refresh preserves exact frozen report',await page.evaluate(old=>__SW_M4__.testing.content().json===old,frozen.json));
check('history open does not replay tools or tasks',await page.evaluate(()=>__SW_M3__.tasks().length===0&&__SW_M0__.records().length===0));
await writeFile(out+'/browser-checks.json',JSON.stringify({at:new Date().toISOString(),test_database:'smartwater-m4-test-chain',checks},null,2));console.log({checks,source:'Actual Chromium UI + explicitly labelled isolated fault injection'});console.log(await page.snapshot());
