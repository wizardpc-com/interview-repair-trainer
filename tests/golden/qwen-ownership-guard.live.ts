import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { SemanticCheckResult } from "../../src/domain/semantic/contracts";
import type { LlmResult } from "../../src/services/llm/llm-service";
import { createSemanticCheckResultSchema } from "../../src/services/llm/schemas";
import {
  GOLDEN_ORACLE_SHA256,
  GOLDEN_ORACLE_VERSION,
  GOLDEN_QUESTION_PLANS,
  goldenSemanticCases,
  type GoldenCoreCase,
} from "../fixtures/golden-oracle";
import {
  createCapturingQwenService,
  redactConfiguredApiKey,
  type CapturedQwenAttempt,
} from "./qwen-live-helpers";
import { ownershipGuardRunPlan } from "./qwen-ownership-guard-run-plan";
import {
  replayCapturedSemanticResult,
  type ProductReplay,
} from "./qwen-semantic-product-replay";
import type { GoldenRunPhase } from "./qwen-semantic-run-plan";

const reportStem = "qwen-stage8-ownership-guard-v1.0";
const reportDirectory = resolve("reports/golden");
const jsonReportPath = resolve(reportDirectory, `${reportStem}.json`);
const markdownReportPath = resolve(reportDirectory, `${reportStem}.md`);
const projectContext =
  "The candidate is discussing a science or engineering project. Evaluate only the supplied frozen question and transcript structure.";

type ProductDecision = "CONTINUE" | "GATE";

type StructuredOutputValidity = Readonly<{
  attemptCount: number;
  firstAttemptOutputCaptured: boolean;
  firstAttemptJsonValid: boolean;
  firstAttemptSchemaValid: boolean;
  acceptedOnFirstAttempt: boolean;
  validatedEventually: boolean;
}>;

type OwnershipGuardRecord = Readonly<{
  model: string;
  caseId: GoldenCoreCase["id"];
  title: string;
  phase: GoldenRunPhase;
  run: number;
  questionPlanId: GoldenCoreCase["questionPlanId"];
  transcript: string;
  expectedSemantic: GoldenCoreCase["expectedSemantic"]["decision"];
  actualSemantic: SemanticCheckResult["decision"] | "EVALUATOR_ERROR";
  expectedIssueType: GoldenCoreCase["expectedSemantic"]["issueType"];
  actualIssueType: SemanticCheckResult["issueType"] | null;
  expectedGate: GoldenCoreCase["expectedGate"];
  actualGate: ProductDecision;
  evaluatorExactCorrect: boolean;
  finalGateCorrect: boolean;
  productResult: string;
  validatedEvaluatorResult: LlmResult<SemanticCheckResult>;
  productReplay: ProductReplay;
  structuredOutputValidity: StructuredOutputValidity;
  rawStructuredModelOutputs: readonly CapturedQwenAttempt[];
}>;

function measureStructuredOutputValidity(
  attempts: readonly CapturedQwenAttempt[],
  plan: (typeof GOLDEN_QUESTION_PLANS)[keyof typeof GOLDEN_QUESTION_PLANS]["plan"],
  evaluation: LlmResult<SemanticCheckResult>,
): StructuredOutputValidity {
  const firstAttemptOutput = attempts[0]?.structuredOutput ?? null;
  let firstAttemptJsonValid = false;
  let firstAttemptSchemaValid = false;

  if (firstAttemptOutput !== null) {
    try {
      const decoded: unknown = JSON.parse(firstAttemptOutput);
      firstAttemptJsonValid = true;
      firstAttemptSchemaValid = createSemanticCheckResultSchema(
        plan,
        1,
      ).safeParse(decoded).success;
    } catch {
      // Reported below; QwenLlmService owns the one-retry policy.
    }
  }

  return {
    attemptCount: attempts.length,
    firstAttemptOutputCaptured: firstAttemptOutput !== null,
    firstAttemptJsonValid,
    firstAttemptSchemaValid,
    acceptedOnFirstAttempt:
      evaluation.ok && attempts.length === 1 && firstAttemptSchemaValid,
    validatedEventually: evaluation.ok,
  };
}

