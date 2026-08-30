import type { QuestionPlan } from "../interview/contracts";
import type {
  InterviewRuntimeState,
  QuestionRuntimeState,
} from "../interview/state";
import type { SemanticCheckResult } from "./contracts";

export type GateArbiterDecision = "GATE" | "CONTINUE";

export type EvaluatorGateability = "GATE_ELIGIBLE" | "UNCERTAIN";

export type SurfaceQuestionSupport =
  | "SUPPORTED"
  | "NOT_SUPPORTED"
  | "UNCERTAIN";

export type GateCriterion =
  | Readonly<{
      kind: "PRIMARY_TARGET";
      id: string;
    }>
  | Readonly<{
      kind: "REQUIRED_EVIDENCE";
      id: string;
    }>;

export type GateArbiterInput = Readonly<{
  questionPlan: QuestionPlan;
  interviewState: InterviewRuntimeState;
  questionState: QuestionRuntimeState;
  semanticResult: SemanticCheckResult | null;
  /** An uncalibrated upstream signal. It is necessary but never sufficient to gate. */
  evaluatorGateability: EvaluatorGateability;
  triggeringCriterion: GateCriterion | null;
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

  if (input.evaluatorGateability !== "GATE_ELIGIBLE") {
    return "CONTINUE";
  }

  if (!input.questionPlan.allowedGateIssueTypes.includes(result.issueType)) {
    return "CONTINUE";
  }

  if (
    input.triggeringCriterion === null ||
    !criterionBelongsToQuestion(input.questionPlan, input.triggeringCriterion) ||
    input.surfaceQuestionSupport !== "SUPPORTED"
  ) {
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
