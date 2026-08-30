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
  transcriptSnapshot: string;
  semanticResult: SemanticCheckResult | null;
  /** Program-owned interpretation of the uncalibrated confidence signal. */
  meetsConfidenceThreshold: boolean;
  surfaceQuestionSupport: SurfaceQuestionSupport;
  hasSufficientAnswerContext: boolean;
  issueIsPersistent: boolean;
}>;

const PERSONAL_CONTRIBUTION_PLAN_PATTERN =
  /personal(?:ly)?(?: owned| contributed| contribution)?|individual contribution|personal ownership|(?:candidate|your)(?:'s|’s)? own contribution|separate[^.]*own contribution[^.]*team|你(?:本人|个人)|由你(?:本人)?|个人(?:贡献|职责|行动)|本人(?:完成|负责)|亲自/iu;

const CHINESE_OWNERSHIP_PATTERN =
  /我(?:本人|个人)?(?:确实|实际|主要|具体|独立|直接|亲自|单独)?(?:负责(?:了)?|承担(?:了)?|主导(?:了)?|完成(?:了)?|实现(?:了)?|设计(?:了)?|开发(?:了)?|分析(?:了)?|搭建(?:了)?|编写(?:了)?|处理(?:了)?|维护(?:了)?)([^，。；！？,;!?]+)/gu;

const ENGLISH_OWNERSHIP_PATTERN =
  /\bI\s+(?:(?:personally|mainly|primarily|directly|individually)\s+)?(?:(?:am|was)\s+)?(?:(?:personally|mainly|primarily|directly|individually)\s+)?(?:responsible\s+for|owned|handled|led|completed|implemented|designed|developed|built|analyzed|created|wrote|maintained)\s+([^.!?;,]+)/giu;

const GENERIC_CHINESE_OBJECT_PATTERN =
  /^(?:(?:这个|那个|这些|那些|相关|整个|整体(?:上)?|全部|所有|一切|基本所有|大部分)(?:的|上的)?)?(?:项目|事情|工作|任务|事项|东西|方面|部分|内容)(?:本身)?(?:基本)?(?:都|全都)?$/u;

const GENERIC_ENGLISH_OBJECT_PATTERN =
  /^(?:everything|all(?:\s+of)?(?:\s+the)?\s+(?:work|tasks?|things?)|(?:the\s+)?(?:entire|whole)\s+project|overall(?:\s+(?:work|responsibility|project))?|it|that|this)$/iu;

function isPersonalContributionPlan(plan: QuestionPlan): boolean {
  const planSemantics = [
    plan.surfaceQuestion,
    plan.primaryTarget.description,
    ...plan.requiredEvidence.map(({ description }) => description),
  ].join(" ");

  return PERSONAL_CONTRIBUTION_PLAN_PATTERN.test(planSemantics);
}

function isNamedResponsibilityObject(rawObject: string): boolean {
  const responsibilityObject = rawObject
    .trim()
    .replace(/^(?:的)?(?:是)?\s*/u, "")
    .replace(/\s+/gu, " ");

  if (
    responsibilityObject.length === 0 ||
    /^(?:不|没|并非|并未|不是|不了)/u.test(responsibilityObject) ||
    /^(?:not|no)\b/iu.test(responsibilityObject) ||
    !/[\p{L}\p{N}]/u.test(responsibilityObject)
  ) {
    return false;
  }

  return (
    !GENERIC_CHINESE_OBJECT_PATTERN.test(responsibilityObject) &&
    !GENERIC_ENGLISH_OBJECT_PATTERN.test(responsibilityObject)
  );
}

function hasExplicitPersonalResponsibility(transcript: string): boolean {
  for (const match of transcript.matchAll(CHINESE_OWNERSHIP_PATTERN)) {
    const precedingText = transcript.slice(
      Math.max(0, (match.index ?? 0) - 4),
      match.index,
    );
    if (
      !/(?:不(?:是)?|并非|并未|没有|没)\s*$/u.test(precedingText) &&
      isNamedResponsibilityObject(match[1] ?? "")
    ) {
      return true;
    }
  }

  return Array.from(transcript.matchAll(ENGLISH_OWNERSHIP_PATTERN)).some(
    (match) => isNamedResponsibilityObject(match[1] ?? ""),
  );
}

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

  if (
    result.issueType === "OWNERSHIP_AMBIGUOUS" &&
    isPersonalContributionPlan(input.questionPlan) &&
    hasExplicitPersonalResponsibility(input.transcriptSnapshot)
  ) {
    return "CONTINUE";
  }

  return "GATE";
}