function describeProductResult(
  evaluatorExactCorrect: boolean,
  expectedGate: ProductDecision,
  actualGate: ProductDecision,
): string {
  if (evaluatorExactCorrect && expectedGate === actualGate) {
    return "Evaluator label correct / Product correct";
  }
  if (!evaluatorExactCorrect && expectedGate === actualGate) {
    return actualGate === "CONTINUE"
      ? "Evaluator error / Product safe"
      : "Evaluator error / Product gate matched";
  }
  return actualGate === "GATE"
    ? "Product false gate"
    : "Product missed gate";
}

async function executeCase(
  fixture: GoldenCoreCase,
  phase: GoldenRunPhase,
  run: number,
): Promise<OwnershipGuardRecord> {
  const plan = GOLDEN_QUESTION_PLANS[fixture.questionPlanId].plan;
  const rawStructuredModelOutputs: CapturedQwenAttempt[] = [];
  const qwen = createCapturingQwenService(rawStructuredModelOutputs);
  const evaluation = await qwen.evaluateSemanticCheckpoint({
    projectContext,
    questionPlan: plan,
    transcript: fixture.transcript,
    checkpointVersion: 1,
    checkpointKind:
      fixture.transcriptKind === "CHECKPOINT" ? "INTERIM" : "FINAL",
  });
  const productReplay = await replayCapturedSemanticResult(
    fixture,
    phase,
    run,
    plan,
    evaluation,
  );
  const actualSemantic = evaluation.ok
    ? evaluation.value.decision
    : "EVALUATOR_ERROR";
  const actualIssueType =
    evaluation.ok && evaluation.value.decision === "ISSUE_DETECTED"
      ? evaluation.value.issueType
      : null;
  const evaluatorExactCorrect =
    actualSemantic === fixture.expectedSemantic.decision &&
    actualIssueType === fixture.expectedSemantic.issueType;

  const record: OwnershipGuardRecord = {
    model: qwen.model,
    caseId: fixture.id,
    title: fixture.title,
    phase,
    run,
    questionPlanId: fixture.questionPlanId,
    transcript: fixture.transcript,
    expectedSemantic: fixture.expectedSemantic.decision,
    actualSemantic,
    expectedIssueType: fixture.expectedSemantic.issueType,
    actualIssueType,
    expectedGate: fixture.expectedGate,
    actualGate: productReplay.finalProductDecision,
    evaluatorExactCorrect,
    finalGateCorrect:
      productReplay.finalProductDecision === fixture.expectedGate,
    productResult: describeProductResult(
      evaluatorExactCorrect,
      fixture.expectedGate,
      productReplay.finalProductDecision,
    ),
    validatedEvaluatorResult: evaluation,
    productReplay,
    structuredOutputValidity: measureStructuredOutputValidity(
      rawStructuredModelOutputs,
      plan,
      evaluation,
    ),
    rawStructuredModelOutputs,
  };
  console.log(
    `[ownership-golden] ${fixture.id} #${run}: semantic=${actualSemantic}/${actualIssueType ?? "null"} product=${record.actualGate}`,
  );
  return record;
}

function recordsFor(
  records: readonly OwnershipGuardRecord[],
  caseId: GoldenCoreCase["id"],
): readonly OwnershipGuardRecord[] {
  return records.filter(({ caseId: observedCaseId }) => observedCaseId === caseId);
}

