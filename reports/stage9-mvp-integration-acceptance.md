# Stage 9 MVP 集成验收

- 日期：2026-08-30
- 分支：`integrate/stage9-local`
- 基线：`01516da217977b90bbe688b1845bf70dace7ba9b`
- 结论：自动测试与核心产品路径通过；真实 Chrome 麦克风已连接，但两次中文语音均被 STT 严重误识别并触发 Hard Gate，暂不建议合并或推送 `main`。

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

- A：文本回退下，正常完整回答可直接完成且不 Gate，transcript 在输入框、实时转写和完成页一致。真实语音失败：第一次稳定 transcript 为“你好眼睛到吗我选择的是针对我们继续方案最有用的选择进入方案我想”；第二次按指定短句朗读后稳定 transcript 为“那么好的我还有说我选的是Mate 8在我看来”。两次均无重复追加，但内容严重丢失/误识别，结束后都触发 Hard Gate。
- B：明显答偏触发近全屏 Hard Gate；原回答和问题保留；进入独立重新回答后提交修复回答，结果为“修复成功”。
- C：明显答偏触发 Hard Gate；重答仍未补齐原缺口，结果为“仍未解决”。
- D：Hard Gate 后选择继续回答，状态恢复 ANSWERING 并重新发起麦克风权限请求；原 transcript 完整恢复；同一答偏答案结束后直接完成，未出现第二次 Gate。

页面可见文本未包含 Hidden Target、`primaryTarget`、`requiredEvidence`、`optionalEvidence`、`confidence`、`triggeringCriterion` 或内部 issue enum。

## 合并判断

没有发现 Golden P0 False Gate、same-target 破坏、重复 Gate 或状态机错误。自动测试覆盖麦克风流释放、迟到权限结果、stale evaluator、provider/invalid fail-open、frozen QuestionPlan 和一次 Gate 上限；Chrome 中也确认权限悬挂不阻塞文本回退、授权后能够启动与停止麦克风。

本轮明确要求真实 Chrome 语音回答稳定工作；当前两次真实 transcript 均未忠实保留回答内容，并由错误 transcript 引发产品层 Hard Gate。失败位于浏览器 STT/音频输入路径，不归因于 Semantic Evaluator 或 Gate Arbiter，但核心语音闭环尚未通过。因此不推送或合并 `main`。
