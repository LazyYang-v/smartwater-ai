# M3.1 · 真实模型联调交付

**基础请求通过、真实工具循环通过、A–D及两条改写通过；数据仍全部为SIMULATED。** 当前供应商OpenAI，模型`gpt-6-luna`，协议Chat Completions，`reasoning_effort: none`。这描述所列成功实例，不是任意输入或长期稳定性保证。

历史`update.md/status.json`保留的是当时“缺配置”的状态；当前状态见[live-status.json](live-status.json)。秘密文件由用户在本地填写，本轮没有改写、复制或回显；实际密钥匹配扫描确认客户端产物与验收记录均不包含它，Git忽略规则有效，见secret-audit.json。

## 实际结果

| 任务 | 终态 | 模型请求 / 工具步骤 | 真实任务与完整记录 |
|---|---|---|---|
| A | SUCCEEDED | 4 / 3 | [0b7f22d7-6e0b-45c8-ae76-80a3b9ab80ec](task-a-real.json) |
| B | SUCCEEDED | 4 / 5 | [5a87e64c-2b37-4605-a202-4a8ce1f0472a](task-b-release-real.json) |
| C | SUCCEEDED | 4 / 14 | [10118f88-2fb5-4d6a-b2d7-627e621ee60b](task-c-release-real.json) |
| D | SUCCEEDED | 2 / 3 | [7f7f9c9d-457b-41f6-8acf-e0676c09b49e](task-d-accepted-real.json) |
| 改写A | SUCCEEDED | 3 / 4 | [25613f5d-d009-4c19-b9de-6863b4943560](task-paraphrase-a-release-real.json) |
| 改写C | SUCCEEDED | 4 / 11 | [bac6ae93-13cc-4d9a-b92e-92f57306f1b1](task-paraphrase-c-release-real.json) |

- A及改写A：真实定位`SW_AIR_BLOWER_001`，相机到位/选中/实际绘制完成，6h功率曲线与统计同一任务快照，单位kW。原A的模型顺序为“查询→定位→曲线”，并非Demo的固定顺序。
- B：真实告警触发值、发生时间、演示阈值、事件/当前质量与DO曲线均有实际证据。模型只解释规则，不诊断故障因果。
- C及改写C：四个设备均有实际资料/指标查询。低DO告警、未配置评价规则、无指标分别呈现；缺测场景实际识别DO/pH缺失、功率STALE、二沉池/提升泵无指标，均不判正常。没有补零或添加泵/二沉池虚构指标。
- D：实际答复明确“无指标、未观测，无法判断；无告警不能证明正常”。

### 首条完整真实工具循环

任务`439cb611-02f1-45f5-8b15-7762976dbf1a`：模型返回`device_get_details`，适配为`device.get_details`，参数`device_id=SW_AIR_BLOWER_001`；前端同一Dispatcher校验并查询原数据，结果回传后模型引用`EV_439cb61102f1_1`作答。

实际tool call ID：`call_EDAEHQ2QcRZXaZKbooVy7GRP`；对应上游request ID：`req_fb2180e6de7e42aebf9b0a4ebb20be94`。两次实际请求均HTTP200，响应ID、用量及查询结果完整保存在[real-tool-loop.json](real-tool-loop.json)。未经过Demo模板生成步骤，未强制业务任务的固定函数序列。

### 真实网络取消

任务`1dcc466d-101e-4fc0-a9e2-80e7c967f53d`在第二个真实请求等待期间，从可见且命中检查通过的取消按钮触发，`isTrusted=true`。已完成的3个步骤保留，本地fetch记录`signal_aborted=true`；五秒后没有新步骤、相机/选中/固定曲线变化或任务SUCCEEDED。详见[real-network-cancel.json](real-network-cancel.json)。随后真实模型调用`scene.reset_view`成功，任务`d7a5214f-22f1-413d-ab9e-29412cf94177`，选中清空。**本地取消不保证上游计算或计费停止；该未返回请求用量未知。**

## 实际修正

共修改12个实现/测试文件，精确清单见modified-files.json；未改模型资产、场地、材质、场景runtime、默认单元查看或依赖版本。

