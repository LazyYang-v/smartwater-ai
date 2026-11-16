# SmartWater M0 实施与验收

完成日期：2026-11-16（Asia/Shanghai）。范围止于单池、查看器、Demo Agent 和两个场景工具。技术验收通过，视觉效果待用户验收。

## 已实现

- Vue 3 + TypeScript + Vite + Three.js；页面持续显示 SIMULATED · 演示数据、Demo Agent · 确定性演示解析器。
- 42×18m 净尺寸、5.5m 净深的半埋地池体；壁厚0.4m、底板0.5m、池底-4.3m、池顶+1.2m、水面+0.5m。
- 实体底板和池壁、池沿、结构接缝、倒角、环向通道、跨池钢桥、两处楼梯、栏杆和基础支撑。
- 连续空气主管、六路下降管、弯头、法兰及螺栓、手轮阀、管道支架、配气管与192个曝气盘。
- 独立不透明水面、细微法线波纹、局部硬地、道路、路缘和少量绿化。地面分块，为池体保留开口。
- 设备根节点唯一：SW_BIO_AERATION_001；场地根节点独立。轴向只在GLB导出时转换；网页未追加旋转补偿。
- scene.focus_device 与 scene.reset_view；共享注册表、相机单执行者、渲染后回执、取消、超时、action_id 幂等及完整工具记录。

## 已验证

| 检查 | 结果与证据 |
|---|---|
| 类型检查、生产构建 | 通过；build.log |
| 单元测试 | 4/4；unit-tests.log、tests/dispatcher.test.ts |
| 浏览器交互与失败场景 | 14/14；browser-tests.json |
| Blend重新打开 | 通过；SmartWater_M0 为活动场景，文件贴图均已打包 |
| GLB独立重新导入 | 通过；ID、层级、尺度、水面标高、有限法线、非退化面、地面开口检查通过 |
| 默认对象排除 | GLB不含Cube、Camera或Light |
| 下载文件 | 七个外部资源长度、发布方MD5、SHA-256与实际图像解码均已检查 |
| 服务重启 | 停止本项目预览进程后重新启动，模型、两条口令及正常生产URL均再次通过 |
| 生产诊断接口 | 普通生产URL不暴露；仅开发模式或显式?qa=1可用 |
| 参考图保护 | SHA-256保持 b59b4d090c143b86ba82217249e20afa19c161ce083722e83da288cf8a2d683c |
| 交互Blender保护 | 最终只读MCP检查仍为Cube、Camera、Light；建模和验证均在独立后台进程完成 |

浏览器案例覆盖：真实模型/环境资源加载、未知口令不派发、定位与复位、重复action_id、缺失设备、真实重载期间未就绪、缺失GLB与重试、无效GLB、快速连续指令、鼠标拖动中断、超时、普通点击共享选择、水面开关、前景道路遮挡。

## 实测数据

- GLB：24,080,432 bytes（24.08 MB / 22.96 MiB）。
- 可编辑Blend：20,178,053 bytes。
- 完整资产：106,042三角面，50个网格；总览50次绘制调用，选中时增加1次辅助轮廓绘制。
- 浏览器首轮记录：请求、解码与注册 2562.0 ms；首次更新渲染完成 2816.9 ms。其他加载记录保留在各JSON中，数值会受本地缓存和当时负载影响。
- 浏览器：Chromium / Chrome 156.0.8078.96（navigator高熵版本信息）；ego-browser CLI 2.2.1。WebGL2，Apple M3 / ANGLE Metal。
- 性能条件：本地生产预览，1920×1080 CSS视口，DPR=1，渲染DPR=1，画布1440×659；页面可见且有焦点，资源已加载，抗锯齿开启，2048阴影贴图，无Bloom/雾/景深后处理。
- 连续环绕镜头：2次预热移动后采样20次移动，共18.28秒、1097帧。
- 平均 60.00 FPS；P50 16.70 ms、P95 18.40 ms、P99 18.60 ms；超过33.34ms的帧数为0。
- 本次条件下通过30FPS目标。原始帧时间见performance.json。

首轮含自动化轮询的采样平均44.7FPS、P95为66.6ms，未通过，完整保留为performance-baseline.json。后续保持画质和1920×1080视口，采用页面后台采样、Node端被动等待，避免向页面注入轮询；按实际完成标志读取结果。性能通过仅适用于记录的条件；初次纹理上传单独体现在加载数据中。

## 真实网页截图

| 内容 | 文件 |
|---|---|
| 1920×1080总览 | [overview-1920.png](acceptance/overview-1920.png) |
| 池壁、栏杆、主管与连接近景 | [connections-closeup.png](acceptance/connections-closeup.png) |
| 隐藏水面的曝气阵列 | [aerators-water-hidden.png](acceptance/aerators-water-hidden.png) |
| Agent定位及工具记录 | [agent-focused.png](acceptance/agent-focused.png) |
| Agent恢复总览及记录 | [agent-reset-overview.png](acceptance/agent-reset-overview.png) |
| 1366×768布局 | [layout-1366.png](acceptance/layout-1366.png) |
| 服务重启后的普通生产页面 | [restart-normal-production.png](acceptance/restart-normal-production.png) |

尺寸和SHA-256见screenshots.json。阶段A的缺失资产状态、阶段B首次网页效果、阶段C检查截图及加载失败截图也保留在acceptance目录。所有截图来自真实网页，无AI图片或Blender渲染替代。

## 启动、资源和复现

当前预览：http://127.0.0.1:4173/ 。启动命令为pnpm preview；开发命令为pnpm dev，地址http://127.0.0.1:5173/。完整步骤见项目README。

资源来源、作者、CC0许可、下载时间、文件名、分辨率、SHA-256和解码结果见asset-register.json；所有运行资源均在项目内。建模配置为config/aeration.json，脚本为scripts/blender/build_aeration.py，普通GLB没有额外压缩解码依赖。

## 未验证与已知问题

- 其他浏览器、原生DPR=2的持续性能、移动设备交互、长时间耐久测试：未验证/未测量。
- 1366×768已验证布局和操作可用性，未单独进行性能采样。
- Vite提示主JS包大于500kB，约769kB原始大小、205kB gzip；构建通过。当前M0未为此引入额外解码或拆分链路。
- 材质老化强度、水面颜色、构件细节和整体工业质感仍待用户视觉验收；技术检查不代表视觉最终通过。
- 演示尺寸未作结构、工艺或安全工程校核。当前没有真实工业数据、设备连接或真实LLM。

## 待用户视觉验收

请以总览、近景和隐藏水面截图判断工业质感、结构比例、材质和界面风格。M0功能与证据已经交付；未扩展完整厂区。
