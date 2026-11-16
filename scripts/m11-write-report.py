from pathlib import Path
import json,datetime,collections
root=Path(__file__).resolve().parents[1];out=root/'docs/acceptance/m1-stability-r1'
def read(p):return json.loads((out/p).read_text())
def fmt(x,n=2):return '未获取' if x is None else f'{x:.{n}f}'
identity=read('build-identity.json');perf=read('performance/summary.json');end=read('endurance/end.json')['end'];start=read('endurance/start.json')['start']
windows=[json.loads(p.read_text()) for p in sorted((out/'endurance').glob('window-*.json'))]
features=read('feature-tests.json')['results'];legacy=read('legacy/browser-tests.json')['results'];native=read('native-cancel.json');visibility=read('real-visibility.json');ui=read('final-ui-tests.json')['tests'];restart=read('restart-browser.json');integrity=read('final-integrity.json')
assert len(perf)==9 and end['done'] and not end['error']
seconds=(datetime.datetime.fromisoformat(end['at'].replace('Z','+00:00'))-datetime.datetime.fromisoformat(start['at'].replace('Z','+00:00'))).total_seconds()
valid_end=all(w['measurement']['page_visible_throughout'] and w['measurement']['sampled_duration_ms']>=60000 and not w['measurement'].get('workload_error') for w in windows)
lines=['# M1.1 已完成部分修复，仍有明确阻断项','',f'报告生成：{datetime.datetime.now(datetime.timezone.utc).isoformat()}。正式九份样本有效 {sum(bool(x["valid"]) for x in perf)}/9，达标 {sum(bool(x["passed"]) for x in perf)}/9。严重前台退化根因仍未确认，不能进入 M2。','',
'## 已实施与已验证','',
'- 修复相机截止时间竞态：每次更新和渲染成功回执前检查单调时钟截止时间、可见性和取消；主线程延迟不会越过截止时间先返回成功。旧实现的语义失败见 [red test](baseline/deadline-semantic-before.log)，首次 strip-types 导入失败单独保留，不冒充语义失败。',
'- 明确隐藏生命周期：隐藏停止自己的 Three 循环与模拟定时器，取消镜头并保留 PAGE_HIDDEN 原因；恢复只启动一套循环/定时器，不重放已取消动作，不补跑隐藏数据。',
'- 图表首次只提交一次，相同尺寸不重复 resize，隐藏时不提交数据；存活容器复用原实例。取消按钮保留固定位置，空闲时禁用；未延长镜头动作。',
'- 默认关闭的轻量诊断、有界诊断环形记录，以及独立记录原始 rAF / 逻辑提交 / 墙钟时长的采样器。没有新增 Agent 工具、业务功能或依赖。',
'- 25 项单元测试全部通过，保留原17项并新增8项；类型检查及生产构建成功。构建仍提示 >500kB 主包，未修改阈值隐藏警告。',
'- 既有浏览器功能回归：'+str(sum(x['status']=='PASS' for x in features))+'/10；既有场景/安全回归：'+str(sum(x['status']=='PASS' for x in legacy))+'/15；最终日志/字体/提示框检查：'+str(sum(x['status']=='PASS' for x in ui))+'/'+str(len(ui))+'。逐项断言和失败均在原始文件中，测试数量不代替性能结论。','',
'功能证据：[unit](unit-tests.log)、[build/typecheck](build.log)、[M1联动](feature-tests.json)、[原场景安全语义](legacy/browser-tests.json)、[最终UI](final-ui-tests.json)、[重启](restart-browser.json)。覆盖三个场景、快照一致性、缺测不补零、告警/设备/趋势联动、未建模定位禁用、真实点击、两条口令、并发/幂等/失败/超时/选择清理、水面、GLB重载、1366布局、实例复用与卸载。新增测试直接覆盖迟到超时、到位后取消、隐藏不再改变相机、循环重复恢复及采样计算。','',
'## 固定构建与条件','',f'- 交付 build_id：`{identity["build_id"]}`。冻结时间 `{identity["frozen_at_utc"]}`；实验站点独立编译，交付 dist 始终未被实验替换。',f'- GLB：`{identity["glb_sha256"]}`，{identity["files"]["models/aeration-tank.glb"]["bytes"]:,} bytes。Blend：`{identity["blend_sha256"]}`。模型、材质、制作脚本、参考图及旧验收证据均未修改；本轮未重新打开/验证 Blend，沿用其原验收，仅复核文件摘要。',
'- Apple M3，浏览器报告 Chromium/Google Chrome 156.0.8078.96、arm64、macOS。实际 WebGL 为 ANGLE Metal Renderer: Apple M3。原生DPR2；Three实际倍率1；CSS1920×1080；Three CSS视口1218×427，drawing buffer1218×427。DOM文字保留原生DPR。',
'- 记录中的drawingBuffer字段来自canvas像素尺寸；[收尾直接WebGL核验](final-browser-state.json)确认drawingBufferWidth/Height为1218×427、contextLost=false。每份样本未另存直接GL getter及context-lost事件，不能据此倒推所有历史时段的GPU上下文状态。',
'- 九份在同一文档串行运行，不重载页面或浏览器。A仅使用正常“暂停演示”功能暂停模拟发布，保留全部面板/双趋势；B开启数据与双趋势；C再增加定位、取消、复位、范围及工艺示意折叠。C的面板展开态/选中态允许改变局部DOM，实际3D尺寸固定，状态均保留。',
'- A/B先预热一次定位与复位，再进行两步轨道预热；C先预热定位与复位。全部预热位于对应rAF成绩窗口之外。无并行截图、录屏、Profiler、CDP Performance域或轻量诊断；Long Task观察单独记录。所有有效失败保留，不以总平均或多数通过代替单份标准。',
'- 可见性结论限于浏览器 document.visibilityState 与实际 Target 切换。原生窗口查询没有关联这些测试页，OS遮挡、宿主GPU竞争、电源频率及显示器真实呈现帧率未获取；没有据此把差样本作废。',
'关联证据：[构建内容摘要](build-identity.json)、[实际浏览器入口/GLB摘要及GPU](performance/browser-build-binding.json)、[保护文件与源码完整性](final-integrity.json)、[运行复现](reproduction.md)。','',
'## 原记录复核与复现','',
'- [原始记录索引](original-record-index.json)保留十次尝试的文件SHA、九份完整样本和一次不完整收集。构建ID及实际GLB摘要可核对；原每份性能记录未独立哈希实际JS响应，严格逐份JS关联不能倒推。历史页面年龄、原生窗口遮挡、后台渲染负载和同刻宿主压力未获取。',
'- 原脚本每个负载前 page.goto，第三轮不是同文档连续到第三轮；同一浏览器复用。旧FPS为原始rAF间隔数/间隔总时长，P95取排序后floor(N×.95)。',
'- [旧构建原顺序复放](baseline-replay/summary.json)九份均达标，仍使用原构建/原GLB；期间有源码编辑、Node单元与类型检查，属于排查，不能替代最终验收。之后旧/新构建交替都变慢：[31.75旧、25.18新、21.25旧、18.78新](old-new-pair/summary.json)。这不足以排除产品回归，也不足以认定单一外部原因。',
'- 初始短样本16.13FPS保留；清除测试target焦点仿真后59.56FPS，重新开启其他页仿真59.45FPS，不能稳定证明多标签是根因。未知来源同项目标签页保留，未关闭或杀其他应用。','',
'## 正式性能九份','',
'逻辑FPS=场景实际提交数/实际采样墙钟时长，rAF回调Hz独立记录；P95使用未截断原始间隔。每个render中的多draw/pass不当多个帧。>50/>100ms间隔与Long Task是独立统计（Long Task观察范围含该负载的预热/收尾），render CPU墙钟时长不当GPU时长。目标仍为平均≥45FPS、P95≤40ms。','',
'|样本|时长s|逻辑FPS|P95 ms|>50ms|>100ms|Long Task|结果|','|---|---:|---:|---:|---:|---:|---:|---|']
for x in perf:lines.append(f'|[{x["round"]}{x["mode"]}](performance/{x["file"]})|{fmt(x["sampled_duration_ms"]/1000)}|{fmt(x["average_fps"])}|{fmt(x["p95_frame_ms"],1)}|{x["frames_over_50_ms"]}|{x["frames_over_100_ms"]}|{x["longTasks"]}|未达标|')
lines+=['','[负载与回执复核](performance/workload-validation.json)：三轮C分别54/55/28次动作；成功40/41/22次均有到位和实际渲染帧回执，取消14/14/6次，无FAILED。完整执行记录分别60/121/155条，DOM自动列表20条；旧记录仍可查询。第三轮C3.14FPS/P95约2102ms为明确阻断，不能因为其他窗口较快而略去。','',
'第三轮C的成功定位中位耗时2420.5ms、复位1600ms；前两轮约1092–1261ms。取消负载中位终态延迟922ms，说明响应性也退化。详见[action-duration](action-duration-comparison.json)。选择时材质/程序反复创建释放的成本尚未逐动作隔离，不能据此认定根因。',
'## 持续运行','',f'固定交付构建在隔离合批实验撤回后独立新开文档；持续测试期间不重载，不重建renderer。开始 `{start["at"]}`，结束 `{end["at"]}`；实际 {seconds:.2f}s（{seconds/60:.2f}分钟），{len(windows)}个完整镜头窗口。窗口预热及边界的正常定位/复位另计，因此总时长大于采样时长之和。完整窗口条件检查：{valid_end}。','',
'|窗口|演示场景|时长s|逻辑FPS|P95 ms|>50ms|>100ms|可见|','|---|---|---:|---:|---:|---:|---:|---|']
for w in windows:
 m=w['measurement'];lines.append(f'|[{w["index"]:02}](endurance/window-{w["index"]:02}.json)|{w["before"]["scenario"]}|{fmt(m["sampled_duration_ms"]/1000)}|{fmt(m["average_fps"])}|{fmt(m["p95_frame_ms"],1)}|{m["frames_over_50_ms"]}|{m["frames_over_100_ms"]}|{m["page_visible_throughout"]}|')
