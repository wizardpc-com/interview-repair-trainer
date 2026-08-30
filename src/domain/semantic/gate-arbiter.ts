import type { QuestionPlan } from "../interview/contracts";
import type {
  InterviewRuntimeState,
  QuestionRuntimeState,
} from "../interview/state";
import type {
  GateCriterion,
  SemanticCheckResult,
} from "./contracts";

export type GateArbiterDecision = "GATE" | "CONTINUE";

export type SurfaceQuestionSupport =
  | "SUPPORTED"
  | "NOT_SUPPORTED"
  | "UNCERTAIN";

export type { GateCriterion } from "./contracts";

export type GateArbiterInput = Readonly<{
  questionPlan: QuestionPlan;
  interviewState: InterviewRuntimeState;
  questionState: QuestionRuntimeState;
  semanticResult: SemanticCheckResult | null;
  /** Program-owned interpretation of the uncalibrated confidence signal. */
  meetsConfidenceThreshold: boolean;
  surfaceQuestionSupport: SurfaceQuestionSupport;
  hasSufficientAnswerContext: boolean;
  issueIsPersistent: boolean;
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

export function arbitrateGate(input: GateArbiterInput): GateArbiterDecision {
  const result = input.semanticResult;

  if (result === null || result.decision !== "ISSUE_DETECTED") {
    return "CONTINUE";
  }

  if (
    result.gateability !== "GATE_ELIGIBLE" ||
    !input.meetsConfidenceThreshold
  ) {
    return "CONTINUE";
  }

  if (!input.questionPlan.allowedGateIssueTypes.includes(result.issueType)) {
    return "CONTINUE";
  }

  if (
    !criterionBelongsToQuestion(
      input.questionPlan,
      result.triggeringCriterion,
    ) ||
    input.surfaceQuestionSupport !== "SUPPORTED"
  ) {
    return "CONTINUE";
  }

  if (result.answerBoundary !== "NONE") {
    return "CONTINUE";
  }

  if (!input.hasSufficientAnswerContext || !input.issueIsPersistent) {
    return "CONTINUE";
  }

  if (
    result.questionId !== input.questionPlan.id ||
    input.questionState.questionId !== input.questionPlan.id ||
    result.checkpointVersion !== input.questionState.checkpointVersion
  ) {
    return "CONTINUE";
  }

  if (
    input.interviewState.state !== "IN_PROGRESS" ||
    input.interviewState.activeQuestionId !== input.questionPlan.id ||
    input.questionState.state !== "ANSWERING"
  ) {
    return "CONTINUE";
  }

  if (input.questionState.gateCount !== 0) {
    return "CONTINUE";
  }

  return "GATE";
}
