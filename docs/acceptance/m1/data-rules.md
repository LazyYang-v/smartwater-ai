# M1 模拟数据口径

- 唯一来源：`src/data/mockDataProvider.ts` 的 `MockDataProvider`。版本 `smartwater-m1.2`，固定种子 4107，演示起点 `2026-01-15T08:00:00Z`（北京时间 16:00）。无真实采集、API Key 或模型 API。
- 浏览器系统时间：真实墙钟；演示数据时间：起点 + tick × 5 秒；数据更新时间：本次快照在浏览器发布的真实系统时间。三者分别标注。
- `SimulationClock` 由一个组合式模块、一个 1 秒调度器驱动，每 5 秒最多发布一个快照。暂停/页面隐藏会清空累计时间；恢复从当前演示时间继续，不补跑隐藏期间的快照。系统时钟不因用户暂停演示而停下。
- 切场景原子替换快照，tick 重置为 0；相同场景、tick、版本、种子的原始数据和告警可复现。`updatedAt` 为实际发布时间，允许不同。场景切换不调用场景工具，不清日志、不重载 GLB、不重置相机。

## 指标

| 指标 | 范围 | 单位 | 口径 |
| --- | --- | --- | --- |
| DO | SW_BIO_AERATION_001 | mg/L | 固定种子噪声叠加低频变化；低 DO 场景叠加固定演示事件 |
| pH | SW_BIO_AERATION_001 | 无量纲 | 7.2 附近的确定性模拟曲线 |
| 水深 | SW_BIO_AERATION_001 | m | 固定 4.8，沿用模型水面，不做动态水位控制 |
| 关联鼓风机功率 | SW_AIR_BLOWER_001 | kW | DATA_ONLY 模拟关联设备，不是全厂能耗，不是 kWh 电量；暂无三维模型 |
| 有效告警数 | 当前快照 | 项 | 直接取当前 `alarms.length`，含待数据确认的有效事件 |

每个读数有 scopeType、scopeId、metricKey、value、unit、observedAt、quality、source、snapshotId，并增加 `sampleAt` 表示图表时间槽。source 永远为 SIMULATED；GOOD/MISSING/STALE 是独立质量标识，模拟数据不因此自动判为异常。

过去 24 小时按 1 分钟间隔产生同一份历史（含当前点共 1441 点）；1h/6h/24h 只截取这份历史，不各造曲线。当前 DO、功率读数直接引用历史末点，KPI/详情/图表使用同一原始值。告警发生值来自同一读数函数。显示可以四舍五入，原始值不另造。

## 三个固定场景

- NORMAL：质量 GOOD，DO 约 2.65，零演示告警。
- LOW_DO：演示起点前 40 分钟开始下降，前 28 分钟出现低于 2.0 mg/L 的事件，此后稳定在约 1.62。预警状态 ACTIVE。
- MISSING_DATA：保留相同低 DO 历史；起点前 12 分钟起 DO/pH 缺测，关联功率过期（保留起点前 13 分钟的最后读数与 observedAt），水深仍为 GOOD。低 DO 事件状态 AWAITING_DATA，不能因缺测自动解除。

唯一 DO 规则：`DO < 2.0 mg/L`，规则 ID `DEMO_DO_LOW`，集中在 `RULES`，等级 WARNING。界面明确写“演示阈值 / 非运行建议”，不代表法律限值、控制目标或现场工艺建议。

MISSING 显示“— / 缺测”，原始 value=null；STALE 显示“— / 过期”，即使保留旧数值也不当作当前有效值。图表只把 GOOD 的 value 送入线段，其余为 null，connectNulls=false，不补零。时间槽使用 sampleAt，过期读数实际时间使用 observedAt。暂无告警只能表述“暂无演示告警”，不据缺测声称数据正常。

## 上下文与工具

面板数据实体目录仅提供文字/数据描述；唯一三维注册表仍为原 DeviceRegistry。未建模工艺节点标记“示意 / 未建模”，不意味着故障、停机或离线。

告警点击只展开详情、切换 DO 趋势上下文；必须另点“定位设备”才经已有 Action Dispatcher 调用 scene.focus_device，记录 USER / 告警定位。未建模对象不可定位，不产生伪造成功日志。

Agent 快捷按钮和输入均走同一个确定性解析器，仅 scene.focus_device 与 scene.reset_view。普通 UI 定位不伪造聊天消息。UI 中另有数据上下文不等于三维选中状态；三维 ID 始终来自共享注册表，面板明确显示两者。

功率最后有效观测固定在演示起点前 13 分钟，此后所有历史时间槽与当前读数均为 STALE；不得出现比 current.observedAt 更晚的 GOOD 功率样本。版本 m1.2 修复了前一候选的缓存时间戳回退，先前失败证据见 candidate-1/chronology-before-fix.log。
