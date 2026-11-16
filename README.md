# SmartWater v0.2 · 运维业务首个纵向流程

现已接通 **独立模拟采集器 → Spring Boot → PostgreSQL → 告警生命周期 → 原三维大屏与只读 Agent**。前端沿用 Vue 3、TypeScript、Three.js、ECharts。数据仍为 **SIMULATED**；未接现场设备，模型尺寸未经工程校核。

本次交付是 v0.2 的第一个可运行增量：设备台账、遥测入库与历史查询、告警触发/确认/恢复/关闭、基础登录/角色和审计。**工单、服务端 Agent 任务编排及服务端任务/报告存储尚未实现**；当前执行器和 IndexedDB 历史继续保留。不是六个业务模块全部完成或生产系统认证。

## 启动业务模式（默认入口）

需要现有 Java 17+、Maven、Docker Compose，以及项目 Node 24.21.0 / pnpm 11.25.0。锁文件保留；不需要重新建模。实际验证 Java 17.0.20.1、Maven 3.9.9、Spring Boot 4.1.2、PostgreSQL 17.12。

```bash
pnpm install --frozen-lockfile --store-dir .pnpm-store
python3 scripts/business.py init
python3 scripts/business.py db
python3 scripts/business.py run
```

`init` 仅在缺失时生成被 Git 忽略、权限为 0600 的 `.env.business.local`，不覆盖已有配置、不打印凭据。请在本地编辑器查看/管理该文件，勿发进聊天或提交 Git。账户为 `admin` / `operator` / `viewer`，分别对应 `SW_ADMIN_PASSWORD` / `SW_OPERATOR_PASSWORD` / `SW_VIEWER_PASSWORD`。首次启动以 BCrypt 写入数据库；之后修改环境密码不会自动覆盖数据库账户。

另开项目终端，运行独立采集器及前端：

```bash
# 首次可回填一组 24h 历史；以本次实际启动时刻为窗口终点。
python3 scripts/business.py collect NORMAL --seed
# 持续上报：每 60s 一次，Ctrl+C 停止。不要同时启动多个场景采集器。
python3 scripts/business.py collect LOW_DO --continuous
pnpm dev
```

默认 http://127.0.0.1:5173/ ：登录后从业务 API 查询设备、最新值、趋势和告警；每 5s 查询一次。隐藏/暂停页面只停止页面查询，独立采集器与服务端继续工作。服务端重启后需重新登录；数据库业务记录仍然保留。

生产构建预览：

```bash
pnpm build
pnpm preview
```

可用 `python3 scripts/business.py package` 后运行 `python3 scripts/business.py serve` 启动打包 JAR（已验证），代替开发用的 `run`。

预览 http://127.0.0.1:4173/ ，开发与预览均代理 `/api/business` 到 8080、`/api/agent` 到 8787。Spring Boot、PostgreSQL 与模型网关需分别运行；默认只绑定本机。数据库宿主端口 55439，项目 Docker 网段 `10.231.0.0/24`，数据卷 `smartwater-v02_business-data`。默认地址池耗尽/55432 已占用时未清理其他项目，使用项目专用地址与端口；可用 `SW_DOCKER_SUBNET`、`SW_DB_PORT` 配置，修改端口时同步设置 `SW_DB_URL`。不要执行 `docker compose down -v` 删除业务数据。

### 数据口径和操作

- 四个设备 ID 与原三维节点一致；二沉池与提升泵没有运行指标，仍为“无法判断”。水深只接受 4.8 m，水面几何保持不变；功率为 kW。
- 采集接口只接受服务端 `SW_COLLECTOR_TOKEN` Bearer 凭据，不放入浏览器。校验设备/指标归属、单位、有限值、质量及时间（2000 年至当前时间后 30s）。缺测为 `null`；GOOD 超过 120s 在当前查询中标过期。
- 三种采集场景 `NORMAL / LOW_DO / MISSING_DATA` 在独立进程选择；业务页面没有生成或切换数据的假按钮。需要切换时停止当前采集器，运行另一场景；旧记录不覆盖。
- PostgreSQL 中 `demo-do-v1` 演示规则为 GOOD 的 DO < 2 mg/L。持续异常复用同一活动告警；缺测/过期不解除；有效值恢复后标 RECOVERED。运维/管理员填写说明后人工确认；已恢复且已确认才能关闭。关闭记录仍保留，均记录审计。
- VIEWER 只读；OPERATOR/ADMIN 可以确认和关闭；审计查询仅 ADMIN。服务端鉴权、Cookie 会话、CSRF 校验均实际执行，不依赖隐藏前端按钮。
- `Idempotency-Key` + 请求摘要保证采集及人工处理幂等；键复用于不同请求返回冲突。采样唯一键阻止历史覆盖。乱序数据可入历史，但不倒退当前告警状态。
- 趋势按分钟取最后一条记录，支持 1h/6h/24h；统计由服务端计算，包含有效/缺测/过期数、请求时窗与实际覆盖时刻。未采集的分钟不补零，覆盖率以预期分钟数为分母。
- 每个 API 快照固定数据库提交版本、查询时刻、设备/规则元数据。Agent 查询固定该快照；查询证据在 PostgreSQL 可按 `EV_DB_...` 回查。相机/图表由现有前端执行并确认实际展示，服务端不伪造展示成功。

