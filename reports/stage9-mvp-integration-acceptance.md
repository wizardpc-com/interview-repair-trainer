# Stage 9 MVP 集成验收

> 历史证据快照：本文记录 Stage 9 当时的分支、自动测试、真实 Qwen Golden 和 Chrome smoke，包括当时要求停止合并的 False Gate。后续提交已经针对该 ASR noisy transcript 边界增加修正和自动回归；Stage 10 功能提交 `5a61025` 又增加了三题 Session 与确定性 Report，但该轮没有重新运行真实 Qwen 或 Chrome 语音人工验收。本文不代表当前最终版本状态，也不能与 Stage 10 自动验证拼接成最终三题 Voice E2E 结论。

- 日期：2026-08-30
- 分支：`integrate/stage9-local`
- 基线：`01516da217977b90bbe688b1845bf70dace7ba9b`
- 结论：自动测试与 Golden 路径通过；真实 Chrome 正常语音虽有识别错字，但保留了明确的选择理由和验证方法，产品仍错误触发 Hard Gate。命中本轮停止条件，不建议合并或推送 `main`。

## 自动验证

- `npm test`：22 个测试文件通过，1 个跳过；205 个测试通过，3 个跳过。
- `npm run build`：通过。
- `git diff --check`：通过。
- R01–R06：6/6 通过。
- S01–S06：6/6 通过；S06 覆盖模型试图改写 frozen QuestionPlan 时 strict schema 拒绝、一次重试后 fail-open，并保持原 plan。

## Qwen Golden

- G01–G20 首轮 Final Gate：20/20。
- P0 False Gate：0/18，达标。
- P1 Product Gate Recall：30/30（100%），达标。
- P1 IssueType：28/30（93.3%）；G14、G20 的 issue type 有波动，但最终 Gate 均正确。
- 首次 structured output JSON/Zod 有效：20/20；全部 68 次无重试、无 schema/provider 失败。
- G07 首轮 evaluator 仍误报 ownership issue，但 Ownership Guard 正确放行；稳定性 3/3 无 False Gate。

## Chrome smoke

- A：文本回退下，正常完整回答可直接完成且不 Gate，transcript 在输入框、实时转写和完成页一致。前两次真实语音由测试者刻意乱说，触发 Hard Gate 属于预期行为，不作为失败证据。随后正常朗读指定答案，稳定 transcript 为“我选择inc8电话因为设备内存和石延预算很紧我用固定的验证检查进度并在设备上测量延迟”。虽然 `INT8 量化`、`时延`、`精度` 有识别错字，但回答仍明确包含“选择 X、因为资源约束、验证结果、测量延迟”，且没有重复追加；产品却以“只介绍方法是什么、没有说明为什么”为由触发 Hard Gate。A 失败，分类为手工正常回答 False Gate / evaluator semantic error，STT 错字是影响因素但不足以支持该 Gate 理由。
- B：明显答偏触发近全屏 Hard Gate；原回答和问题保留；进入独立重新回答后提交修复回答，结果为“修复成功”。
- C：明显答偏触发 Hard Gate；重答仍未补齐原缺口，结果为“仍未解决”。
- D：Hard Gate 后选择继续回答，状态恢复 ANSWERING 并重新发起麦克风权限请求；原 transcript 完整恢复；同一答偏答案结束后直接完成，未出现第二次 Gate。

页面可见文本未包含 Hidden Target、`primaryTarget`、`requiredEvidence`、`optionalEvidence`、`confidence`、`triggeringCriterion` 或内部 issue enum。

## 合并判断

Golden P0 仍为 0/18，且没有发现 same-target 破坏、重复 Gate 或状态机错误。自动测试覆盖麦克风流释放、迟到权限结果、stale evaluator、provider/invalid fail-open、frozen QuestionPlan 和一次 Gate 上限；Chrome 中也确认权限悬挂不阻塞文本回退、授权后能够启动与停止麦克风。但是手工正常语音 smoke 出现 1 次 False Gate，违反本轮产品安全停止条件。

本轮明确要求发现 P0 False Gate 时停止。当前失败不是状态机错误：Gate 后语音停止、transcript 冻结、原回答保留均正常；问题是语义判断忽略了 transcript 中已经存在的选择理由。应先对该真实 transcript 做 evaluator 边界回归并诊断原始结构化输出，随后再复测。此前不推送或合并 `main`。
