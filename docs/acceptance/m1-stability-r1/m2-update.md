# SmartWater 交互优先 + M2 单元增量

更新时间：2026-11-15T22:18:59.332171+00:00。本轮停止于单元切换，不装配全厂。

- **页面可用性改善，快检通过**：默认交互优先。静止按需绘制；拖动、相机工具和阻尼收敛期间连续绘制；加载、尺寸、选择、水面和恢复可见时重绘。保留模型、材质、光照、双趋势、统一数据与两种工具。水纹持续动画暂停；原完整效果可选并明确标记“未验证稳定”。不降低DPR或模型质量。
- **性能未正式验收通过**：本轮短测与12分钟交互混合确认未重现严重退化，但不是原持续完整动画矩阵。旧严重失败与根因未确认状态保留，不用待机零绘制计算高FPS。未改45FPS/P95≤40ms目标。
- **二沉池完成**：独立GLB、可编辑Blend、独立网页检查及回导通过；待用户视觉验收。
- **二沉池已集成单元切换**：先通过独立预览与页面可用性快检，再开放“曝气池 / 二沉池”，同一时间一个GLB，原renderer、注册表、Dispatcher和相机执行器继续复用。新增二沉池口令是现有focus工具的新device_id，不新增工具。未加载单元明确失败。二沉池无过程模拟指标，页面明确KPI/趋势仍为曝气池和关联鼓风机。

## 性能判断及实际措施

复用旧诊断 `diagnostics-r2/THREE_PAUSED.json` 与旧正常/严重轨迹：主要耗时在线程提交三维渲染路径；暂停三维后页面/图表负载明显减少。底层GPU/驱动/宿主原因仍不能确认，没有证据判定ECharts缺陷或必然的集成冲突。

本轮同条件短对照（Chrome156、1920×1080、原生DPR2，三维DPR1，CSS和buffer均1218×427、同曝气池GLB/光照）：完整效果大屏59.63FPS/P9518.4ms，独立查看器59.73FPS/P9518.5ms。未复现慢态，不能作为根因排除证明。保持布局暂停三维的UI对照仍发布模拟快照，新增绘制为0。原始结果在 `m2-quickchecks.json` / `m2-quickchecks-initial.json`；初次查看器比较尺寸不一致，保留且不用于归因。

只实施一轮性能措施：按需绘制与已有无过渡图表配合，没有叠加推测性质量优化。相同静止3秒，完整效果180次提交，交互优先0次提交；工具成功仍需相机实际到位、选择更新、实际绘制后回执。不是把0绘制写成高FPS。取消和隐藏的已修复语义保留；新增交互持有标志在隐藏时清理，补验实际标签切换。

## 候选连续确认（非正式性能通过）

固定候选 `b777e574c5450d96e166e3c6f66309f7ce459336aa7e1a0f4f4ae5099b0f230e`；无重载，前台 12.00 分钟。每分钟包含约18秒活动镜头采样、取消/复位、三场景/时间范围/面板操作，再静止等待；完整双趋势与模拟刷新开启。静止部分不计入活动FPS。每轮2次镜头预热后采样。浏览器性能测试期间未执行Blender、录屏或性能轨迹采集。

| 窗口 | 活动提交FPS | 原始间隔P95 ms | >50 / >100ms |
|---|---:|---:|---:|
| 1 | 60.00 | 18.3 | 0 / 0 |
| 2 | 59.87 | 18.4 | 0 / 0 |
| 3 | 59.71 | 18.3 | 1 / 0 |
| 4 | 59.57 | 18.3 | 1 / 0 |
| 5 | 59.30 | 18.3 | 1 / 0 |
| 6 | 59.48 | 18.3 | 1 / 0 |
| 7 | 59.78 | 18.3 | 1 / 0 |
| 8 | 59.19 | 18.3 | 3 / 1 |
| 9 | 59.75 | 18.4 | 0 / 0 |
| 10 | 59.78 | 18.3 | 0 / 0 |
| 11 | 59.73 | 18.4 | 0 / 0 |
| 12 | 59.74 | 18.3 | 0 / 0 |

12次取消均CANCELLED、12次复位均SUCCEEDED；全部前台，静止新增绘制均0。保留8次>50ms、1次>100ms间隔；不等同浏览器Long Task。原始间隔、实际buffer和资源趋势见 `m2-continuous.json`。原底层严重退化未获得确定性根因；原完整动画模式未重新正式验收。

## 最终集成快检与证据关联

最终构建 `123a396904b6a753998cf5cfe8ac60fede7ab648e35d948d3a56650b92b11e94`（`m2-final.json`）。12分钟候选在添加单元选择器之前冻结；最终新增普通切换、上下文文字和隐藏拖动标志清理，因此不倒称12分钟测试了最终集成构建。最终集成只做受影响快检。

