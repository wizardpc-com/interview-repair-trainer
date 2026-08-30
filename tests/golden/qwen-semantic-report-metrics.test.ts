import { describe, expect, it } from "vitest";
import {
  assessProductRelease,
  focusReportAllowsFullOnce,
  summarizeFirstPassStructuredOutput,
  summarizeProductReleaseMetrics,
  type ReleaseMetricObservation,
  type StructuredOutputMetricObservation,
} from "./qwen-semantic-report-metrics";

describe("Qwen Semantic Golden report metrics", () => {
  it("weights only dedicated P0/P1 stability observations", () => {
    const records: ReleaseMetricObservation[] = [
      {
        phase: "FIRST_PASS",
        actualSemantic: "ISSUE_DETECTED",
        actualIssueType: "WRONG",
        expectedIssueType: null,
        actualGate: "GATE",
      },
      ...Array.from({ length: 3 }, (_, index) => ({
        phase: "P0_STABILITY" as const,
        actualSemantic:
          index === 0 ? ("ISSUE_DETECTED" as const) : ("CONTINUE" as const),
        actualIssueType: index === 0 ? "WRONG" : null,
        expectedIssueType: null,
        actualGate: index === 0 ? ("GATE" as const) : ("CONTINUE" as const),
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        phase: "P1_STABILITY" as const,
        actualSemantic:
          index < 3 ? ("ISSUE_DETECTED" as const) : ("CONTINUE" as const),
        actualIssueType: index < 2 ? "EXPECTED" : index === 2 ? "WRONG" : null,
        expectedIssueType: "EXPECTED",
        actualGate: index < 3 ? ("GATE" as const) : ("CONTINUE" as const),
      })),
    ];

    expect(summarizeProductReleaseMetrics(records)).toEqual({
      p0: {
        observations: 3,
        productFalseGates: 1,
        productFalseGateRate: 1 / 3,
        evaluatorFalseIssues: 1,
        evaluatorFalseIssueRate: 1 / 3,
      },
      p1: {
        observations: 4,
        productGates: 3,
        productGateRecall: 0.75,
        evaluatorIssues: 3,
        evaluatorIssueRecall: 0.75,
        issueTypesCorrect: 2,
        issueTypeAccuracy: 0.5,
      },
    });
  });

  it("measures first provider attempt validity only on first-pass cases", () => {
    const records: StructuredOutputMetricObservation[] = [
      {
        phase: "FIRST_PASS",
        structuredOutputValidity: {
          firstAttemptOutputCaptured: true,
          firstAttemptJsonValid: true,
          firstAttemptSchemaValid: true,
          acceptedOnFirstAttempt: true,
          validatedEventually: true,
        },
      },
      {
        phase: "FIRST_PASS",
        structuredOutputValidity: {
          firstAttemptOutputCaptured: true,
          firstAttemptJsonValid: false,
          firstAttemptSchemaValid: false,
          acceptedOnFirstAttempt: false,
          validatedEventually: true,
        },
      },
      {
        phase: "P1_STABILITY",
        structuredOutputValidity: {
          firstAttemptOutputCaptured: false,
          firstAttemptJsonValid: false,
          firstAttemptSchemaValid: false,
          acceptedOnFirstAttempt: false,
          validatedEventually: false,
        },
      },
    ];

    expect(summarizeFirstPassStructuredOutput(records)).toEqual({
      observations: 2,
      outputCaptured: 2,
      jsonValid: 1,
      schemaValid: 1,
      acceptedWithoutRetry: 1,
      validatedEventually: 2,
    });
  });

  it("marks a complete release assessment and gates full-once on its focus report", () => {
    const records: ReleaseMetricObservation[] = [
      {
        phase: "P0_STABILITY",
        actualSemantic: "CONTINUE",
        actualIssueType: null,
        expectedIssueType: null,
        actualGate: "CONTINUE",
      },
      {
        phase: "P1_STABILITY",
        actualSemantic: "ISSUE_DETECTED",
        actualIssueType: "EXPECTED",
        expectedIssueType: "EXPECTED",
        actualGate: "GATE",
      },
    ];
    const assessment = assessProductRelease(records, 1, 1);

    expect(assessment).toMatchObject({
      p0Pass: true,
      p1Pass: true,
      passed: true,
    });
    expect(assessProductRelease(records, 2, 1)).toBeNull();
    expect(
      focusReportAllowsFullOnce({
        status: "COMPLETE",
        mode: "focus",
        releaseAssessment: assessment,
      }),
    ).toBe(true);
    expect(
      focusReportAllowsFullOnce({
        status: "COMPLETE",
        mode: "full",
        releaseAssessment: assessment,
      }),
    ).toBe(false);
    expect(
      focusReportAllowsFullOnce({
        status: "COMPLETE",
        mode: "focus",
        releaseAssessment: { passed: false },
      }),
    ).toBe(false);
  });
});
