import type { QuestionPlan } from "../interview/contracts";
import type {
  InterviewRuntimeState,
  QuestionRuntimeState,
} from "../interview/state";
import type { RepairOutcome } from "../interview/runtime";
import type {
  GateCriterion,
  GateIssueType,
  SemanticCheckResult,
} from "./contracts";
import type { SurfaceQuestionSupport } from "./gate-arbiter";

export type RepairArbiterInput = Readonly<{
  questionPlan: QuestionPlan;
  interviewState: InterviewRuntimeState;
  questionState: QuestionRuntimeState;
  originalIssueType: GateIssueType;
  originalTriggeringCriterion: GateCriterion;
  honestNoMeasurementSatisfiesOriginalCriterion: boolean;
  semanticResult: SemanticCheckResult;
  meetsConfidenceThreshold: boolean;
  surfaceQuestionSupport: SurfaceQuestionSupport;
}>;

function criterionBelongsToQuestion(
  plan: QuestionPlan,
  criterion: GateCriterion,
): boolean {
  if (criterion.kind === "PRIMARY_TARGET") {
    return criterion.id === plan.primaryTarget.id;
  }

  return plan.requiredEvidence.some(({ id }) => id === criterion.id);
}

function sameCriterion(left: GateCriterion, right: GateCriterion): boolean {
  return left.kind === right.kind && left.id === right.id;
}

export function arbitrateRepair(input: RepairArbiterInput): RepairOutcome {
  const result = input.semanticResult;

  if (result.decision !== "ISSUE_DETECTED") {
    return "SUCCESSFUL";
  }

  if (
    result.questionId !== input.questionPlan.id ||
    input.questionState.questionId !== input.questionPlan.id ||
    result.checkpointVersion !== input.questionState.checkpointVersion ||
    input.interviewState.state !== "IN_PROGRESS" ||
    input.interviewState.activeQuestionId !== input.questionPlan.id ||
    input.questionState.state !== "REANSWER" ||
    input.questionState.gateCount !== 1
  ) {
    return "SUCCESSFUL";
  }

  if (
    result.gateability !== "GATE_ELIGIBLE" ||
    !input.meetsConfidenceThreshold ||
    !input.questionPlan.allowedGateIssueTypes.includes(result.issueType) ||
    input.surfaceQuestionSupport !== "SUPPORTED" ||
    !criterionBelongsToQuestion(
      input.questionPlan,
      result.triggeringCriterion,
    )
  ) {
    return "SUCCESSFUL";
  }

  if (result.answerBoundary === "UNCERTAIN") {
    return "SUCCESSFUL";
  }

  const repeatsOriginalIssue = result.issueType === input.originalIssueType;
  const repeatsOriginalCriterion = sameCriterion(
    result.triggeringCriterion,
    input.originalTriggeringCriterion,
  );
  if (!repeatsOriginalIssue && !repeatsOriginalCriterion) {
    return "SUCCESSFUL";
  }

  if (
    result.answerBoundary === "HONEST_NO_MEASUREMENT" &&
    result.issueType === "VAGUE_WITHOUT_EVIDENCE" &&
    input.originalTriggeringCriterion.kind === "REQUIRED_EVIDENCE" &&
    result.triggeringCriterion.kind === "REQUIRED_EVIDENCE" &&
    input.honestNoMeasurementSatisfiesOriginalCriterion
  ) {
    return "SUCCESSFUL";
  }

  return "UNRESOLVED";
}
