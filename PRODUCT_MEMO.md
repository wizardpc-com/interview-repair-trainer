# Product Memo：Interview Repair Trainer

- 日期：2026-08-30
- 当前范围：理工科项目 / 科研经历深挖，三题完整训练，每题最多一次 Hard Gate 和一次 Repair

## 1. 目标用户与核心痛点

目标用户是正在准备大厂实习面试或保研复试的理工科本科生。他们往往能复述项目，但难以及时发现回答是否真正解释了选择理由、给出了题面要求的证据，或讲清了自己的贡献。真人学长和专业人士难以高频陪练，通用聊天模型又常在回答结束后一次性给出宽泛建议，缺少临场被追问、立即修复的训练感。

本项目的产品假设是：比“多生成几道题”更有价值的闭环，是在回答仍在发生时，以很低的误打断率识别一个明确缺口，冻结现场，让用户针对同一目标马上重答，并看到修复是否成立。

项目进行了 7 次探索性访谈，受访者包括有面试经历的学生、学长学姐和已经工作的亲友。第 7 题要求受访者设想正式面试前只剩 30 分钟且只能选择一种训练：4 人选择连续追问、质疑或打断的高压模拟，2 人选择再次深挖项目和简历，1 人选择练习把会的内容快速、清楚表达，0 人选择补专业知识或高频题。

这些结果只用于发现具体场景、暴露反例和修正产品假设，不能证明市场需求。样本只有 7 人，均来自身边可触达人群；第 6 题已经介绍过产品，第 7 题的选项也受项目方向影响并具有引导性。因此 4/7 不是市场需求比例或统计结论。

一位已经工作的受访者还提醒，真人面试官的性格、经验、侧重点和即时判断差异很大，AI 很难完整复刻某一个真人。这一反馈推动产品定位从 Simulation 转向 Drill：不承诺复刻下一位面试官，而是提供稳定、可重复的训练条件。这是对访谈反馈的归纳，不是受访者直接引语。

## 2. 产品设计与关键取舍

核心体验从用户的一段项目或科研经历开始。Qwen 在一次请求中从受控 Scenario Pack 选择 3 个不同的 question family，并生成覆盖不同深挖方向的 Interview Plan；个人贡献、技术或方法选择及其理由、结果与验证是优先方向。三个 QuestionPlan 在首题前全部冻结；每题分别包含一个 primary target、题面明确支持的 required evidence 和不会触发 Gate 的 optional evidence。这里的 Hidden Target 是本轮训练开始前预先承诺并冻结的训练目标，不是对真人面试官心理或私人意图的推断。前端一次只看到当前自然语言问题，不看到隐藏标准。

用户可直接语音作答；浏览器实时显示稳定转写和真实麦克风音量，语音不可用时随时切换文本。稳定 transcript 形成带版本号的 checkpoint。Semantic Evaluator 只评价跨专业的回答结构，应用层 Gate Arbiter 再结合题面支持、上下文长度、问题持续性、checkpoint 新鲜度、当前状态和 Gate 次数决定是否暂停。

评价范围限于 question alignment、题面明确要求的 evidence sufficiency、personal ownership 和 repair / recovery，不声称验证所有 science / engineering 专业事实。当题目和冻结的 evidence 约束允许时，明确说明没有进行可靠测量可以是合法边界，不能只因没有数字就自动判为 `VAGUE_WITHOUT_EVIDENCE`。

产品只保留三种可修复缺口：没有回答当前问题、题面明确要求证据但回答仍模糊、个人贡献不清。Hard Gate 展示原问题、原回答、一个确定性的缺口说明和一个修复动作。用户可以不同意并继续，也可以开始独立重答；重答仍使用同一冻结目标，终点只有“修复成功”或“仍未解决”。若回答已经覆盖核心但后续开始明显跑题，系统给出一次非 Gate 收束提醒，不消耗修复机会。

第三题结束后，系统只从真实 runtime 记录生成确定性报告，包括完成、首次直接通过（本题第一次回答完成时未触发 Hard Gate）、Hard Gate、Repair、Repair Successful 和 Unresolved 计数，以及逐题回答与修复记录。“首次直接通过”不是回答质量、专业正确率或面试能力评分。

刻意不做的内容包括：通用知识正确性判定、人格评价、分数和排名、多模型自动路由、多轮反复 Gate、账号、数据库、长期画像、音频保存和复杂题库。这些功能会扩大误判面或基础设施范围，却不是验证核心修复闭环所必需。

## 3. 版本迭代记录

