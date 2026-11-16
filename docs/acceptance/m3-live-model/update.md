# M3.1 · 等待本地配置，真实联调未完成

本轮未发送任何上游模型请求，未把Demo或测试夹具算成真实成绩。只新增本目录的状态、回归日志及本说明；未修改产品代码、配置、资产、布局或默认查看模式，未创建或覆盖秘密文件。

## 当前配置与本地填写

- 服务端配置文件：`/Users/leizhenyang/projects/smartwater-ai/.env.gateway.local`，**不存在**。
- 无密钥示例：项目根`.env.gateway.example`，存在。已有变量仅`SMARTWATER_OPENAI_API_KEY`、`SMARTWATER_MODEL`，两项均未配置。
- 加载路径：`pnpm agent:gateway` → `node --experimental-strip-types --env-file-if-exists=.env.gateway.local server/index.mjs` → `configuration()`只读取上述两项服务端变量。
- 当前仅支持OpenAI Chat Completions；上游端点固定为`https://api.openai.com/v1/chat/completions`。没有可填写的自定义端点变量，不是第三方任意URL代理。
- 已验证`.gitignore`第11行`.env*`会忽略该秘密文件，Git索引没有该文件；只有无密钥示例被明确排除忽略。前端只请求本地`/api/agent`，不是从VITE变量读取凭据。

请在本地编辑器中参考示例，新建上述`.env.gateway.local`，仅在本地填入两项值。不要把Key发送到对话、放入VITE变量、终端回显或客户端存储。已有文件则编辑相应字段，不用复制命令覆盖。

```dotenv
SMARTWATER_OPENAI_API_KEY=
SMARTWATER_MODEL=
```

模型名不能由文档推断账号权限。已实际读取[OpenAI官方GPT-4.1 mini文档](https://developers.openai.com/api/docs/models/gpt-4.1-mini)：`gpt-4.1-mini`是有文档依据的短期联调候选，支持Chat Completions和Function calling；**官方已标记弃用，不作为长期默认推荐**。是否仍对账号可用、有无额度以及和当前所有请求参数是否兼容，均须实际基础请求确认。本轮未替用户写入或启用该模型，也未自动更换协议。接口参数核对来源：[官方Chat Completions参考](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)。

填好后只需在**运行本项目网关的终端**停止该进程（Ctrl+C），从项目根重新执行：

```sh
pnpm agent:gateway
```

需要重启的是`127.0.0.1:8787`的Node网关。现有开发页`http://127.0.0.1:5173/`、生产预览`http://127.0.0.1:4173/`无需为服务端凭据重建或重启；在页面点击“检查连接”。`ready=true`只证明配置字段完整，不证明认证、模型权限或工具调用成功。

## 已独立完成的检查

- 本轮读取本项目指令、配置加载、示例、启动脚本、协议适配及相关测试；没有搜索其他项目、私人目录或Codex配置。
- 网关8787、开发5173与生产预览4173的`/api/agent/status`均实际HTTP200，`ready=false`，缺失同样两项。详情见status.json；只记录存在性、缺失名称和非秘密状态。
- 本轮运行现有回归：**53/53通过**；类型检查通过。gateway及协议测试使用可控夹具，覆盖已有工具映射、参数校验、预算、错误脱敏、断连和迟到回复取消；不能替代真实模型联调。产品未改动，因此未重建前端，也未重复旧资产摘要或性能长测。

## 已知未满足项

源码检查确认两个后续联调缺口，未冒充已通过：

1. `server/gateway.mjs`当前按HTTP状态粗分类（401认证、429限流、其余一般请求失败），没有按供应商错误体区分额度不足、模型不可用和参数错误，尚未满足M3.1要求的完整错误分类。
2. 当前适配器返回工具/最终回复，但没有保留上游request ID与usage，真实调用可关联记录仍需在联调时补齐。

本轮按“缺配置”分支停止真实请求；未在没有上游证据时重写适配器或伪造兼容结论。

| 验收项 | 本轮实际状态 |
|---|---|
| 基础请求：认证、模型权限、响应格式 | 未执行：缺配置 |
| device.get_details真实工具循环 | 未执行：缺配置 |
| A–D四项真实业务任务 | 未执行：不引用M3的Demo成绩 |
| 两种自然语言改写 | 未执行 |
| 真实网络任务取消 | 未验证；只有已有夹具回归通过 |
| 两张真实联调网页截图 | 未生成；没有真实任务可展示，不复用旧Demo图 |
| 实际供应商 / 模型 | 适配目标OpenAI；实际模型未配置 |
| 真实任务ID、工具调用ID、request ID、用量 | 无真实调用；用量未知 |

**等待本地配置，真实联调未完成。** 数据仍为SIMULATED；不扩功能、不自动降级Demo，停止本轮工作。