function acceptance(records: readonly OwnershipGuardRecord[]) {
  const g05 = recordsFor(records, "G05");
  const g07 = recordsFor(records, "G07");
  const g06 = recordsFor(records, "G06");
  const g08 = recordsFor(records, "G08");
  const g05FalseGates = g05.filter(({ actualGate }) => actualGate === "GATE").length;
  const g07FalseGates = g07.filter(({ actualGate }) => actualGate === "GATE").length;
  const g06Gates = g06.filter(({ actualGate }) => actualGate === "GATE").length;
  const g08Gates = g08.filter(({ actualGate }) => actualGate === "GATE").length;

  return {
    g05: {
      observations: g05.length,
      productFalseGates: g05FalseGates,
      passed: g05.length === 3 && g05FalseGates === 0,
    },
    g07: {
      observations: g07.length,
      productFalseGates: g07FalseGates,
      passed: g07.length === 5 && g07FalseGates === 0,
    },
    g06: {
      observations: g06.length,
      productGates: g06Gates,
      productGateRecall: g06.length === 0 ? null : g06Gates / g06.length,
      passed: g06.length === 3 && g06Gates === 3,
    },
    g08: {
      observations: g08.length,
      productGates: g08Gates,
      productGateRecall: g08.length === 0 ? null : g08Gates / g08.length,
      passed: g08.length === 3 && g08Gates === 3,
    },
    passed:
      g05.length === 3 &&
      g05FalseGates === 0 &&
      g07.length === 5 &&
      g07FalseGates === 0 &&
      g06.length === 3 &&
      g06Gates === 3 &&
      g08.length === 3 &&
      g08Gates === 3,
  } as const;
}

function structuredOutputSummary(records: readonly OwnershipGuardRecord[]) {
  return {
    observations: records.length,
    firstAttemptSchemaValid: records.filter(
      ({ structuredOutputValidity }) =>
        structuredOutputValidity.firstAttemptSchemaValid,
    ).length,
    acceptedWithoutRetry: records.filter(
      ({ structuredOutputValidity }) =>
        structuredOutputValidity.acceptedOnFirstAttempt,
    ).length,
    validatedEventually: records.filter(
      ({ structuredOutputValidity }) =>
        structuredOutputValidity.validatedEventually,
    ).length,
    retries: records.filter(
      ({ structuredOutputValidity }) =>
        structuredOutputValidity.attemptCount > 1,
    ).length,
  } as const;
}

async function persistJson(
  records: readonly OwnershipGuardRecord[],
  status: "RUNNING" | "COMPLETE",
): Promise<void> {
  const report = `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      status,
      mode: "ownership-guard-focused",
      reportFile: `${reportStem}.json`,
      oracle: {
        version: GOLDEN_ORACLE_VERSION,
        sha256: GOLDEN_ORACLE_SHA256,
      },
      runConfiguration: {
        plannedSemanticEvaluatorCalls: ownershipGuardRunPlan.length,
        plannedRuns: ownershipGuardRunPlan,
      },
      acceptance: acceptance(records),
      structuredOutput: structuredOutputSummary(records),
      credentialSafety:
        "The serialized report was redacted and checked against the configured API key before writing.",
      model: records[0]?.model ?? null,
      records,
    },
    null,
    2,
  )}\n`;
  await writeFile(jsonReportPath, redactConfiguredApiKey(report), "utf8");
}

function escapeCell(value: unknown): string {
  return String(value ?? "null")
    .replaceAll("|", "\\|")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ");
}

function resultTable(records: readonly OwnershipGuardRecord[]): string {
  return [
    "| Case | Run | Expected Semantic | Actual Semantic | Expected Issue | Actual Issue | Expected Gate | Actual Gate | Product Result |",
    "|---|---:|---|---|---|---|---|---|---|",
    ...records.map((record) =>
      [
        record.caseId,
        record.run,
        record.expectedSemantic,
        record.actualSemantic,
        record.expectedIssueType,
        record.actualIssueType,
        record.expectedGate,
        record.actualGate,
        record.productResult,
      ]
        .map(escapeCell)
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |"),
    ),
  ].join("\n");
}