### 主要接口

前缀 `/api/business`：`auth/csrf`、`auth/login`、`auth/me`、`auth/logout`；`devices`、`dashboard`；`snapshots/{id}` 下的设备 details/metrics、alarms/inspect；`evidence/{id}`；机器上报 `POST telemetry`；`GET alarms` 和 `POST alarms/{id}/acknowledge|close`；管理员 `GET audit`。网页“告警台账”展示最近 100 条记录并提供受权限保护的人工处理。

## 显式离线演示

无需启动业务服务时访问 http://127.0.0.1:5173/?data=demo 或预览端口的同一路径。仅该入口使用原 `MockDataProvider`；业务请求失败不会静默降级。以下原演示流程和 IndexedDB 说明仍适用；Demo/LLM 驱动模式与业务/离线数据源是两个独立选择。

## 真实模型配置

仅使用项目内 `.env.gateway.local`；如文件不存在，参照 `.env.gateway.example` 手动创建，已有文件不要覆盖。在本地编辑器中填写：

- `SMARTWATER_OPENAI_API_KEY`：已授权的 OpenAI API 密钥。
- `SMARTWATER_MODEL`：账号实际可用的模型 ID。

本次联调使用的模型以报告中的上游实际回执为准。协议为现有 OpenAI Chat Completions 工具调用，端点固定为 `https://api.openai.com/v1/chat/completions`。不提供任意 URL 代理，不新增供应商。凭据不要放进 `VITE_*`、浏览器存储或对话。`.env*` 已忽略，只有无密钥示例允许纳入版本记录。

另开项目终端：

```bash
pnpm agent:gateway
```

配置改变后重启此网关命令；前端无需为密钥重新构建。启动脚本使用 Node `--use-env-proxy` 兼容现有网络代理环境，不打印凭据。界面“检查连接”仅检查配置可用性，实际联网成功须以任务结果为准。模型失败不自动切换 Demo。

生产预览同样需要网关进程。当前没有公网部署；新增业务账户不代表已完成多用户生产安全建设，不要把本地模型网关暴露到网络。

## 演示流程

1. 默认仍为单元查看、三维实际渲染倍率 1，沿用交互优先模式。四单元厂区入口保留试运行标识；已有独立预览位于 `/viewer.html`。
2. 显式离线入口下，NORMAL、LOW_DO、MISSING_DATA 来自原 MockDataProvider；每 5 秒发布快照，隐藏页面暂停且不补跑。水深固定 4.8 m。功率单位 kW，不是电量 kWh。
3. Agent 选择 Demo 或已配置的 LLM。支持：定位鼓风机并查看六小时功率、解释低 DO 告警依据、巡检四单元、检查提升泵。Demo 是确定性模板，LLM 使用实际模型工具循环。
4. 七个工具：`scene.focus_device`、`scene.reset_view`、`device.get_details`、`device.get_metrics`、`chart.show_trend`、`alarm.list`、`alarm.inspect`。相机和图表均须实际完成展示才返回成功；没有设备控制权限。
5. 在 LOW_DO 场景输入“巡检当前四个单元，列出异常和缺少的数据。”。报告保留演示时间、固定快照、证据引用和实际模型记录。提升泵、二沉池没有既定指标时始终无法判断；无告警不等于正常。
6. 任务终态后打开“查看记录 / 导出”，或切到“历史任务”。支持 Markdown、JSON；两者来自同一冻结报告，不重新请求模型或当前数据。
7. 刷新后可读旧记录。“重新执行（新快照）”才会新建 task_id、关联原任务，按任务当时模式执行；不会覆盖旧记录，也不会静默切换 Demo。

