import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MVP_CHECKPOINT_HEURISTIC,
  MVP_FINAL_CHECKPOINT_MIN_CHARACTERS,
  MVP_SEMANTIC_GATE_HEURISTIC,
} from "../../src/domain/interview/runtime";
import type { GateArbiterDecision } from "../../src/domain/semantic/gate-arbiter";
import type { SemanticCheckResult } from "../../src/domain/semantic/contracts";
import type { LlmResult } from "../../src/services/llm/llm-service";
import { createSemanticCheckResultSchema } from "../../src/services/llm/schemas";
import {
  GOLDEN_ORACLE_SHA256,
  GOLDEN_ORACLE_VERSION,
  GOLDEN_QUESTION_PLANS,
  goldenSemanticCases,
  p0FalseGateCaseIds,
  p1ClearGateCaseIds,
  type GoldenCoreCase,
} from "../fixtures/golden-oracle";
import {
  createCapturingQwenService,
  redactConfiguredApiKey,
  type CapturedQwenAttempt,
} from "./qwen-live-helpers";
import {
  buildSemanticGoldenRunPlan,
  focusedRegressionCaseIds,
  minimumStabilityRunsPerCase,
  readGoldenQwenMode,
  type GoldenRunPhase,
} from "./qwen-semantic-run-plan";
import {
  assessProductRelease,
  focusReportAllowsFullOnce,
  summarizeFirstPassStructuredOutput,
} from "./qwen-semantic-report-metrics";
import {
  replayCapturedSemanticResult,
  type ProductReplay,
} from "./qwen-semantic-product-replay";

const qwenMode = readGoldenQwenMode(process.env.GOLDEN_QWEN_MODE);
const reportStem = {
  focus: "qwen-stage8-focus-v1.0",
  "full-once": "qwen-stage8-full-once-v1.0",
  full: "qwen-stage8-v1.0",
}[qwenMode];
const reportDirectory = resolve("reports/golden");
const jsonReportPath = resolve(reportDirectory, `${reportStem}.json`);
const markdownReportPath = resolve(reportDirectory, `${reportStem}.md`);
const focusJsonReportPath = resolve(
  reportDirectory,
  "qwen-stage8-focus-v1.0.json",
);
const projectContext =
  "The candidate is discussing a science or engineering project. Evaluate only the supplied frozen question and transcript structure.";
const stabilityRunsPerCase = minimumStabilityRunsPerCase;
const runPlan = buildSemanticGoldenRunPlan(qwenMode, stabilityRunsPerCase);
const p1CheckpointPreflight = p1ClearGateCaseIds.map((caseId) => {
  const fixture = goldenSemanticCases.find(({ id }) => id === caseId);
  if (fixture === undefined) {
    throw new Error(`Missing P1 fixture ${caseId}`);
  }
  const transcriptCharacters = fixture.transcript.trim().length;
  return {
    caseId,
    checkpointKind: "FINAL" as const,
    transcriptCharacters,
    minimumCharacters: MVP_FINAL_CHECKPOINT_MIN_CHARACTERS,
    eligibleByLength:
      transcriptCharacters >= MVP_FINAL_CHECKPOINT_MIN_CHARACTERS,
  };
});

type ProductDecision = "CONTINUE" | "GATE";
type FailureClassification =
  | "evaluator semantic error"
  | "Gate Arbiter error"
  | "checkpoint/context eligibility error"
  | "schema/output instability"
  | "provider/API error";

type StructuredOutputValidity = Readonly<{
  attemptCount: number;
  firstAttemptOutputCaptured: boolean;
  firstAttemptJsonValid: boolean;
  firstAttemptSchemaValid: boolean;
  acceptedOnFirstAttempt: boolean;
  validatedEventually: boolean;
  recoveredAfterRetry: boolean;
}>;

