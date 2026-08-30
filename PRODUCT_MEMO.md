# Product Memo：Interview Repair Trainer

- 日期：2026-08-30
- 当前范围：理工科项目 / 科研经历深挖，三题完整训练，每题最多一次 Hard Gate 和一次 Repair

## 1. 目标用户与核心痛点

目标用户是正在准备大厂实习面试或保研复试的理工科本科生。他们往往能复述项目，但难以及时发现回答是否真正解释了选择理由、给出了题面要求的证据，或讲清了自己的贡献。真人学长和专业人士难以高频陪练，通用聊天模型又常在回答结束后一次性给出宽泛建议，缺少临场被追问、立即修复的训练感。

本项目的产品假设是：比“多生成几道题”更有价值的闭环，是在回答仍在发生时，以很低的误打断率识别一个明确缺口，冻结现场，让用户针对同一目标马上重答，并看到修复是否成立。

当前用户需求判断主要来自挑战背景、产品推演和开发验收，尚未完成独立的真实用户访谈。这是证据边界，不把内部测试当成用户验证。

## 2. 产品设计与关键取舍

核心体验从用户的一段项目或科研经历开始。Qwen 在一次请求中从受控 Scenario Pack 选择三类不重复的深挖问题，并生成完整 Interview Plan。三个 QuestionPlan 在首题前全部冻结；每题分别包含一个 primary target、题面明确支持的 required evidence 和不会触发 Gate 的 optional evidence。前端一次只看到当前自然语言问题，不看到隐藏标准。

用户可直接语音作答；浏览器实时显示稳定转写和真实麦克风音量，语音不可用时随时切换文本。稳定 transcript 形成带版本号的 checkpoint。Semantic Evaluator 只评价跨专业的回答结构，应用层 Gate Arbiter 再结合题面支持、上下文长度、问题持续性、checkpoint 新鲜度、当前状态和 Gate 次数决定是否暂停。

产品只保留三种可修复缺口：没有回答当前问题、题面明确要求证据但回答仍模糊、个人贡献不清。Hard Gate 展示原问题、原回答、一个确定性的缺口说明和一个修复动作。用户可以不同意并继续，也可以开始独立重答；重答仍使用同一冻结目标，终点只有“修复成功”或“仍未解决”。若回答已经覆盖核心但后续开始明显跑题，系统给出一次非 Gate 收束提醒，不消耗修复机会。

第三题结束后，系统只从真实 runtime 记录生成确定性报告，包括完成、首次直接通过、Hard Gate、Repair、Repair Successful 和 Unresolved 计数，以及逐题回答与修复记录。

刻意不做的内容包括：通用知识正确性判定、人格评价、分数和排名、多模型自动路由、多轮反复 Gate、账号、数据库、长期画像、音频保存和复杂题库。这些功能会扩大误判面或基础设施范围，却不是验证核心修复闭环所必需。

## 3. 版本迭代记录

| 版本 | 核心问题 | 最终变化 | 验证依据 |
| --- | --- | --- | --- |
| Stage 1–5 | 隐藏标准可能泄漏或被模型改写 | 建立四层边界、Zod contracts、确定性 Gate Arbiter、单 Qwen 接口和服务端冻结 Session | domain、scenario、LLM、session 单元测试 |
| Stage 6–7 | 需要先形成可用作答体验，同时不让语音污染 domain | 完成 text-first runtime，再将 Browser STT 作为输入适配器接入；保留文本回退和资源清理 | runtime、API、STT 与 UI 测试 |
| Stage 8 | 模型建议不能直接触发界面中断 | 加入版本化 checkpoint、single-flight、stale 丢弃、fail-open 和应用层 Hard Gate | semantic fixtures、Qwen Golden、UI 回归 |
| Stage 9 | 暂停后需要形成真实训练闭环 | 冻结原回答，对同一 QuestionPlan 重新回答，只复核原缺口 | repair arbiter、同目标与迟到结果测试 |
| 当前版本 | 手工语音验收出现 ASR 错字下的误拦截；完整回答也可能继续发散 | 增加 ASR 噪声容错、收紧实时 interruption，并加入一次非 Gate 收束提醒 | `reports/stage9-mvp-integration-acceptance.md`、后续自动回归 |
| Stage 10 | 单题完成后缺少完整训练轮次和可回放结果 | 一次冻结三题，复用多题 runtime 连续推进，并从真实记录生成无评分报告 | plan/session/runtime/report/UI 自动测试 |

历史 Stage 9 验收报告保留了失败样本，没有把一次自动测试通过改写成产品通过。当前防线仍是 fail-open、实时 issue 需在更新 checkpoint 上持续出现、单题最多一次 Gate，以及用户可以 override。

## 4. 如果再有一周

第一优先级是邀请目标用户进行小规模完整三题任务测试，分别记录误拦截率、应拦未拦、Repair 是否让第二次回答更具体、三题长度是否合适，以及语音错字是否影响理解。只有这些结果证明完整轮次有训练价值后，才扩充场景和题型。

第二优先级是部署一个明确标注单实例、Session 不持久化的公开版本，并完成未登录可访问检查、密钥注入和 3 分钟 Demo。第三优先级才是根据用户证据改进报告呈现或新增场景；除非测试显示单模型成本或延迟已经成为主要问题，否则不引入数据库、多模型路由或账号系统。

## 5. AI 工具与来源说明

- 产品运行时：Qwen 通过同一 provider-independent 接口生成 QuestionPlan、检查语义 checkpoint；结果经过 Zod 校验，应用状态由确定性代码控制。
- 开发过程：Codex 用于辅助需求拆解、架构与代码实现、测试生成、回归诊断和文档更新；关键结论以仓库源码、自动测试、Golden 原始输出和手工验收为准。
- 浏览器输入：Chrome Web Speech API 提供语音识别，Web Audio API 只提供实时音量采样，不参与语义决策。
- 第三方来源：当前没有复制或实质改编第三方应用源码；npm 依赖记录在 lockfile，后续若复用源码必须先更新 `THIRD_PARTY_NOTICES.md`。

## 6. 挑战交付状态

仓库已经包含可运行代码、README、Product Memo、架构与验证材料，并保留了细粒度 commit history。提交前仍需在外部完成三项检查：确认 GitHub 仓库对未登录用户公开；提供可直接访问的产品 URL；录制不超过 3 分钟、前 30 秒展示核心修复时刻的 Demo 视频。
