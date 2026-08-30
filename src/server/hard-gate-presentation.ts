import type { QuestionPlan } from "../domain/interview/contracts";
import type { SemanticCheckResult } from "../domain/semantic/contracts";

export type HardGatePresentation = Readonly<{
  whyPaused: string;
  repairCue: string;
}>;

export function createHardGatePresentation(
  questionPlan: QuestionPlan,
  result: Extract<SemanticCheckResult, { decision: "ISSUE_DETECTED" }>,
): HardGatePresentation {
  if (result.issueType === "OWNERSHIP_AMBIGUOUS") {
    return Object.freeze({
      whyPaused:
        "你一直在描述团队做了什么，但还没有说明你本人完成了什么。",
      repairCue: "先说清你本人负责的一项具体行动或决策。",
    });
  }

  if (result.issueType === "VAGUE_WITHOUT_EVIDENCE") {
    if (
      questionPlan.primaryTarget.id === "technical-reasoning" ||
      result.triggeringCriterion.id === "decision-rationale"
    ) {
      return Object.freeze({
        whyPaused:
          "你一直在介绍这个方法是什么，但当前问题问的是为什么选择它。",
        repairCue: "先说明真实项目约束，再解释你的选择理由。",
      });
    }

    if (
      questionPlan.primaryTarget.id === "evidence-based-result" ||
      result.triggeringCriterion.id === "observed-result" ||
      result.triggeringCriterion.id === "validation-method"
    ) {
      return Object.freeze({
        whyPaused:
          "当前问题明确要求结果或验证方式，但回答只给出了笼统结论。",
        repairCue:
          "先给出实际观察或明确测量边界，再说明你如何验证。",
      });
    }

    return Object.freeze({
      whyPaused: "当前回答缺少问题明确要求的具体证据。",
      repairCue: "补充一个当前问题明确要求的具体事实或理由。",
    });
  }

  if (
    questionPlan.primaryTarget.id === "technical-reasoning" ||
    result.triggeringCriterion.id === "decision-rationale"
  ) {
    return Object.freeze({
      whyPaused:
        "你一直在介绍这个方法是什么，但当前问题问的是为什么选择它。",
      repairCue: "先说明真实项目约束，再解释你的选择理由。",
    });
  }

  return Object.freeze({
    whyPaused: "当前回答没有回应问题核心。",
    repairCue: "先直接回答当前问题，再补充必要背景。",
  });
}