type GoldenRunRecord = Readonly<{
  model: string;
  caseId: GoldenCoreCase["id"];
  title: string;
  phase: GoldenRunPhase;
  run: number;
  questionPlan: Readonly<{
    oracleId: GoldenCoreCase["questionPlanId"];
    oracleSurfaceQuestion: string;
    oracleCaseQuestion: string | null;
    productSurfaceQuestion: string;
    productPlanId: string;
  }>;
  transcriptKind: GoldenCoreCase["transcriptKind"];
  transcript: string;
  expectedSemantic: GoldenCoreCase["expectedSemantic"]["decision"];
  actualSemantic: SemanticCheckResult["decision"] | "EVALUATOR_ERROR";
  expectedIssueType: GoldenCoreCase["expectedSemantic"]["issueType"];
  actualIssueType: SemanticCheckResult["issueType"] | null;
  expectedGate: GoldenCoreCase["expectedGate"];
  actualGate: ProductDecision;
  evaluatorDecisionCorrect: boolean;
  evaluatorExactCorrect: boolean;
  evaluatorGateSignalEligible: boolean | null;
  arbiterWithOracleContextCorrect: boolean;
  finalGateCorrect: boolean;
  productResult: string;
  failureClassifications: readonly FailureClassification[];
  validatedEvaluatorResult: LlmResult<SemanticCheckResult>;
  productReplay: ProductReplay;
  structuredOutputValidity: StructuredOutputValidity;
  rawStructuredModelOutputs: readonly CapturedQwenAttempt[];
}>;

type GoldenQuestionPlan =
  (typeof GOLDEN_QUESTION_PLANS)[keyof typeof GOLDEN_QUESTION_PLANS]["plan"];

function classifyFailures(
  fixture: GoldenCoreCase,
  evaluation: LlmResult<SemanticCheckResult>,
  evaluatorExactCorrect: boolean,
  replay: ProductReplay,
): readonly FailureClassification[] {
  if (!evaluation.ok) {
    return [
      evaluation.error.code === "INVALID_STRUCTURED_OUTPUT"
        ? "schema/output instability"
        : "provider/API error",
    ];
  }
  const failures = new Set<FailureClassification>();
  if (!evaluatorExactCorrect) {
    failures.add("evaluator semantic error");
  }
  if (fixture.expectedGate === replay.finalProductDecision) {
    return [...failures];
  }

  if (fixture.expectedGate === "GATE") {
    if (replay.arbiterDecisionWithOracleContext === "CONTINUE") {
      failures.add("evaluator semantic error");
    } else if (
      !replay.checkpointEligibility.eligible ||
      replay.arbiterDecision === "CONTINUE"
    ) {
      failures.add("checkpoint/context eligibility error");
    } else {
      failures.add("Gate Arbiter error");
    }
  } else if (evaluatorExactCorrect) {
    failures.add("Gate Arbiter error");
  }

  return [...failures];
}

function describeProductResult(
  evaluatorExactCorrect: boolean,
  expectedGate: ProductDecision,
  actualGate: ProductDecision,
  arbiterDecisionWithOracleContext: GateArbiterDecision,
): string {
  const gateCorrect = expectedGate === actualGate;
  if (evaluatorExactCorrect && gateCorrect) {
    return "Evaluator label correct / Product correct";
  }
  if (!evaluatorExactCorrect && gateCorrect && actualGate === "CONTINUE") {
    return "Evaluator error / Product safe";
  }
  if (!evaluatorExactCorrect && gateCorrect) {
    return "Evaluator error / Product gate matched";
  }
  if (evaluatorExactCorrect && actualGate === "GATE") {
    return "Evaluator label correct / Product false gate";
  }
  if (evaluatorExactCorrect) {
    if (
      expectedGate === "GATE" &&
      arbiterDecisionWithOracleContext === "CONTINUE"
    ) {
      return "Evaluator label correct, gate signal ineligible / Product missed gate";
    }
    return "Evaluator label correct / Product missed gate";
  }
  return actualGate === "GATE"
    ? "Evaluator error / Product unsafe"
    : "Evaluator error / Product missed gate";
}

