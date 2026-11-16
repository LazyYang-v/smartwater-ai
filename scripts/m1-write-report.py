from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[1];out=root/'docs/acceptance/m1';candidate=out/'candidate-1'
load=lambda path:json.loads(path.read_text())
identity=load(out/'build-identity.json');old=load(candidate/'build-identity.json');trials=load(out/'performance/summary.json');shots=load(out/'screenshots-manifest.json')
assert len(trials)==10 and len(shots)==11
mode={'CAMERA_ONLY':'镜头移动 / 数据暂停','CAMERA_DATA_CHARTS':'镜头 + 数据刷新 + 双图表','COMMANDS_PANELS':'连续定位/复位 + 面板切换'}
def fmt(t,key,digits=1):
 value=t.get(key)
 return f'{value:.{digits}f}' if value is not None else '未测量'
rows='\n'.join(f"| {t['round']} | {mode[t['mode']]}{' / 补采' if 'retry' in t['file'] else ' / 采集中断' if not t['valid'] else ''} | {fmt(t,'sampled_duration_ms',0) if t.get('sampled_duration_ms') is None else format(t['sampled_duration_ms']/1000,'.3f')} | {fmt(t,'average_fps',2)} | {fmt(t,'p95_frame_ms')} | {fmt(t,'p99_frame_ms')} | {t.get('frames_over_50_ms','未测量')} | {'未完成采集' if not t['valid'] else '达到' if t['passed'] else '未达到'} |" for t in trials)

text=(candidate/'report.md').read_text().replace(old['build_id'],identity['build_id']).replace('smartwater-m1.1','smartwater-m1.2').replace('16 项单元测试','17 项单元测试')
text=text.replace('新增来源元数据、三场景','新增来源元数据、过期读数与有效历史的时间一致性、三场景')
text=text.replace('本轮一次固定生产构建，','本轮使用修正后的固定最终生产构建，')
for f in ['feature-tests-development.json','visibility-development.json']:
 text=text.replace(']('+f+')','](candidate-1/'+f+')')
