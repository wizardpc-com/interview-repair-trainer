import type { GoldenRunPhase } from "./qwen-semantic-run-plan";

type SemanticDecision = "CONTINUE" | "ISSUE_DETECTED" | "EVALUATOR_ERROR";
type ProductDecision = "CONTINUE" | "GATE";

export type ReleaseMetricObservation = Readonly<{
  phase: GoldenRunPhase;
  actualSemantic: SemanticDecision;
  actualIssueType: string | null;
  expectedIssueType: string | null;
  actualGate: ProductDecision;
}>;

export type StructuredOutputMetricObservation = Readonly<{
  phase: GoldenRunPhase;
  structuredOutputValidity: Readonly<{
    firstAttemptOutputCaptured: boolean;
    firstAttemptJsonValid: boolean;
    firstAttemptSchemaValid: boolean;
    acceptedOnFirstAttempt: boolean;
    validatedEventually: boolean;
  }>;
}>;

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) {
    throw new Error("Golden metrics require at least one observation");
  }
  return numerator / denominator;
}

export function summarizeProductReleaseMetrics(
  records: readonly ReleaseMetricObservation[],
) {
  const p0 = records.filter(({ phase }) => phase === "P0_STABILITY");
  const p1 = records.filter(({ phase }) => phase === "P1_STABILITY");
  const p0ProductFalseGates = p0.filter(
    ({ actualGate }) => actualGate === "GATE",
  ).length;
  const p0EvaluatorFalseIssues = p0.filter(
    ({ actualSemantic }) => actualSemantic === "ISSUE_DETECTED",
  ).length;
  const p1ProductGates = p1.filter(
    ({ actualGate }) => actualGate === "GATE",
  ).length;
  const p1EvaluatorIssues = p1.filter(
    ({ actualSemantic }) => actualSemantic === "ISSUE_DETECTED",
  ).length;
  const p1IssueTypesCorrect = p1.filter(
    ({ actualIssueType, expectedIssueType }) =>
      actualIssueType === expectedIssueType,
  ).length;

  return {
    p0: {
      observations: p0.length,
      productFalseGates: p0ProductFalseGates,
      productFalseGateRate: ratio(p0ProductFalseGates, p0.length),
      evaluatorFalseIssues: p0EvaluatorFalseIssues,
      evaluatorFalseIssueRate: ratio(p0EvaluatorFalseIssues, p0.length),
    },
    p1: {
      observations: p1.length,
      productGates: p1ProductGates,
      productGateRecall: ratio(p1ProductGates, p1.length),
      evaluatorIssues: p1EvaluatorIssues,
      evaluatorIssueRecall: ratio(p1EvaluatorIssues, p1.length),
      issueTypesCorrect: p1IssueTypesCorrect,
      issueTypeAccuracy: ratio(p1IssueTypesCorrect, p1.length),
    },
  } as const;
}

export function assessProductRelease(
  records: readonly ReleaseMetricObservation[],
  expectedP0Observations: number,
  expectedP1Observations: number,
) {
  const p0Observations = records.filter(
    ({ phase }) => phase === "P0_STABILITY",
  ).length;
  const p1Observations = records.filter(
    ({ phase }) => phase === "P1_STABILITY",
  ).length;
  if (
    p0Observations !== expectedP0Observations ||
    p1Observations !== expectedP1Observations
  ) {
    return null;
  }

  const metrics = summarizeProductReleaseMetrics(records);
  const p0Pass = metrics.p0.productFalseGates === 0;
  const p1Pass = metrics.p1.productGateRecall >= 0.9;
  return {
    metrics,
    p0Pass,
    p1Pass,
    passed: p0Pass && p1Pass,
  } as const;
}

export function focusReportAllowsFullOnce(report: unknown): boolean {
  if (typeof report !== "object" || report === null) {
    return false;
  }
  const candidate = report as Record<string, unknown>;
  if (
    candidate.status !== "COMPLETE" ||
    candidate.mode !== "focus" ||
    typeof candidate.releaseAssessment !== "object" ||
    candidate.releaseAssessment === null
  ) {
    return false;
  }
  return (
    candidate.releaseAssessment as Record<string, unknown>
  ).passed === true;
}

export function summarizeFirstPassStructuredOutput(
  records: readonly StructuredOutputMetricObservation[],
) {
  const firstPass = records.filter(({ phase }) => phase === "FIRST_PASS");

  return {
    observations: firstPass.length,
    outputCaptured: firstPass.filter(
      ({ structuredOutputValidity }) =>
        structuredOutputValidity.firstAttemptOutputCaptured,
    ).length,
    jsonValid: firstPass.filter(
      ({ structuredOutputValidity }) =>
        structuredOutputValidity.firstAttemptJsonValid,
    ).length,
    schemaValid: firstPass.filter(
      ({ structuredOutputValidity }) =>
        structuredOutputValidity.firstAttemptSchemaValid,
    ).length,
    acceptedWithoutRetry: firstPass.filter(
      ({ structuredOutputValidity }) =>
        structuredOutputValidity.acceptedOnFirstAttempt,
    ).length,
    validatedEventually: firstPass.filter(
      ({ structuredOutputValidity }) =>
        structuredOutputValidity.validatedEventually,
    ).length,
  } as const;
}