function measureStructuredOutputValidity(
  attempts: readonly CapturedQwenAttempt[],
  plan: GoldenQuestionPlan,
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
      // Validity is recorded in the report; QwenLlmService owns retry behavior.
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
    recoveredAfterRetry:
      evaluation.ok && attempts.length > 1 && !firstAttemptSchemaValid,
  };
}

async function executeCase(
  fixture: GoldenCoreCase,
  phase: GoldenRunPhase,
  run: number,
): Promise<GoldenRunRecord> {
  const planFixture = GOLDEN_QUESTION_PLANS[fixture.questionPlanId];
  const plan = planFixture.plan;
  const rawStructuredModelOutputs: CapturedQwenAttempt[] = [];
  const qwen = createCapturingQwenService(rawStructuredModelOutputs);
  const evaluation = await qwen.evaluateSemanticCheckpoint({
    projectContext,
    questionPlan: plan,
    transcript: fixture.transcript,
    checkpointVersion: 1,
    checkpointKind: fixture.transcriptKind === "CHECKPOINT" ? "INTERIM" : "FINAL",
  });
  const replay = await replayCapturedSemanticResult(
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
  const evaluatorDecisionCorrect =
    actualSemantic === fixture.expectedSemantic.decision;
  const evaluatorExactCorrect =
    evaluatorDecisionCorrect &&
    actualIssueType === fixture.expectedSemantic.issueType;
  const evaluatorGateSignalEligible =
    evaluation.ok && evaluation.value.decision === "ISSUE_DETECTED"
      ? evaluation.value.gateability === "GATE_ELIGIBLE" &&
        evaluation.value.confidence >=
          MVP_SEMANTIC_GATE_HEURISTIC.minConfidence &&
        evaluation.value.answerBoundary === "NONE"
      : null;
  const finalGateCorrect = replay.finalProductDecision === fixture.expectedGate;
  const structuredOutputValidity = measureStructuredOutputValidity(
    rawStructuredModelOutputs,
    plan,
    evaluation,
  );

  const record: GoldenRunRecord = {
    model: qwen.model,
    caseId: fixture.id,
    title: fixture.title,
    phase,
    run,
    questionPlan: {
      oracleId: fixture.questionPlanId,
      oracleSurfaceQuestion: planFixture.oracleSurfaceQuestion,
      oracleCaseQuestion: fixture.oracleQuestionOverride ?? null,
      productSurfaceQuestion: plan.surfaceQuestion,
      productPlanId: plan.id,
    },
    transcriptKind: fixture.transcriptKind,
    transcript: fixture.transcript,
    expectedSemantic: fixture.expectedSemantic.decision,
    actualSemantic,
    expectedIssueType: fixture.expectedSemantic.issueType,
    actualIssueType,
    expectedGate: fixture.expectedGate,
    actualGate: replay.finalProductDecision,
    evaluatorDecisionCorrect,
    evaluatorExactCorrect,
    evaluatorGateSignalEligible,
    arbiterWithOracleContextCorrect:
      replay.arbiterDecisionWithOracleContext === fixture.expectedGate,
    finalGateCorrect,
    productResult: describeProductResult(
      evaluatorExactCorrect,
      fixture.expectedGate,
      replay.finalProductDecision,
      replay.arbiterDecisionWithOracleContext,
    ),
    failureClassifications: classifyFailures(
      fixture,
      evaluation,
      evaluatorExactCorrect,
      replay,
    ),
    validatedEvaluatorResult: evaluation,
    productReplay: replay,
    structuredOutputValidity,
    rawStructuredModelOutputs,
  };
  console.log(
    `[golden] ${phase} ${fixture.id} #${run}: semantic=${actualSemantic}/${actualIssueType ?? "null"} product=${record.actualGate}`,
  );
  return record;
}

function percent(numerator: number, denominator: number): string {
  return denominator === 0
    ? "n/a"
    : `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function escapeCell(value: unknown): string {
  return String(value ?? "null")
    .replaceAll("|", "\\|")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ");
}

function firstPassTable(records: readonly GoldenRunRecord[]): string {
  const header =
    "| Case | Expected Semantic | Actual Semantic | Expected IssueType | Actual IssueType | Expected Gate | Actual Gate | Product Result | Failure | Checkpoint | Eligibility | Context | Persistence |";
  const divider =
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|";
  const rows = records.map((record) =>
    [
      record.caseId,
      record.expectedSemantic,
      record.actualSemantic,
      record.expectedIssueType,
      record.actualIssueType,
      record.expectedGate,
      record.actualGate,
      record.productResult,
      record.failureClassifications.length === 0
        ? "—"
        : record.failureClassifications.join(", "),
      record.productReplay.checkpointKind,
      record.productReplay.checkpointEligibility.reason,
      record.productReplay.hasSufficientAnswerContext
        ? "SUFFICIENT"
        : "INSUFFICIENT",
      record.productReplay.persistenceBasis,
    ]
      .map(escapeCell)
      .join(" | ")
      .replace(/^/, "| ")
      .replace(/$/, " |"),
  );
  return [header, divider, ...rows].join("\n");
}

function stabilityTable(
  records: readonly GoldenRunRecord[],
  caseIds: readonly GoldenCoreCase["id"][],
): string {
  const rows = caseIds.map((caseId) => {
    const runs = records.filter(({ caseId: id }) => id === caseId);
    const gates = runs.map(({ actualGate }) => actualGate).join(" / ");
    const semantics = runs
      .map(({ actualSemantic, actualIssueType }) =>
        actualIssueType === null
          ? actualSemantic
          : `${actualSemantic}:${actualIssueType}`,
      )
      .join(" / ");
    const correctGates = runs.filter(({ finalGateCorrect }) => finalGateCorrect)
      .length;
    return `| ${caseId} | ${escapeCell(semantics)} | ${escapeCell(gates)} | ${correctGates}/${runs.length} |`;
  });
  return [
    "| Case | Semantic runs | Product Gate runs | Correct Gate |",
    "|---|---|---|---|",
    ...rows,
  ].join("\n");
}

function unstableCases(records: readonly GoldenRunRecord[]): string[] {
  const caseIds = [...new Set(records.map(({ caseId }) => caseId))];
  return caseIds.filter((caseId) => {
    const outcomes = new Set(
      records
        .filter(({ caseId: id }) => id === caseId)
        .map(
          ({ actualSemantic, actualIssueType, actualGate }) =>
            `${actualSemantic}/${actualIssueType ?? "null"}/${actualGate}`,
        ),
    );
    return outcomes.size > 1;
  });
}

function rawFailureSections(records: readonly GoldenRunRecord[]): string {
  const failures = records.filter(
    ({ evaluatorExactCorrect, finalGateCorrect }) =>
      !evaluatorExactCorrect || !finalGateCorrect,
  );
  if (failures.length === 0) {
    return "无。";
  }

  return failures
    .map((record) => {
      const raw = record.rawStructuredModelOutputs
        .map(
          (attempt) =>
            [
              `attempt ${attempt.attempt}, HTTP ${attempt.httpStatus ?? "transport error"}`,
              `transportErrorName: ${attempt.transportErrorName ?? "null"}`,
              "structuredOutput:",
              attempt.structuredOutput ?? "<no structured model output>",
              "rawResponseBody:",
              attempt.rawResponseBody ?? "<no provider response body>",
            ].join("\n"),
        )
        .join("\n\n");
      return [
        `### ${record.caseId} — ${record.failureClassifications.join(", ") || "mismatch"}`,
        "",
        `Expected: ${record.expectedSemantic}/${record.expectedIssueType ?? "null"}, ${record.expectedGate}. Actual: ${record.actualSemantic}/${record.actualIssueType ?? "null"}, ${record.actualGate}.`,
        "",
        "````text",
        raw,
        "````",
      ].join("\n");
    })
    .join("\n\n");
}