- 29项单测、类型检查、生产构建通过；构建有原有>500kB chunk提醒。日志 `.cache/m2-unit-final.log` / `.cache/m2-build-final.log`。
- 16项浏览器快检通过：双单元唯一根节点、原有一renderer/两图表；新旧定位与复位的render回执；未加载设备明确失败；隐藏水面实际重绘；加载失败保留其他面板及当前单元重试；反复切换无第二renderer；三场景；可见控件原生取消RUNNING；拖动时真实隐藏/恢复后按需循环收敛。
- 最终活动短测 18.36s：59.86FPS，P95 18.4ms，>50ms 0，>100ms 0。仅快检；不是又一份完整长测或DPR2三维结果。
- 实际加载的3份JS/CSS字节摘要与最终manifest一致，GLB响应摘要与交付一致。记录见 `m2-integration.json`，含截图时间、视口、DPR、相机、选择状态。CLI后续调用会恢复默认窗口尺寸，资源复核后重新设置1920并等待ResizeObserver，实际buffer1218×427；该复核未混入性能样本。
- 截图：`m2-integrated-clarifier.png`（1920，定位及工具记录）、`m2-interaction-priority.png`（1920曝气池）、`m2-compact.png`（1366）；独立资产 `m2-clarifier-preview.png` / `m2-clarifier-hidden.png`。均实际网页，不是Blender渲染。
- 最初浏览器版本探测接口不支持、最初材质库读取失败，失败日志保留；修正测试调用和库复制后成功，不改失败记录。

## 二沉池产物

- 源文件：`assets/source/clarifier-tank.blend`，SHA256 `bc0338c05d3471ef07137d3c56e7482900fce02aa56ef19ef2a609ad6acbc061`。
- 导出：`public/models/clarifier-tank.glb`，29,034,200字节，63,274三角面，68个mesh节点，SHA256 `4a8249541d1ae8bd95b18ef5af5be6f83b26f76b25ed568f3e4e10ca02082daa`。
- 设备 `SW_CLR_TANK_001` 唯一；场地独立根节点。圆形厚壁、底板/坡底/集泥斗、独立分区水面、中心柱/进水井、桁架刮泥桥、支吊刮板、驱动细节、齿形出水堰/集水槽、检修走道/楼梯/栏杆和进出水/排泥管道。
- `MECH_ScraperBridgePivot` 局部中心明确（源Z / glTF局部Y轴），独立网页+45°检查通过。仅模型姿态预览，不是工业设备控制。
- 演示直径24m；原标高/壁厚/底板规范沿用；尺寸集中 `config/clarifier.json`，不是施工设计。独立后台Blender5.3制作、重开Blend及独立导入GLB通过，轴向只转换一次。未接触交互Blender场景。
- 复用原已登记免费PBR/项目M0.1派生材质，无新增外部下载或付费。来源许可仍见 `docs/asset-register.json` 与 `docs/acceptance/m0-visual-r1/downloaded-resources.json`；本资产打包11张可解码纹理、颜色空间/尺寸与源材质摘要见 `m2-asset.json`。

## 实际文件与运行

既有文件修改：`src/App.vue`, `src/agent/demoParser.ts`, `src/components/dashboard/AgentWorkspace.vue`, `src/components/dashboard/DeviceSummary.vue`, `src/components/dashboard/ProcessFlowPanel.vue`, `src/components/dashboard/SceneViewport.vue`, `src/composables/useDashboardContext.ts`, `src/composables/useSceneWorkspace.ts`, `src/data/mockDataProvider.ts`, `src/qa/exposeDashboardQA.ts`, `src/scene/deviceRegistry.ts`, `src/scene/runtime.ts`, `src/styles.css`, `tests/dispatcher.test.ts`, `vite.config.ts`。
新增实现：`src/components/AssetViewer.vue`, `src/scene/renderPolicy.ts`, `src/scene/units.ts`, `src/viewer.ts`, `tests/registryUnits.test.ts`, `tests/renderPolicy.test.ts`, `config/clarifier.json`；`viewer.html`、`scripts/blender/build_clarifier.py` 与 `scripts/m2-*.mjs`用于资产与本轮快检。

修改前可恢复源码归档 `.cache/m2-before-20261116052842.tgz`；Git原有未跟踪状态保留，无提交/重置/推送。233份受保护文件校验不变，含旧证据、参考图、原曝气池Blend/GLB与建模脚本。原Agent Dispatcher、CameraController、统一时钟和图表生命周期修复未改动。

- 开发：`pnpm dev` → http://127.0.0.1:5173/
- 固定生产候选（当前服务）：`pnpm preview` → http://127.0.0.1:4173/
- 二沉池独立预览：http://127.0.0.1:4173/viewer.html?model=clarifier
- 重建二沉池：`/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/blender/build_clarifier.py`。仅重建本项目托管资产，分阶段验证后替换。

后续阻塞仍为原完整效果持续退化的底层原因与正式性能验收；本轮不扩展调查。交互优先模式与新资产等待用户体验/视觉验收。DPR2三维、多浏览器/移动端、全厂并载性能及二沉池工程校核未验证。