| 版本 | 核心问题 | 最终变化 | 验证依据 |
| --- | --- | --- | --- |
| Stage 1–5 | 隐藏标准可能泄漏或被模型改写 | 建立四层边界、Zod contracts、确定性 Gate Arbiter、单 Qwen 接口和服务端冻结 Session | domain、scenario、LLM、session 单元测试 |
| Stage 6–7 | 需要先形成可用作答体验，同时不让语音污染 domain | 完成 text-first runtime，再将 Browser STT 作为输入适配器接入；保留文本回退和资源清理 | runtime、API、STT 与 UI 测试 |
| Stage 8 | 模型建议不能直接触发界面中断 | 加入版本化 checkpoint、single-flight、stale 丢弃、fail-open 和应用层 Hard Gate | semantic fixtures、Qwen Golden、UI 回归 |
| Stage 9 | 暂停后需要形成真实训练闭环 | 冻结原回答，对同一 QuestionPlan 重新回答，只复核原缺口 | repair arbiter、同目标与迟到结果测试 |
| Stage 8–9 后续修正 | 手工语音验收出现 ASR 错字下的误拦截；完整回答也可能继续发散 | 增加 ASR 噪声容错、收紧实时 interruption，并加入一次非 Gate 收束提醒 | `reports/stage9-mvp-integration-acceptance.md`、后续自动回归 |
| Stage 10 | 单题完成后缺少完整训练轮次和可回放结果 | 一次冻结三题，复用多题 runtime 连续推进，并从真实记录生成无评分报告 | plan/session/runtime/report/UI 自动测试 |

历史 Stage 9 验收报告保留了失败样本，没有把一次自动测试通过改写成产品通过。当前防线仍是 fail-open、实时 issue 需在更新 checkpoint 上持续出现、单题最多一次 Gate，以及用户可以 override。

## 4. 验证与证据边界

### 历史核心 Runtime 验证

核心 Gate / Repair Runtime 在前序阶段使用预先冻结的人工 Golden 测试集并调用真实 Qwen，得到以下产品层结果：

- P0 Product False Gate：0 / 18；
- P1 clear Gate：30 / 30；
- Structured Output：56 / 56 first-pass valid。

这些数值只描述预先冻结人工 Golden 测试集上的产品层结果，不是模型准确率、产品准确率、总体用户误杀率、商业准确率或面试成功率。前序阶段也执行过 Chrome 真实语音测试，并将观察到的 ASR noisy transcript False Gate 纳入边界修正和自动回归。

### Stage 10 三题扩展验证

Stage 10 的功能提交为 `5a61025`（`feat: complete three-question training round`）。该轮完成了一次生成并冻结三题、逐题推进、Repair 结果过渡和确定性报告，并得到：

- `npm test`：222 passed，4 skipped；23 个测试文件通过，1 个跳过；
- `npm run build`：PASS，包含 TypeScript production check；
- `git diff --check`：PASS。

该轮三题 Session / Report 扩展没有重新连接真实 Qwen 服务，也没有重新执行 Chrome 真实语音人工验收。历史真实模型和浏览器证据不能与 Stage 10 自动验证拼接成“最终三题版本已完整通过真实 Qwen + Chrome Voice E2E”。现有证据也尚未证明 Hard Gate 长期优于事后反馈、Repair 会形成长期迁移，或产品能提高 Offer / 保研成功率。

## 5. 如果再有一周

第一优先级是增加 PDF 简历上传与解析：从 PDF 自动抽取项目或科研经历，让用户选择需要训练的经历，再生成 3 个 QuestionPlan。这只是输入体验升级，不改变核心 Repair Runtime。

第二优先级是扩大真实用户测试，重点记录 False Gate、应 Gate 未 Gate、用户是否愿意立即重答、第二次回答是否真正改善目标覆盖、三题训练长度是否合理，以及 Hard Gate 是否优于普通事后反馈。第三优先级是继续改进语音输入鲁棒性，同时保持 Browser STT 只是文本输入适配器，不把产品扩成 full-duplex voice 平台。

## 6. AI 工具与来源说明

- 产品运行时：Qwen 通过同一 provider-independent 接口生成 QuestionPlan、检查语义 checkpoint；结果经过 Zod 校验，应用状态由确定性代码控制。
- 开发过程：Codex 用于辅助需求拆解、架构与代码实现、测试生成、回归诊断和文档更新；关键结论以仓库源码、自动测试、Golden 原始输出和手工验收为准。
- 浏览器输入：Chrome Web Speech API 提供语音识别，Web Audio API 只提供实时音量采样，不参与语义决策。
- 第三方来源：当前没有复制或实质改编第三方应用源码；npm 依赖记录在 lockfile，后续若复用源码必须先更新 `THIRD_PARTY_NOTICES.md`。

## 7. 挑战交付状态

仓库已经包含可运行代码、README、Product Memo、架构与验证材料，并保留了细粒度 commit history。提交前仍需在外部完成三项检查：确认 GitHub 仓库对未登录用户公开；提供可直接访问的产品 URL；录制不超过 3 分钟、前 30 秒展示核心修复时刻的 Demo 视频。