async function requirePassingFocusReportForFullOnce(): Promise<void> {
  if (qwenMode !== "full-once") {
    return;
  }

  let report: unknown;
  try {
    report = JSON.parse(await readFile(focusJsonReportPath, "utf8"));
  } catch {
    throw new Error(
      "full-once requires a completed passing focus report; run test:golden:focus:qwen first",
    );
  }
  if (!focusReportAllowsFullOnce(report)) {
    throw new Error(
      "full-once requires the latest focus report to pass both P0 and P1 product release bars",
    );
  }
}

async function persistJson(
  records: readonly GoldenRunRecord[],
  status: "RUNNING" | "COMPLETE",
): Promise<void> {
  const firstPassStructuredOutputValidity =
    summarizeFirstPassStructuredOutput(records);
  const releaseAssessment = assessProductRelease(
    records,
    p0FalseGateCaseIds.length * stabilityRunsPerCase,
    p1ClearGateCaseIds.length * stabilityRunsPerCase,
  );
  const serializedReport = `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        status,
        mode: qwenMode,
        reportFile: `${reportStem}.json`,
        oracle: {
          version: GOLDEN_ORACLE_VERSION,
          sha256: GOLDEN_ORACLE_SHA256,
          requestedFileName:
            "Interview_Repair_Trainer_Golden_Test_Set_ONLY_v1.0.md",
          resolvedFileName: "Interview_Repair_Trainer_Golden_Test_Set_v1.0.md",
        },
        runConfiguration: {
          focusedRegressionCaseIds,
          p0FalseGateCaseIds,
          p1ClearGateCaseIds,
          stabilityRunsPerCase,
          plannedRuns: runPlan,
        },
        releaseAssessment,
        firstPassStructuredOutputValidity,
        configuredHeuristics: {
          checkpoint: MVP_CHECKPOINT_HEURISTIC,
          semanticGate: MVP_SEMANTIC_GATE_HEURISTIC,
        },
        checkpointPolicyPreflight: {
          finalMinimumCharacters: MVP_FINAL_CHECKPOINT_MIN_CHARACTERS,
          interim: MVP_CHECKPOINT_HEURISTIC,
          persistence:
            "FINAL completion is immediately gate-eligible after context checks; INTERIM requires the same issue on a newer checkpoint.",
          p1: p1CheckpointPreflight,
        },
        stabilityRunsPerCase,
        credentialSafety:
          "The serialized report was redacted and checked against the configured API key before writing.",
        model: records[0]?.model ?? null,
        records,
      },
      null,
      2,
    )}\n`;
  await writeFile(
    jsonReportPath,
    redactConfiguredApiKey(serializedReport),
    "utf8",
  );
}