1. 首次直连真实请求出现`UND_ERR_CONNECT_TIMEOUT`。无凭据连通性对照证明现有代理可达；为本项目网关启用Node现有`--use-env-proxy`，不修改系统代理。随后基础请求HTTP200、返回OK，实际14 tokens。保留basic-request.json及basic-request-proxy.json。
2. 按[OpenAI官方模型文档](https://developers.openai.com/api/docs/models/gpt-6-luna)，为当前模型明确设置`reasoning_effort: none`；端点保持OpenAI固定地址，不增加多供应商平台。
3. 按供应商错误体区分认证、额度、限流、模型/权限、参数、服务错误；补上脱敏request ID、response ID、用量及工具调用关联。协议拒绝也保留元数据。受控错误测试不冒充真实上游失败。
4. 原解析器拒绝实际返回的9个调用，已记录count及finish_reason。单批上限与原任务累计20次统一，累计仍20、模型请求仍6，逐项校验并顺序执行，没有并行相机执行者。
5. 修正真实输出兼容问题：只允许逐字引用实际规则中的数值，未验证数值仍拒绝；识别明确的否定/保留判断，肯定健康或控制声明仍拦截。巡检默认当前值，pH/水深没有历史时明确提示省略hours，不伪造历史。
6. 趋势允许引用同任务、同设备/指标、同快照的当前读数或告警依据；已有历史统计仍要求同一时窗，跨任务/设备/版本拒绝，返回reference_kind说明来源。缺少展示等结果时，在原预算内仅反馈未达成结果，由模型继续选择工具；不预执行或生成确定性工具步骤。该反馈分支有受控回归，所列最终实测成功任务未触发反馈，不宣称它们完成了真实自修复。

## 验证、证据与用量

- 最终全量回归 **63/63通过**；类型检查及生产构建通过。新增断言覆盖错误体分类/脱敏、实际回执字段、二十调用边界、否定句与肯定反例、规则阈值篡改、无历史、同版本趋势/错误时窗、缺项反馈和预算停止。见regression-live.log/build-live.log。
- 对真实记录作了59项结果核对，全部通过，见verification.json。单一renderer、两个图表、三维DPR=1；本轮未重复长时性能测试，也不借此宣称性能正式通过。
- 所有真实尝试，包括失败/部分完成，保留在attempts-and-usage.json及原始记录中；未以“多数通过”抹掉失败。出现过真实连接超时、一次模型请求超时、协议批量拒绝、无历史参数、证据引用及文案误拒；后者有对应修复和回归。未做真实额度/认证错误消耗试验。
- 去重后取得**60份上游响应的实际用量**（包含应用拒绝的回复）：输入197,550、输出6,714，合计**204,264 tokens**。另有未返回/早期未保留的用量为未知，直接连接失败也没有HTTP回执；这不是完整账单或费用估算。
- 两张实际网页截图：[鼓风机及六小时功率](blower-power-release.png)、[低DO告警依据](low-do-release.png)。相机、视口、DPR、选中、快照及运行时加载GLB摘要见build-and-screenshots.json。两图记录的是成功验收运行版本；其后最终包仅增补否定判断同义词，D与取消/复位在最终包实测，**未倒推截图与最终包摘要完全相同**。其他本轮开发截图只移动到.cache/m3.1-development-evidence，旧截图/失败记录未删除。

## 运行与未验证范围

现有`/Users/leizhenyang/projects/smartwater-ai/.env.gateway.local`仍仅含用户本地服务端配置。网关已重启并加载；启动为`pnpm agent:gateway`，此终端需继承可用网络/代理环境；前端生产预览`pnpm preview`，当前地址<http://127.0.0.1:4173/>，开发地址<http://127.0.0.1:5173/>。Key不进入VITE、浏览器存储、构建或日志。修改Key/模型后只需重启本项目8787网关。

定位仍要求当前视图已加载目标，可先选择鼓风机单元或四单元试运行；默认单元方式未改变。真实网络隐藏/恢复本轮未单独复采，沿用原取消生命周期与既有隐藏验证；已完成真实可见取消。其他模型/供应商、任意自然语言/对抗语句的全面语义保证、长期网络可靠性与性能均未验证。网络超时仍可能发生，明确失败而不自动重试、降级Demo或改变供应商。自然语言不能代替结构化事实和实际执行状态。

**所列M3.1真实联调任务已完成，等待用户体验验收；数据继续SIMULATED，不增加设备控制或进入下一阶段。**
