# SmartWater M2.2 更新

**资产完成、数据映射完成、四单元集成完成、交互通过；本轮活动性能目标达标，视觉待用户确认。** 默认仍为原曝气池单元，四单元入口标“试运行”。保留双单元和独立预览，本轮停止，不新增第三种建筑。

## 使用与产物

`pnpm preview` → http://127.0.0.1:4173/ ，三维工具栏选择“四单元总览 · 试运行”；开发仍用 `pnpm dev`。独立预览 `/viewer.html?model=blower`、`/viewer.html?model=pump`；原aeration/clarifier保留。

| 资产 | 可编辑源 | GLB | 三角面 / GLB字节 |
|---|---|---|---|
| 鼓风机 | `assets/source/blower-unit.blend` | `public/models/blower-unit.glb` | 16,768 / 14,022,120 |
| 提升泵 | `assets/source/pump-unit.blend` | `public/models/pump-unit.glb` | 17,340 / 14,024,164 |

制作参数 `config/equipment-units.json`，脚本 `scripts/blender/build_equipment.py -- blower`（或pump，以原独立后台Blender命令运行）。两份Blend重开、GLB独立导入、网页载入验证通过；七张既有PBR贴图已解码打包，无新下载/购买。来源、颜色空间、尺寸及摘要见 `blower-asset.json` / `pump-asset.json`，许可沿用 `docs/asset-register.json`。未接触交互Blender场景。

## 实际增量

- 鼓风机继续用 `SW_AIR_BLOWER_001`，从DATA_ONLY升级为三维映射；功率卡片、详情和趋势共享原reading及snapshotId。提升泵 `SW_PRE_PUMP_001` 没有指标，不借用DO、功率或虚构流量/压力。
- 建筑容器 `SW_BLOWER_UNIT` / `SW_PUMP_UNIT` 与机械业务节点分开；注册包含unitId、资产根、机械节点、指标和加载状态，节点校验后才可定位。机械取景不包含建筑、道路或外部管路。新增嵌套容器回归发现祖先矩阵更新边界，已在bounds计算前正确更新，原断言保留。
- 屋顶为独立节点：检修选择自动隐藏目标屋顶，成功回执记录 `roof_presentation`；取消、超时、隐藏、复位或换目标恢复自动改变。明确的手动屋顶偏好保留。水面控制只作用于有水面的当前设备，两种能力不混用。
- `config/equipment-layout.json` 保持双池坐标，鼓风机(-23,0,-23)、提升泵(-42,0,-23)，比例1；仅向后扩展共同场地至104×52m，共用原renderer/照明，排除各资产预览地面，保留池内开口。
- 原主管有 `AIR_MainEndCaps` 封盖，没有核实为开放接口，**未强接管**。空气关系明确标“工艺示意 / 非连接管线”，不把泵直连二沉池。新单元内管路为演示布置，不是工程设计。

修改覆盖units/解析器/实体说明、runtime增量能力与装配、注册表、plantSite、roofPresentation、相关界面和composable、`tests/equipment.test.ts`。完整文件清单 `integrity.json`，修改前代码 `.cache/m22-before.tgz`。不新增Agent工具、框架或依赖；原CameraController及Dispatcher安全语义保留。

## 实际验证

38项单测、类型检查和构建通过；日志 `.cache/m22-unit-final.log` / `.cache/m22-build-final.log`。原>500kB chunk提醒仍保留。

28项浏览器快检覆盖四口令/复位、同ID同快照功率、机械本体视线可见、屋顶/水面范围、快速取消、单份加载失败而双池可用、模式切换不重建runtime/重复请求、过期数据不正常化。另补验真实PAGE_HIDDEN、原生拖动中断、机械超时、手动屋顶偏好及1366紧凑布局，均通过。原生取消从可见RUNNING控件触发。首次测试在取消后的局部视角点击屏外标签被阻挡，失败日志保留；回总览后正常选取，未强制点击。

## 一次连续确认

当前约定M3环境、Chrome156、完整1920×1080大屏；原生DPR2、三维DPR1，CSS/实际buffer均1218×427。双趋势和模拟刷新开启，30秒切换场景/范围，预热2次镜头后采样。无重载、截图、Blender或轨迹分析并发；真实隐藏验证单独进行。

| 活动阶段 | 秒 | 提交FPS | 原始P95 | >50ms / >100ms |
|---|---:|---:|---:|---:|
| 持续镜头 + 双趋势 + 数据 | 733.19 | 59.66 | 17.7ms | 33 / 3 |
| 跨设备定位/取消/复位 | 18.87 | 60.03 | 18.3ms | 0 / 0 |

连续总时长753.92s，全程前台。按60秒原始间隔分窗，最低区间吞吐58.50/s，最高P95 18.4ms，末段未出现断崖。空闲停绘未计成高FPS；这些不是GPU耗时或显示器呈现帧率。原始长帧完整保留于 `confirmation.json` / `minute-windows.json`。

资源样本稳定为1 renderer、245几何资源、37纹理、6程序（不是显存字节）；场景201,408三角面，采样结束236 draw calls，调用数随视角/阴影变化。新资产本次下载/解码/解析：鼓风机478.8ms、提升泵257.6ms，不是纯网络或冷系统耗时。runtime缓存已访问资产，模式切换不释放其他单元使用的资源，销毁时统一释放。

## 四张截图与关联

固定构建 `33e1733a5ff84653cc5c8f87a597a86abae9ab53014461492012a0d0b1c0ecb4`。候选确认/截图期间构建与源文件不变，浏览器JS/CSS及四份GLB响应摘要匹配交付；447份既有资产、证据和参考文件校验不变。

- [四单元总览](final-four-overview.png)
- [鼓风机定位及功率](final-blower-focused.png)
- [提升泵定位及细节](final-pump-focused.png)
- [Agent跨设备操作和复位](final-agent-reset.png)

均来自实际网页；时间、相机、DPR、数据快照、选择状态与真实执行记录见 `final-screenshots.json`，字节关联见 `build.json` / `integrity.json`。

已知范围：仍有偶发长帧；成绩仅适用本轮交互优先、本机DPR1负载，原完整效果、3D DPR2、其他浏览器/移动端不扩大结论；泵无模拟指标，跨单元管路仅示意，尺寸与布置未作工程校核。最终视觉由用户确认。