lines+=['',f'Long Task观察可用：{end.get("longTaskAvailable")}；独立记录条数：{len(end.get("longTasks",[])) if end.get("longTaskAvailable") else "未获取"}。原始事件见 [end](endurance/end.json)，原始间隔/时间戳与资源趋势在每个窗口中。','',
'资源计数仅覆盖该应用明确拥有的实例/注册：一renderer、一个Three循环、一模拟interval、两图表、三ResizeObserver、七显式监听器。库内部监听/订阅、GPU时间与显存字节数为未获取。1441×2历史长度固定。选中角标使geometry/program/call各增一；取消/复位清理回基线。工艺折叠及20条可见日志改变DOM节点数，不要求所有内部缓存归零。详细趋势见窗口before/after和[最终汇总](resource-trends.json)。','',
'## 真实取消与真实隐藏','',
'正常与受控压力下原生取消均通过：[native-cancel.json](native-cancel.json)。先观察到RUNNING、控件可见且未遮挡，再用浏览器Input通道发出鼠标事件，isTrusted=true；记录Node发出时间、事件timeStamp/接收时间、camera_stopped及任务终态。取消后原生拖动改变相机，此后相机保持稳定；旧动作不成功，重复点击禁用按钮不产生重复终态，新复位成功。','',
'真实页面隐藏/恢复均通过：[real-visibility.json](real-visibility.json)。使用真实Target ID切换到空白标签，并清除每target测试焦点覆盖；不改visibilityState、不派发伪造事件。正常隐藏8024.9ms、压力隐藏8026.4ms，可信hidden/visible事件间场景帧数与snapshotId保持不变、数据timer为0；活动动作PAGE_HIDDEN取消，恢复后只一套循环/timer、不重放、不补跑，6秒后仅一次正常发布。','',
'压力定义为每80ms请求25ms忙等，独立于正常性能成绩，未将其宣称为测得的CPU利用率或等同于历史最差3.58FPS。原生取消与3.14FPS最差正式窗口未同步补测。首轮原生尝试未真正发出定位，未执行有效取消，保留为 [attempt-1](native-cancel-attempt-1.json)；没有强制点击或把内部cancel函数当端到端通过。','',
'## 根因、限定与未获取','',
'已确认的产品缺陷是截止时间竞态及原隐藏生命周期未暂停场景/释放数据timer；前述修复已验证。全局吞吐退化根因未确认。','',
'- [顺序单变量对照](diagnostics-r2/summary.json)：完整30.09FPS；暂停数据31.75；暂停图表提交34.21；关闭CSS特效33.38；均未恢复目标。暂停Three后TaskDuration大幅减少，保留原布局/图表；这只是定位渲染路径，不是删功能后的验收成绩。',
'- [诊断开销对照](diagnostic-overhead/summary.json)：全关34.79，轻量36.10，轻量+CDP metrics38.85，再关35.87，不能认定诊断开关是主要原因。',
'- [严重退化后轨迹](severe-after-nine.json)在额外诊断开销下约10.41秒记录TaskDuration9.40s、ThreadTime0.51s、布局0.148s；150次render CPU墙钟总5.47s、最大256.7ms。原生WebGL draw/bind、Three渲染提交及program/idle采样较突出。不同计量不可相减称为GPU耗时；等待、驱动、Electron/宿主调度或GPU争用仍仅为可能方向。原始CPU采样见 [profile](severe-after-nine-profile.json)。',
'- 自身renderer/循环/图表/历史未见随轮次累积；无GLB逐帧重载，neutral几何50/纹理15/程序4，选中多一份角标。不能据此排除所有驱动/宿主缓存问题。',
'- 第一次诊断固定23秒收尾导致未完成工作重叠，原始result.done=false和跨条件异步回执均保留，见[调查](investigation.md)。只有具体收集缺陷的条件不用于因果对照；FULL已完成33.35FPS差样本仍保留。R2采用独立对象与真实完成状态。',
'- 同页持续运行后段第13–15窗口恢复约60FPS，未重载或重建renderer。[正常函数级轨迹](normal-after-endurance.json)的profile阶段逻辑FPS59.13，全镜头短样本约60FPS/P95 18.6ms；652次render CPU墙钟总563ms、最大2ms，均值约0.86ms。正常轨迹采样50Hz、退化轨迹200Hz，额外采样开销不同，差值不是GPU时间或严格单因果证明；同页恢复不能抵消前面的有效失败。GPU计时、准确VRAM、OS遮挡/竞争与电源频率未获取。pmset只报告未记录警告/CPU状态，不能当作已测无降频；只记录了系统内存free约42%。','',
'## 保留但撤回的合批实验','',
'独立4181实验站点保持同几何/材质/水面/视角/DPR，50draw→20draw，106042三角面不变。首次OFF/ON/OFF/ON为13.05/19.85/22.40/28.44FPS，反向ON/OFF/ON/OFF为25.42/26.87/26.15/12.90FPS，宿主变化无法分离，未证明稳定收益。相同2436×854模型区截图只有5像素任一通道差>2、最大差4；不是用户视觉验收。','',
'独立原型首次类型检查曾因属性类型unknown失败，修正后通过；原日志保留在batch-experiment/typecheck-attempt-1.log。名为baseline-normal-profile的采集实测10.41FPS，文件名不代表正常成功。实验[实现patch](batch-experiment/implementation.patch)、[完整结果](batch-experiment/)、[同相机截图/元数据](batch-experiment/shots.json)、[像素比较](batch-experiment/pixel-comparison.json)、[撤回校验](batch-experiment/restored.json)全部保留。交付代码逐字节恢复65ab…，生产仍是50draw基线；没有把实验20draw或短测提升写成交付优化。','',
'## 实际文件与交付','',
'具体文件：src/scene/cameraController.ts（截止时间/取消）；src/scene/runtime.ts与loopLifecycle.ts（场景生命周期/尺寸）；frameSample.ts（采样）；src/agent/actionDispatcher.ts（隐藏取消分类）；useMockData.ts（定时器）；TrendPanel.vue（复用/去重）；AgentWorkspace.vue与useSceneWorkspace.ts（稳定取消与输入时间）；diagnostics/stability.ts、qa/exposeDashboardQA.ts与App.vue（默认关闭诊断及销毁）；tests/cameraDeadline.test.ts与stability.test.ts（针对性回归）。',
'源码与测试14项差异见 [清单](changed-files.json) 和 [完整patch](source-changes.patch)：相机/loop/采样，dispatcher隐藏取消分类，统一数据timer，TrendPanel去重，固定取消控件，工作台输入诊断，QA生命周期与默认关闭诊断；App仅补QA销毁。模型、数据Provider、包管理锁与依赖均未改变。测试脚本、原始输出、实验源码、截图和报告均仅在本项目新增。','',
'实际启动：`pnpm preview`；访问 `http://127.0.0.1:4173/`。重启后已验证正常生产入口不暴露QA API、双图、告警定位、复位、缺测展示；完整命令及复现限制见 [reproduction](reproduction.md)。截图来自固定生产构建的实际网页：[总览](screenshots/dashboard-1920-css.png)、[缺测](screenshots/missing-data-1920-css.png)、[紧凑布局](screenshots/compact-1366-css.png)，[关联与时间/viewport/DPR/相机](screenshots-manifest.json)。截图原生DPR2，因此PNG像素为CSS视口的两倍；Three渲染倍率仍1。','',
'## 最终边界','',
'- 已实现：有证据的截止时间、隐藏生命周期、尺寸与重复提交修复；轻量诊断及正确采样。',
'- 已验证：上述功能/真实输入/真实隐藏、九次同页完整性能样本、至少15分钟前台文档持续采样、固定构建与未变GLB关联、重启及原有资产保护。',
'- 未解决：九份性能均未达到45FPS/P95≤40ms，最坏3.14FPS仍是明确阻断。渲染提交附近的长等待尚不能归结为已确认的产品/驱动/宿主单一根因。',
'- 未验证：OS实际遮挡/宿主竞争、GPU耗时/VRAM、极端3.14FPS同步原生取消、DPR2三维、多浏览器/移动端、用户最终视觉/体验验收。不会把逻辑DPR1结果外推全设备。',
'- 本轮已停止，不进入M2。','',
'协议说明参考 [CDP Focus Emulation](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setFocusEmulationEnabled)、[真实Target激活](https://chromedevtools.github.io/devtools-protocol/tot/Target/#method-activateTarget)。这些调试设置限测试target，没有修改系统或全局浏览器配置。']
(out/'report.md').write_text('\n'.join(lines)+'\n')
(out/'summary.json').write_text(json.dumps({'status':'M1.1 已完成部分修复，仍有明确阻断项','build_id':identity['build_id'],'unit_tests':25,'performance_samples':len(perf),'performance_valid':sum(bool(x['valid']) for x in perf),'performance_passed':sum(bool(x['passed']) for x in perf),'endurance_seconds':seconds,'endurance_windows':len(windows),'endurance_windows_valid':valid_end,'native_cancel_passed':all(x['passed'] for x in native),'real_visibility_passed':all(x['passed'] for x in visibility),'root_cause':'NOT_CONFIRMED','no_m2':True},indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'report':str(out/'report.md'),'endurance_minutes':seconds/60,'samples':len(perf),'passed':sum(x['passed'] for x in perf)}))
