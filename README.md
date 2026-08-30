# Interview Repair Trainer

Interview Repair Trainer 是一个面向理工科本科生的项目与科研经历面试训练器。它不追求生成更多通用面试题，而是在一次回答中识别“没有回答问题、缺少题面明确要求的证据、个人贡献不清”等结构性缺口，暂停回答并让用户立即修复、重新作答。

## 核心体验

```text
输入项目或科研经历
  -> Qwen 一次生成并冻结三道互不重复的服务端 QuestionPlan
  -> 逐题通过浏览器语音或文本回答
  -> 稳定 transcript 形成版本化 checkpoint
  -> Semantic Evaluator 给出结构化建议
  -> 应用层 Gate Arbiter 决定继续、收束提醒或 Hard Gate
  -> 用户继续原回答，或针对同一训练目标 Repair + Re-answer
  -> 完成三题后展示确定性训练报告
```

Hidden Target 是本次训练预先承诺的目标，不是对真实面试官心理的推断。完整 QuestionPlan 只保存在服务端；LLM 输出必须经过 Zod 校验，且不能直接控制界面或状态跳转。

## 当前实现

完整一轮训练闭环已经完成 Stage 1–10，并包含实时收束提醒：

- 根据项目经历一次生成三道不重复的场景化深挖问题，并在首题开始前冻结全部 QuestionPlan；
- 使用 Chrome 优先的 Web Speech API 进行 `zh-CN` 实时转写，以 Web Audio 的真实采样驱动音量反馈；
- 语音不可用、权限被拒或识别失败时，保留完整的文本备用路径；
- 仅用稳定转写创建版本化 checkpoint，并丢弃迟到或过期的 evaluator 结果；
- 由确定性的 Gate Arbiter 决定是否触发 Hard Gate，单题最多一次；
- 对已经回答核心但开始明显跑题的内容给出一次非 Gate 收束提醒；
- Hard Gate 冻结原回答，允许用户不同意并继续，或针对同一冻结目标重新回答；
- 重新回答后只判断原缺口是否修复，不要求得到“完美答案”。
- 完成当前题后自动进入下一题；Repair 结果先经过简洁过渡页，不会瞬间消失；
- 第三题结束后从真实 runtime 记录生成题目级报告和六项计数，不调用 LLM 生成总评或分数。

当前没有账号、数据库、跨进程持久化、多模型路由、通用事实判定、综合评分或排名。Session 仅保存在单个 Node.js 进程内，TTL 为一小时，进程重启后丢失。浏览器 ASR 错字和模型语义误判仍可能影响体验，因此产品采用 fail-open、一次 Gate 上限和用户 override 来降低误打断风险。

## 架构边界

| 层 | 作用 | 当前目录或状态 |
| --- | --- | --- |
| Persona | 面试官表达风格 | 独立可移植层；Phase 1 尚未加入单独 Persona 资产 |
| Core Interview Protocol | 可复用的面试行为规则 | `protocols/core/` |
| Scenario Pack | 题型、训练目标与证据约束 | `protocols/scenarios/` |
| Runtime Engine | 状态机、checkpoint、语义决策与 repair | `src/domain/`、`src/server/`、`src/services/` |

`protocols/exports/` 仅用于未来生成的协议导出产物。Domain 不依赖 LLM、STT、UI 或 provider SDK；Qwen 和浏览器语音均位于适配器边界。

## 本地运行

### 环境要求

- 推荐 Node.js 24；`package.json` 的最低版本为 Node.js 20.9；
- npm；
- 可用的 Qwen API key。创建训练时必须实时生成 QuestionPlan，因此未配置 key 时只能运行测试和构建，不能完成真实训练；
- 如需语音输入，使用支持 Web Speech API 的 Chrome，并允许 `localhost` 使用麦克风。

安装依赖并创建本地环境文件：

```bash
npm install
```

将 `.env.example` 复制为被 Git 忽略的 `.env.local`，至少填写：

```dotenv
QWEN_API_KEY=your-key
QWEN_MODEL=qwen3.8-flash
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
```

启动开发服务器：

```bash
npm run dev
```

打开 `http://localhost:3000`。健康检查地址为 `http://localhost:3000/api/healthz`。

生产构建使用 Next.js standalone 输出：

```bash
npm run build
npm start
```

也可以使用仓库中的 `Dockerfile` 构建 Node.js 24 容器；运行容器时仍需从外部注入 Qwen 环境变量，不要把密钥写入镜像或提交到 Git。

## 验证

默认验证不访问真实 Qwen API：

```bash
npm test
npm run build
```

真实 Qwen Golden 验证是显式、可能产生 API 费用的独立流程。配置 `.env.local` 后，可按需运行 `package.json` 中的 `test:golden:*:qwen` 脚本；历史原始输出与报告保存在 `reports/golden/`。

## 技术栈

- Next.js 16.3.3（App Router、Route Handlers、standalone output）
- React 19.2.8、TypeScript 7.0.2、Tailwind CSS 4.3.3
- Zod 4.1 用于 API、QuestionPlan 与 SemanticCheckResult 边界校验
- Vitest 4.1.11
- Qwen OpenAI-compatible Chat Completions API（原生 `fetch`，单模型）
- Browser Web Speech API 与 Web Audio API
- Docker / Node.js 24

## 项目资料与交付状态

- [Product Memo](PRODUCT_MEMO.md)：目标用户、产品取舍、迭代记录、下一步和 AI 工具使用说明；
- [架构说明](docs/ARCHITECTURE.md)：完整状态机、服务边界与 fail-open 约束；
- [实施计划](docs/IMPLEMENTATION_PLAN.md)：Stage 1–10 已完成，后续适配器与扩展仍延后；
- [Stage 9 集成验收快照](reports/stage9-mvp-integration-acceptance.md)：保留当时自动验证与手工语音误拦截证据；
- [第三方声明](THIRD_PARTY_NOTICES.md)：当前没有复制或实质改编第三方应用源码。

挑战提交仍需在仓库外补齐可直接访问的产品 URL 和 3 分钟内 Demo 视频，并在未登录窗口确认 GitHub 仓库为 public。仓库中没有部署配置，因此本 README 不声明一个尚未验证的线上地址。

## AI 与第三方使用

运行时使用同一个 Qwen 配置一次生成三题 Interview Plan，并逐题进行语义检查；开发过程中使用 Codex 辅助架构、实现、测试与文档核对。AI 输出不直接成为状态机决策，最终行为由 schema、确定性应用逻辑、自动测试和手工验收约束。训练报告完全由 runtime 数据聚合，不调用 LLM。依赖项见 `package.json` 与 `package-lock.json`，源码复用规则见 `THIRD_PARTY_NOTICES.md`。
