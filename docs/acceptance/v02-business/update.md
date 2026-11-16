# v0.2：设备、遥测与告警业务流程

基线 `160645dde186119785f1368de95d3c749acf34ac`，2026-11-17 本地交付。已完成独立采集器 → Spring Boot → PostgreSQL → 告警状态流 → API 大屏 / 只读 Agent 的首个业务增量。

## 实际交付

- `backend/`：Spring Boot 4.1.2 / Java 17，Flyway 三份迁移。设备与指标台账、遥测历史、告警与事件、幂等回执、用户角色、审计、固定快照及查询证据均进入 PostgreSQL 17.12。
- `collector/simulator.mjs`：独立 Node 采集进程，每 60s 上报。只有显式离线入口 `?data=demo` 使用浏览器 MockDataProvider；业务 API 断连不会降级造数据。所有采集值仍标 `SIMULATED`。
- 默认页面增加登录、数据连接状态、查询暂停/恢复、告警台账与人工确认/关闭。后端实际执行 ADMIN / OPERATOR / VIEWER 权限和 CSRF；Agent 仍只有原七个工具，没有告警写工具。
- API 查询固定提交版本、数据时间、设备 / 指标 / 规则元数据。历史统计服务端计算，返回有效/缺测/过期/未上报样本与覆盖率；查询证据按 `EV_DB_...` 持久化，场景和图表仍由前端真实展示后回执。
- 原四个 GLB、Blend、布局、旧截图及验收资料均未改动。默认单元查看、四单元试运行与交互优先模式保留。

## 数据和事务

DO / pH / 水深归属 `SW_BIO_AERATION_001`，功率归属 `SW_AIR_BLOWER_001`；二沉池 / 提升泵无指标，保留无法判断。水深 4.8 m；功率 kW。GOOD 读数超过 120s 在当前查询标 STALE；MISSING 值为 null。趋势对显式缺测及无上报区间断线，显示缺口标记不生成遥测记录或进入统计。

`demo-do-v1` 仅是演示阈值（有效 DO < 2 mg/L）。持续低值只维持一条活动告警；缺测不解除，乱序数据不倒退告警。人工确认 + 有效恢复后才允许关闭。采集/确认/关闭均使用幂等键和摘要；修改请求复用同键返回冲突。数据库版本行锁及活动告警唯一索引共同约束状态变更，当前用于低吞吐单实例。

## 验证

| 检查 | 实际结果 |
|---|---|
| 原有及新增前端测试 | 104 / 104，通过；包含原 97 项及原 M4 报告字节兼容性 |
| 类型检查 / Vite 生产构建 | 通过；保留原有大 chunk 警告 |
| Spring Boot 集成测试 | 9 / 9 组，通过真实 HTTP / Spring Security / PostgreSQL，独立 `smartwater_test.it_*` schema |
| Java 打包与启动 | Maven package 通过；实际使用 `python3 scripts/business.py serve` 启动该 JAR |
| 业务流程 | 连续低 DO 去重、采集重试、缺测保留、确认幂等、恢复、关闭及审计均验证 |
| 重启留存 | 后端重启后，同一快照摘要、关闭告警和查询证据保持一致 |
| 真实模型巡检 | OpenAI / gpt-6-luna，4 次请求 / 14 个工具步骤，SUCCEEDED |
| 页面联动 | 鼓风机实际定位及 6h 功率；低 DO 依据及同快照 6h DO；提升泵无数据；跨单元后图表回执均通过 |
| 取消 | 可见 RUNNING 控件经 CDP 浏览器键盘/鼠标输入取消；旧任务 CANCELLED，随后新定位成功；迟到 API 结果另有受控测试 |
| 资源 / 布局 | 1920×1080 和 1366×768，业务栏不与 KPI 重叠；Agent 输入仍可见；复用图表实例与单一三维运行时 |

九组数据库测试分别覆盖：认证与四设备台账；混合批次校验回滚；采集幂等/连续告警；缺测及乱序；角色与 CSRF；确认/恢复/关闭/审计；服务端统计、指标归属和证据回查；并发重放与额外字段拒绝；旧快照设备/规则元数据冻结。

## 实测暴露的修复及保留失败

1. 真实模型曾给无指标设备传 `metric_keys: []`，任务如实 PARTIAL。补齐已有工具的 `minItems: 1` 及省略字段说明，使 Schema 与原有非空语义一致；真实复测通过。首次记录保留于 `llm-patrol-partial.json`，成功记录 `llm-patrol-final.json`。成功模型循环使用的 JS URL 在该记录中注明；此后界面/图表细修以最终构建快检验收，未再次消耗模型额度。
2. 新业务栏高度超过原 44px 槽位，曾遮挡数据状态。改为业务模式自适应行高；前图 `alarm-ledger-before-layout.png` 保留。
3. 已创建的 DO 图表在窄布局被隐藏、切回时，更新遇到零尺寸跳过，而原 resize 只改尺寸，没有补交待更新版本，导致 DISPLAY_FAILED / PARTIAL。新增待更新标记及显示后更新；`chart-switch-regression.json` 验证 DO 原实例在宽度 0 → 可见后仍复用，任务实际回执成功。失败图 / 元数据 `*-display-failure.*` 保留。
4. 一次浏览器 helper 测试记录 PAGE_HIDDEN，动作按策略取消，随后取消按钮已禁用，未强点或算作取消成功；见 `browser-quickcheck.json`。单独的浏览器 CDP 原生输入确认在 `browser-input-confirmation.json`。

## 证据与使用

- [业务大屏](business-dashboard.png)、[告警台账](alarm-ledger.png)、[1366 页面](business-1366.png)。截图是实际网页；截图 DPR=1 为 CDP 视口设置，常规窗口曾记录 DPR=2，Three 实际倍率始终为 1。本轮没有新 FPS / P95 或长期性能结论。
- `build-resources.json`：固定 dist、实际启动的 JAR、后端源码/迁移、未修改 GLB 的 SHA-256 和 PostgreSQL 镜像摘要。`browser-loaded-assets.json` 的实际浏览器脚本和已加载曝气池 GLB 摘要与产物一致；截图期间未更改构建产物。
- `business-journey.json` / `restart-check.json`：数据库流程、固定快照摘要、实际记录/证据 ID 和重启复查。`alarm-trend-task.json`、`patrol-task.json`、模型及切换记录保留真实步骤。敏感配置、Cookie、认证头和模型内部推理均不保存。
- 网页 http://127.0.0.1:4173/ ；API http://127.0.0.1:8080/api/business/health 。[README](../../../README.md) 包含完整启动与无密钥配置说明；本地 `.env.business.local` 和 `.env.gateway.local` 均被 Git 忽略，不进入客户端或提交。

## 仍未交付

工单及其分派/处理/验收/归档、服务端 Agent 编排与任务/报告库仍是下一业务增量。当前浏览器执行器与 IndexedDB 历史继续工作，后者不按新登录账户隔离，不是服务端用户私有历史。账户管理、密码重置、生产吞吐/安全/备份/留存、公网部署、真实工业采集与控制均未验收。数据库快照随查询增长，目前无自动清理策略。新数据源的完整隐藏/恢复长测没有重新开展；沿用已修复的场景策略，不能扩大旧验收范围。

本次完成首条业务流程，并非六模块 v0.2 全部完成。后续主线是工单和服务端任务闭环。
