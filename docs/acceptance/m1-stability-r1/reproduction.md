# 运行与复现

当前项目启动：`pnpm preview`，地址 `http://127.0.0.1:4173/`。开发使用 `pnpm dev` / `http://127.0.0.1:5173/`。`pnpm test` 为所有既有及新增单元测试；`pnpm build` 同时运行类型检查。

冻结验收期间不要重新 build。固定文件见 `build-identity.json`；浏览器实际入口摘要、模型摘要和 GPU 信息见 `performance/browser-build-binding.json`。GLB 与 Blend 未修改。

## 条件与脚本

- 测试浏览器是当前 Ego TaskSpace62；脚本显式固定 p1。未来复用时先确认实际工作空间与 Page，不对未知来源标签页执行关闭。
- `scripts/m11-baseline-replay.mjs` 复放原 M1 九次的顺序，每负载重新导航；输出 `baseline-replay/`。
- `scripts/m11-browser-diagnostics.mjs` 对固定修复构建进行顺序单变量短测；每项等待实际完成。CPU Profiler只在标注条件启用，输出 `diagnostics-r2/`。
- `scripts/m11-diagnostic-overhead.mjs` 检查默认关闭 / 轻量诊断 / CDP metrics / 再关闭；输出 `diagnostic-overhead/`。
- `scripts/m11-old-new-pair.mjs` 同浏览器交替加载冻结前旧站点4180及修复站点4173。旧站点从保护归档提取，GLB/HDR链接到未变的项目资源。输出 `old-new-pair/`。
- `scripts/m11-browser-performance.mjs` 在同一文档串行运行 A/B/C各三次，不重载浏览器或页面，不截图、不录屏、不启用Profiler、CDP Performance域或轻量诊断。A仅暂停模拟时钟，全部面板仍在；B保留数据+双趋势；C另执行定位、内部取消负载、复位、范围与工艺面板操作。真实原生取消另行验证，不能拿内部负载替代。
- `scripts/m11-browser-endurance.mjs` 撤回隔离实验后独立新开同一冻结构建，持续测试内不重载，15个完整镜头窗口，包含场景/范围/工艺面板操作。只轮询完成状态，每个已完成原始数组拉取一次。
- `scripts/m11-browser-interaction.mjs` 从浏览器Input通道点击可见控件，并用实际Target切换观察可信visibilitychange；压力为每80ms显式忙等25ms，单列，绝不混入正常性能样本。
- `scripts/m11-browser-features.mjs`、`scripts/m11-browser-legacy.mjs`、`scripts/m11-browser-final-ui.mjs` 和 `scripts/m11-browser-restart.mjs` 为功能/资源/日志/实际指针及重启检查。

运行形式：`ego-browser nodejs < scripts/<上述脚本>.mjs`。所有浏览器脚本串行执行，禁止同时启动其他性能测试或截图。运行时应保持该测试页可见，切换用户焦点会被记录；前台样本出现hidden时保留全部数据并单独重新采样。

## 采样口径

三维实际DPR1，DOM原生DPR2，CSS1920×1080。模型区CSS与drawing buffer均1218×427，与旧M1一致。每个普通镜头窗口先预热两个900ms动作，然后68个动作，覆盖约一周，真实采样通常超过61秒。C先预热定位/复位，然后至少61.5秒，等待每条真实终态。

FPS = 逻辑场景提交数 / 实际采样墙钟时长。rAF回调Hz独立记录。P95为原始未截断间隔排序后floor(N×0.95)项，保留全部原始间隔及时间戳。>50ms、>100ms间隔与浏览器Long Task分别统计；render CPU墙钟时间不当GPU计时，renderer.info资源数量不当显存字节数。未测显示器实际呈现FPS。

每个负载独立与45FPS / P95≤40ms比较，不用九份平均数或多数通过替代。诊断差样本、收集不完整、真实隐藏时段及尝试失败均保留。