## 任务完成与证据

任务启动时固定设备、指标、历史时间窗和展示要求；查询与趋势分别验收，六小时要求不能由一小时结果满足。现有四项任务及常见同义表述使用同一约束，LLM 仍自主选择工具；无法识别或有歧义的完整要求会保留实际结果并标为未完成，不宣称通用自然语言任务已被全面验证。

结果卡和新报告共享证据聚合：同设备分次查询的指标全部保留，不同历史时间窗分别列出，重复结果去重，冲突值保持无法判断。旧报告不自动重算。独立预览随当前单元 / 选中设备变化，厂区未选择设备时提示先选择。

## 本地历史、保存与清除

使用本站点 IndexedDB 数据库 `smartwater-tasks-v1`，对象仓库 `tasks`、`reports`，schema_version=1。只保存必要查询结果、统计、规则快照、执行步骤及模型回执；不保存密钥、认证头、环境变量、模型内部推理或三维对象。没有保存完整历史曲线，不从新数据假装恢复旧曲线。

**仅保存在当前浏览器与站点，重要结果请导出。** 5173 与 4173 是不同站点存储；换浏览器、隐私窗口、清理站点数据或浏览器回收空间可能失去本地历史，不提供多端同步、备份服务或导入恢复。此处指任务/报告历史尚未迁到业务数据库；设备、遥测、告警与查询证据已服务端持久化。

保存与任务执行状态独立：事务提交后才标“已保存”；配额或写入失败时保留内存结果，支持导出与明确重试，不删除旧记录腾空间。异常关闭前未确认终态的任务，下一活动实例显示“执行中断 / 结果未确认”，不重放模型或工具。

同一站点使用 Web Locks 限制一个活动 Agent 实例。其他标签页只读历史；旧页面关闭后可点“申请执行权”。不支持 Web Locks 时禁用任务执行以保护历史。隐藏页面沿用取消任务策略；不对仍持锁的其他页面任务做中断恢复。

如确需清除，先导出重要结果，再手动在浏览器开发者工具 **Application → IndexedDB → smartwater-tasks-v1 → Delete database**，关闭同站点标签页后重开。此操作不可恢复；不自动清理，不通过测试操作真实历史库。

## 验证与边界

```bash
pnpm typecheck
pnpm test
pnpm build
```

浏览器验证使用 `ego-browser`，先运行 `ego-browser skill`。旧脚本可能写旧验收目录，不应直接重跑覆盖旧证据。`?qa=1` 提供本地验收接口，非 Agent 工具；故障注入只允许名称以 `smartwater-m4-test-` 开头的独立测试库，不能清空真实任务库。

M4 验收与实际导出位于 `docs/acceptance/m4-reports/`，旧资产与历次记录保持原状。当前已增加设备/遥测/告警业务纵切，仍使用模拟采集；不接真实工业设备、真实监测数据、工单或控制系统，不扩展既有性能结论或承诺多用户生产能力。全模型查看的性能限制仍保留原试运行说明。


## 业务测试与交付限制

```bash
python3 scripts/business.py test-db
python3 scripts/business.py test
python3 scripts/business.py package
```

集成测试通过真实 HTTP、Spring Security、Flyway 和 PostgreSQL 执行，使用独立 `smartwater_test` 数据库下每次新建的 `it_*` schema，不清空业务库。`scripts/verify_business.py` 会向运行中的业务库写入明确的 SIMULATED 验收记录；不会删除旧记录，正式数据环境不要直接运行。

本轮记录位于 `docs/acceptance/v02-business/`。现有限制：无工单/处理人流转、无服务端 Agent 编排与任务报告库、无账户管理页面/密码重置、无分区/留存/备份策略、无公网 TLS 部署或生产容量验收。单实例版本锁串行化写入用于当前低吞吐验证。快照描述符随查询增长，当前不自动删除；后续需制定保留与清理策略。旧 IndexedDB 任务不按新登录账户隔离，不应在共享浏览器中视作服务端用户私有记录。资产和前端大 chunk 警告保留，未将其作为业务开发前置阻塞。