describe("Qwen Stage 8 Semantic Evaluator + Gate Arbiter Golden (live)", () => {
  it(
    `runs the ${qwenMode} regression plan with isolated evaluator and product metrics`,
    async () => {
      await requirePassingFocusReportForFullOnce();
      await mkdir(reportDirectory, { recursive: true });
      const records: GoldenRunRecord[] = [];

      for (const spec of runPlan) {
        const fixture = goldenSemanticCases.find(({ id }) => id === spec.caseId);
        if (fixture === undefined) {
          throw new Error(`Missing Golden fixture ${spec.caseId}`);
        }
        records.push(await executeCase(fixture, spec.phase, spec.run));
        await persistJson(records, "RUNNING");
      }

      const firstPass = records.filter(({ phase }) => phase === "FIRST_PASS");
      const focusStability = records.filter(
        ({ phase }) => phase === "FOCUS_STABILITY",
      );
      const p0 = records.filter(({ phase }) => phase === "P0_STABILITY");
      const p1 = records.filter(({ phase }) => phase === "P1_STABILITY");
      const evaluatorDecisionCorrect = firstPass.filter(
        (record) => record.evaluatorDecisionCorrect,
      ).length;
      const evaluatorExactCorrect = firstPass.filter(
        (record) => record.evaluatorExactCorrect,
      ).length;
      const firstPassExpectedIssues = firstPass.filter(
        ({ expectedSemantic }) => expectedSemantic === "ISSUE_DETECTED",
      );
      const firstPassIssueTypesCorrect = firstPassExpectedIssues.filter(
        ({ actualIssueType, expectedIssueType }) =>
          actualIssueType === expectedIssueType,
      ).length;
      const finalGateCorrect = firstPass.filter(
        (record) => record.finalGateCorrect,
      ).length;
      const firstPassFalseGates = firstPass.filter(
        ({ expectedGate, actualGate }) =>
          expectedGate === "CONTINUE" && actualGate === "GATE",
      ).length;
      const releaseAssessment = assessProductRelease(
        records,
        p0FalseGateCaseIds.length * stabilityRunsPerCase,
        p1ClearGateCaseIds.length * stabilityRunsPerCase,
      );
      const releaseMetrics = releaseAssessment?.metrics ?? null;
      const p0FalseGates = releaseMetrics?.p0.productFalseGates ?? 0;
      const p1CorrectGates = releaseMetrics?.p1.productGates ?? 0;
      const p0EvaluatorFalseIssues =
        releaseMetrics?.p0.evaluatorFalseIssues ?? 0;
      const p1EvaluatorIssues = releaseMetrics?.p1.evaluatorIssues ?? 0;
      const p1IssueTypesCorrect = releaseMetrics?.p1.issueTypesCorrect ?? 0;
      const p1OracleContextArbiterGates = p1.filter(
        ({ productReplay }) =>
          productReplay.arbiterDecisionWithOracleContext === "GATE",
      ).length;
      const p1Recall = releaseMetrics?.p1.productGateRecall ?? 0;
      const firstPassStructuredOutput =
        summarizeFirstPassStructuredOutput(records);
      const recoveredStructuredOutputRetries = records.filter(
        ({ structuredOutputValidity }) =>
          structuredOutputValidity.recoveredAfterRetry,
      );
      const stabilityRecords = [...focusStability, ...p0, ...p1];
      const unstable = unstableCases(stabilityRecords);
      const classifications = Object.fromEntries(
        [
          "evaluator semantic error",
          "Gate Arbiter error",
          "checkpoint/context eligibility error",
          "schema/output instability",
          "provider/API error",
        ].map((classification) => [
          classification,
          records.filter(
            ({ failureClassifications }) =>
              failureClassifications.includes(
                classification as FailureClassification,
              ),
          ).length,
        ]),
      );
      const failureSummary = {
        ...classifications,
        "recovered schema/output retry":
          recoveredStructuredOutputRetries.length,
      };
      const p0Pass = releaseAssessment?.p0Pass ?? null;
      const p1Pass = releaseAssessment?.p1Pass ?? null;
      const recommendStage9 = releaseAssessment?.passed ?? null;
      const firstPassFailures = firstPass.filter(
        ({ evaluatorExactCorrect, finalGateCorrect }) =>
          !evaluatorExactCorrect || !finalGateCorrect,
      );
      const focusedStabilityRecords = stabilityRecords.filter(({ caseId }) =>
        focusedRegressionCaseIds.includes(
          caseId as (typeof focusedRegressionCaseIds)[number],
        ),
      );

      const markdown = [
        `# Stage 8 Qwen Golden Test Report (${qwenMode})`,
        "",
        `- Generated: ${new Date().toISOString()}`,
        `- Mode: \`${qwenMode}\``,
        `- Oracle: v${GOLDEN_ORACLE_VERSION}, SHA256 \`${GOLDEN_ORACLE_SHA256}\``,
        `- Model: \`${firstPass[0]?.model ?? "unknown"}\``,
        "- Requested `_ONLY_` attachment was absent; the unique matching v1.0 file was used.",
        "- Fixed QuestionPlans use the current canonical product surface questions; Oracle example questions are preserved in the JSON record.",
        "- Real API output is isolated from `npm test`; no API key is written to this report.",
        `- Every provider response and structured output, including retry attempts, is in \`${reportStem}.json\`.`,
        qwenMode === "full-once"
          ? "- P0/P1 stability was not rerun; this mode is admitted only by a completed passing focus report."
          : `- P0 and P1 product release metrics use only the balanced ${stabilityRunsPerCase}-run-per-case stability observations; first-pass cases do not change their weighting.`,
        `- ANSWER fixtures run through COMPLETE and a FINAL checkpoint with a ${MVP_FINAL_CHECKPOINT_MIN_CHARACTERS}-character minimum; CHECKPOINT fixtures use INTERIM eligibility and cross-checkpoint issue confirmation.`,
        "",
        "## Metrics",
        "",
        `- First-pass evaluator-only decision accuracy: ${evaluatorDecisionCorrect}/${firstPass.length} (${percent(evaluatorDecisionCorrect, firstPass.length)})`,
        `- First-pass evaluator-only label accuracy (decision + IssueType): ${evaluatorExactCorrect}/${firstPass.length} (${percent(evaluatorExactCorrect, firstPass.length)})`,
        `- First-pass IssueType accuracy among expected issues: ${firstPassIssueTypesCorrect}/${firstPassExpectedIssues.length} (${percent(firstPassIssueTypesCorrect, firstPassExpectedIssues.length)})`,
        `- First-pass structured-output JSON validity before retry: ${firstPassStructuredOutput.jsonValid}/${firstPassStructuredOutput.observations} (${percent(firstPassStructuredOutput.jsonValid, firstPassStructuredOutput.observations)})`,
        `- First-pass structured-output Zod validity before retry: ${firstPassStructuredOutput.schemaValid}/${firstPassStructuredOutput.observations} (${percent(firstPassStructuredOutput.schemaValid, firstPassStructuredOutput.observations)})`,
        `- First-pass structured output accepted without retry: ${firstPassStructuredOutput.acceptedWithoutRetry}/${firstPassStructuredOutput.observations} (${percent(firstPassStructuredOutput.acceptedWithoutRetry, firstPassStructuredOutput.observations)})`,
        `- First-pass structured output validated eventually: ${firstPassStructuredOutput.validatedEventually}/${firstPassStructuredOutput.observations} (${percent(firstPassStructuredOutput.validatedEventually, firstPassStructuredOutput.observations)})`,
        `- First-pass Final Gate accuracy: ${finalGateCorrect}/${firstPass.length} (${percent(finalGateCorrect, firstPass.length)})`,
        `- First-pass False Gate count: ${firstPassFalseGates}`,
        ...(releaseMetrics === null
          ? [
              "- P0/P1 product release bars: not rerun in full-once mode; see the prerequisite focus report.",
            ]
          : [
              `- P0 Product False Gate release bar: ${p0FalseGates}/${p0.length} — ${p0Pass ? "PASS" : "FAIL"}`,
              `- P0 evaluator-only false issues: ${p0EvaluatorFalseIssues}/${p0.length}`,
              `- P1 evaluator-only issue recall: ${p1EvaluatorIssues}/${p1.length} (${percent(p1EvaluatorIssues, p1.length)})`,
              `- P1 evaluator-only IssueType accuracy: ${p1IssueTypesCorrect}/${p1.length} (${percent(p1IssueTypesCorrect, p1.length)})`,
              `- P1 Arbiter recall with Oracle-complete context (diagnostic only): ${p1OracleContextArbiterGates}/${p1.length} (${percent(p1OracleContextArbiterGates, p1.length)})`,
              `- P1 Current Product Gate Recall release bar: ${p1CorrectGates}/${p1.length} (${percent(p1CorrectGates, p1.length)}) — ${p1Pass ? "PASS" : "FAIL"}`,
            ]),
        `- Recovered structured-output retries: ${recoveredStructuredOutputRetries.length}/${records.length}; unrecovered schema failures: ${records.filter(({ validatedEvaluatorResult }) => !validatedEvaluatorResult.ok && validatedEvaluatorResult.error.code === "INVALID_STRUCTURED_OUTPUT").length}`,
        `- Recovered retry cases: ${[...new Set(recoveredStructuredOutputRetries.map(({ caseId }) => caseId))].join(", ") || "none"}`,
        `- Unstable cases: ${unstable.length === 0 ? "none" : unstable.join(", ")}`,
        `- Stage 9 recommendation: ${recommendStage9 === null ? "NOT RECOMPUTED (focus prerequisite passed)" : recommendStage9 ? "YES" : "NO"}`,
        "",
        qwenMode === "focus"
          ? "## Focused First Pass (G07/G08/G11/G12/G19)"
          : "## G01–G20 First Pass",
        "",
        firstPassTable(firstPass),
        "",
        ...(qwenMode === "focus"
          ? [
              "## Focused Regression Stability",
              "",
              stabilityTable(
                focusedStabilityRecords,
                focusedRegressionCaseIds,
              ),
              "",
            ]
          : []),
        ...(qwenMode === "full-once"
          ? []
          : [
              "## P0 Stability",
              "",
              stabilityTable(p0, p0FalseGateCaseIds),
              "",
              "## P1 Stability",
              "",
              stabilityTable(p1, p1ClearGateCaseIds),
              "",
            ]),
        "## Failure Classification",
        "",
        "```json",
        JSON.stringify(failureSummary, null, 2),
        "```",
        "",
        "## Runtime Replay Semantics",
        "",
        "- ANSWER records are completed through the product FINAL path. A FINAL issue is persistence-satisfied after the current FINAL context check.",
        "- CHECKPOINT records remain INTERIM. One INTERIM issue becomes a candidate and cannot Hard Gate without the same issue on a newer checkpoint.",
        "- Product replay uses the captured evaluator semantics with the actual product checkpoint identity; raw provider output remains unchanged in the record.",
        "",
        "## First-pass Failure Raw Structured Outputs",
        "",
        rawFailureSections(firstPassFailures),
        "",
        "Full raw outputs for all first-pass and stability runs are retained in the JSON report.",
        "",
      ].join("\n");

      await persistJson(records, "COMPLETE");
      await writeFile(
        markdownReportPath,
        redactConfiguredApiKey(markdown),
        "utf8",
      );

      const expectedFirstPassCaseIds =
        qwenMode === "focus"
          ? focusedRegressionCaseIds
          : goldenSemanticCases.map(({ id }) => id);
      expect(firstPass.map(({ caseId }) => caseId)).toEqual(
        expectedFirstPassCaseIds,
      );
      const expectedStabilityMultiplier =
        qwenMode === "full-once" ? 0 : stabilityRunsPerCase;
      expect(p0).toHaveLength(
        p0FalseGateCaseIds.length * expectedStabilityMultiplier,
      );
      expect(p1).toHaveLength(
        p1ClearGateCaseIds.length * expectedStabilityMultiplier,
      );
      if (qwenMode === "focus") {
        for (const caseId of focusedRegressionCaseIds) {
          expect(
            focusedStabilityRecords.filter(
              ({ caseId: observedCaseId }) => observedCaseId === caseId,
            ),
            `${caseId} requires at least three focused stability observations`,
          ).toHaveLength(stabilityRunsPerCase);
        }
      }
      if (qwenMode !== "full-once") {
        expect(releaseAssessment).not.toBeNull();
        expect(p0FalseGates, "P0 requires zero false Hard Gates").toBe(0);
        expect(
          p1Recall,
          "P1 clear-gate product recall must be at least 90%",
        ).toBeGreaterThanOrEqual(0.9);
      }
    },
    30 * 60_000,
  );
});