function rawMismatchSections(records: readonly OwnershipGuardRecord[]): string {
  const mismatches = records.filter(
    ({ evaluatorExactCorrect, finalGateCorrect }) =>
      !evaluatorExactCorrect || !finalGateCorrect,
  );
  if (mismatches.length === 0) {
    return "无。";
  }
  return mismatches
    .map((record) => {
      const attempts = record.rawStructuredModelOutputs
        .map(
          (attempt) =>
            `attempt ${attempt.attempt}, HTTP ${attempt.httpStatus ?? "transport error"}\n${attempt.structuredOutput ?? "<no structured model output>"}`,
        )
        .join("\n\n");
      return [
        `### ${record.caseId} #${record.run}`,
        "",
        `Expected ${record.expectedSemantic}/${record.expectedIssueType ?? "null"}/${record.expectedGate}; actual ${record.actualSemantic}/${record.actualIssueType ?? "null"}/${record.actualGate}.`,
        "",
        "````text",
        attempts,
        "````",
      ].join("\n");
    })
    .join("\n\n");
}

async function persistMarkdown(
  records: readonly OwnershipGuardRecord[],
): Promise<void> {
  const result = acceptance(records);
  const structured = structuredOutputSummary(records);
  const markdown = [
    "# Qwen Stage 8 Ownership Guard Focused Regression",
    "",
    `- Model: ${records[0]?.model ?? "unknown"}`,
    `- Logical Semantic Evaluator calls: ${records.length}/${ownershipGuardRunPlan.length}`,
    `- G05 false gates: ${result.g05.productFalseGates}/${result.g05.observations} — ${result.g05.passed ? "PASS" : "FAIL"}`,
    `- G07 false gates: ${result.g07.productFalseGates}/${result.g07.observations} — ${result.g07.passed ? "PASS" : "FAIL"}`,
    `- G06 product gate recall: ${result.g06.productGates}/${result.g06.observations} — ${result.g06.passed ? "PASS" : "FAIL"}`,
    `- G08 product gate recall: ${result.g08.productGates}/${result.g08.observations} — ${result.g08.passed ? "PASS" : "FAIL"}`,
    `- Acceptance: ${result.passed ? "PASS" : "FAIL"}`,
    `- First-pass schema valid: ${structured.firstAttemptSchemaValid}/${structured.observations}; retries: ${structured.retries}`,
    "",
    "## Results",
    "",
    resultTable(records),
    "",
    "## Mismatch Raw Structured Outputs",
    "",
    rawMismatchSections(records),
    "",
    "Full raw structured outputs and provider response bodies for every run are retained in the JSON report.",
    "",
  ].join("\n");
  await writeFile(
    markdownReportPath,
    redactConfiguredApiKey(markdown),
    "utf8",
  );
}

describe("Qwen Stage 8 ownership guard focused regression (live)", () => {
  it(
    "keeps explicit ownership safe while preserving clear ownership gates",
    async () => {
      await mkdir(reportDirectory, { recursive: true });
      const records: OwnershipGuardRecord[] = [];
      await persistJson(records, "RUNNING");

      for (const spec of ownershipGuardRunPlan) {
        const fixture = goldenSemanticCases.find(
          ({ id }) => id === spec.caseId,
        );
        if (fixture === undefined) {
          throw new Error(`Missing Golden fixture ${spec.caseId}`);
        }
        records.push(await executeCase(fixture, spec.phase, spec.run));
        await persistJson(records, "RUNNING");
      }

      await persistJson(records, "COMPLETE");
      await persistMarkdown(records);
      const result = acceptance(records);

      expect(result.g05.productFalseGates, "G05 requires zero false gates").toBe(
        0,
      );
      expect(result.g07.productFalseGates, "G07 requires zero false gates").toBe(
        0,
      );
      expect(result.g06.productGates, "G06 requires 100% gate recall").toBe(3);
      expect(result.g08.productGates, "G08 requires 100% gate recall").toBe(3);
      expect(result.passed).toBe(true);
    },
    15 * 60_000,
  );
});