start=text.index('| 轮次 | 模式 |');end=text.index('\n\n完整原始数据',start)
text=text[:start]+'| 轮次 | 模式 | 有效采样 s | 平均 FPS | P95 ms | P99 ms | >50ms 帧数 | 本次目标 |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n'+rows+text[end:]
passed=sum(t['passed'] for t in trials)
text=text.replace('9/9 次达到本轮约定样本目标',f'{passed}/9 次达到本轮约定样本目标')
command_trials=[t for t in trials if t['mode']=='COMMANDS_PANELS'];longs=[t['frames_over_50_ms'] for t in command_trials]
text=text.replace('20–25 帧 >50ms',f'{min(longs)}–{max(longs)} 帧 >50ms')
reports=[load(out/'performance'/t['file']) for t in trials]
command_reports=[r for r in reports if r['mode']=='COMMANDS_PANELS']
span=lambda xs:str(min(xs)) if min(xs)==max(xs) else f'{min(xs)}–{max(xs)}'
actions=[len(r['result']['result']['actions']) for r in command_reports];logs=[len(r['final']['records']) for r in command_reports]
text=text.replace('65 次真实定位/复位',span(actions)+' 次真实定位/复位').replace('67 条完整工具记录',span(logs)+' 条完整工具记录').replace('67 条历史默认只渲染 20 条',span(logs)+' 条历史默认只渲染 20 条')
ticks=[r['final']['data']['tick'] for r in reports if r['mode']!='CAMERA_ONLY']
text=text.replace('结束 tick 为 12–13','结束 tick 为 '+span(ticks))
js=next(d['bytes'] for p,d in identity['files'].items() if p.endswith('.js'))
buildlog=(out/'build.log').read_text();match=re.search(r'index-[^\s]+\.js\s+[^\n]*gzip:\s*([\d.]+)\s*kB',buildlog)
text=text.replace('1,337.13 KB / gzip 398.35 KB',f'{js:,} 字节 / gzip {match.group(1) if match else "见日志"} KB')
insert='''

### 最终核对中修复的数据时间问题

前一候选中，功率历史包含 15:47 的 GOOD 样本，而当前 STALE 缓存却退回 15:35。该不一致由只对最后 12 分钟标 STALE、却使用更早缓存时间造成。[修复前真实失败断言](candidate-1/chronology-before-fix.log) 已保留。

最终数据版本提升为 `smartwater-m1.2`：保留 15:47 的有效观测与其相同原始值，之后的功率历史槽全部标 STALE。新断言覆盖 tick 0、7、13，确保没有比 current.observedAt 更新的 GOOD 功率样本，并验证缓存原始值等于对应时刻的 NORMAL 值。[生产浏览器验证](correction-validation.json) 进一步确认最后有效时间、过期时间与原始值一致。

前一候选的构建、11 张截图及九次长测保留在 [candidate-1](candidate-1/NOT-FINAL.md)；[旧候选性能](candidate-1/performance/summary.json) 仅作为历史记录。以下最终构建、截图、回归和九次长测全部重新生成，没有挪用旧结果或只选较好的样本。
'''
text=text.replace('\n## 联动和工具语义',insert+'\n## 联动和工具语义')
text=text.replace('三轮共九次长测和旧资产保护','三轮九个完整测量项、一次额外采集中断记录和旧资产保护')
text=text.replace('固定最终生产构建，构建之后', '固定最终生产构建，构建之后')
text=text.replace('9/9 次达到本轮约定样本目标',f'{passed}/9 个完整测量项达到本轮约定样本目标')
text=text.replace('以下最终构建、截图、回归和九次长测全部重新生成','以下最终构建、截图、回归和九个完整测量项全部重新生成')
text=text.replace('截图/浏览器/重启检查、11 张截图资源关联、三轮共九次长测和旧资产保护','截图/浏览器/重启检查、11 张截图资源关联、三轮九个完整测量项和旧资产保护')
text=text.replace('**M1 实施已交付，等待用户体验验收。**','**M1 功能已交付，性能目标未完全达到，等待用户体验验收。**')
text=text.replace('**M1 实施已交付，等待用户体验验收。到此停止，不进入 M2。**','**M1 功能已交付，性能目标未完全达到，等待用户体验验收。到此停止，不进入 M2。**')
text=text.replace('偶发长帧仍在','长帧及第三轮明显低帧率仍在')
text=text.replace(span(logs)+' 条历史默认只渲染 20 条','22 条真实历史默认只渲染 20 条').replace('显式分页最多 40 条且不超出现有总数、不删记录','分页加载全部 22 条且不删记录').replace('前两个模式先预热两次移动，随后连续镜头移动约 62 秒','前两个模式先预热两次移动，随后按同一轨迹连续移动，实际有效时长见表（包含退化下的延长）').replace('## 三轮性能：每轮三个模式，每次超过 60 秒','## 三轮性能：九份完整样本均超过 60 秒，另保留采集中断')
text=text.replace('取消按钮清理标签/角标','取消按钮 DOM 事件路径清理标签/角标').replace('实际隐藏标签页的验证限制：','原生取消点击的验证限制：在退化条件下，原生指针未能在 900ms 相机动作结束前命中取消按钮；该尝试不算通过，见 [原生指针尝试](final-ui-native-pointer-attempt.json)。取消控件的 DOM click 事件路径已实际调用 Dispatcher、返回 CANCELLED 并清理效果；这不能替代退化条件下的原生点击体验验收。日志滚动测试中的准备/自动滚动问题见 [测试准备记录](final-ui-setup-failure.log)，测试未注入或制造工具成功记录。\n\n实际隐藏标签页的验证限制：')
text=text.replace('结束 tick 为 '+span(ticks),'采后读取时 tick 为 '+span(ticks)+'（补采的读取还包含额外被动等待，不能由此推算采样窗口刷新次数）')
text=text.replace('连续命令模式更频繁','连续命令模式也包含长帧').replace('同目录九个 JSON','同目录十个采集 JSON（九份完整、一份中断）').replace('显式分页到 40 且不删记录','显式分页最多 40 条且不超出现有总数、不删记录')
text=text.replace('未做 CPU/GPU trace 隔离，不能把其确定归因于图表、模型或日志。','已追加诊断采样，见下文；GPU 等待、驱动和系统调度尚未隔离，根因未确认。')
extra="""

### 性能未通过项与诊断边界

第三轮出现明显低帧率，不能宣布 M1 整体性能验收通过。第 3 轮数据/图表模式的第一次采集在 75 秒等待结束时仍未完成，没有返回帧数组；该记录保留为无效采集，不填 FPS 或零值。[原始九次尝试](performance/initial-attempts-summary.json) 保留。随后仅对此未完成项延长被动等待至 175 秒，采用同一相机轨迹、完整页面和像素条件补采；没有替换其他已测得的低分样本。

追加的 [诊断记录](performance-diagnostic.json)、[CPU profile](diagnostic-cpu-profile.json) 和 [诊断说明](performance-diagnosis.md) 不计入成绩。诊断暂停数据，仍复现平均约 17.88 FPS / P95 181.2ms，397 个 long task；期间没有记录到焦点/可见性变化。一个场景、一套三维循环、50 draw calls、两个图表和模型加载代次保持稳定，DOM 节点数和 JS heap 在该窗口未增长。

75.69 秒诊断窗口里，CDP TaskDuration 约 64.16 秒、ScriptDuration 约 42.57 秒、ThreadTime 约 3.24 秒，LayoutDuration 约 1.10 秒；这些值的统计口径不同，不能将差值当作 GPU 时间。采样栈包含 Three.js renderBufferDirect 以及 bindVertexArray、drawElements 等原生 WebGL 提交调用。证据说明“停止模拟数据/图表刷新”不足以消除退化，排查范围收窄到渲染提交或浏览器/系统等待路径；GPU、驱动、系统调度及外部竞争仍未隔离。没有证据将其确定为某个新 UI 组件，也没有用降低视口或像素来掩盖。

剩余问题是同条件长时间运行下的帧时稳定性。建议后续在受控前台条件下采集 GPU/系统调度 trace，再决定有证据的渲染优化；本轮不擅自更改系统电源配置、关闭用户其他页面或重做模型。
"""
text=text.replace('\n## 修改清单、问题与验收边界',extra+'\n## 修改清单、问题与验收边界')
assert old['build_id'] not in text and 'smartwater-m1.1' not in text
(out/'report.md').write_text(text)
print('Final report generated',identity['build_id'],'trials',len(trials),'screenshots',len(shots))
