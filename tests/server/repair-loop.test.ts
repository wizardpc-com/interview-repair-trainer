import { describe, expect, it, vi } from "vitest";
import type { QuestionPlan } from "../../src/domain/interview/contracts";
import type {
  GateCriterion,
  GateIssueType,
  SemanticCheckResult,
} from "../../src/domain/semantic/contracts";
import type { PublicInterviewRuntimeDto } from "../../src/lib/interview-api-contracts";
import {
  InterviewRuntimeService,
  type CheckpointIdentity,
} from "../../src/server/interview-runtime-service";
import { phaseOneScenario } from "../../src/server/phase-one-scenario";
import { InMemoryInterviewSessionStore } from "../../src/server/session-store";
import type {
  EvaluateSemanticCheckpointInput,
  LlmResult,
  LlmService,
} from "../../src/services/llm/llm-service";

const whyPlan: QuestionPlan = {
  id: "technical-choice",
  surfaceQuestion: "你选择了哪项重要的技术方案？为什么这样选择？",
  primaryTarget: {
    id: "technical-reasoning",
    description: "Explain a technical choice and the reasoning behind it.",
  },
  requiredEvidence: [
    {
      id: "decision-rationale",
      description: "Reasoning or tradeoffs behind a technical choice.",
    },
  ],
  optionalEvidence: [
    {
      id: "technical-detail",
      description: "A concrete technical detail that clarifies the work.",
    },
  ],
  allowedGateIssueTypes: [
    "NOT_ANSWERING_QUESTION",
    "VAGUE_WITHOUT_EVIDENCE",
  ],
};

const ownershipPlan: QuestionPlan = {
  id: "personal-contribution",
  surfaceQuestion: "在这个项目中，哪些设计、实现、分析或决策是由你本人完成的？",
  primaryTarget: {
    id: "personal-ownership",
    description: "Separate the candidate's own contribution from team activity.",
  },
  requiredEvidence: [
    {
      id: "personal-action",
      description: "A concrete action performed by the candidate.",
    },
  ],
  optionalEvidence: [
    {
      id: "team-context",
      description: "Context about collaborators or team responsibilities.",
    },
  ],
  allowedGateIssueTypes: [
    "NOT_ANSWERING_QUESTION",
    "OWNERSHIP_AMBIGUOUS",
  ],
};

const resultPlan: QuestionPlan = {
  id: "results-and-validation",
  surfaceQuestion: "你实际观察到了什么结果？你是如何验证这个结果的？",
  primaryTarget: {
    id: "evidence-based-result",
    description: "Describe an observed result and how it was validated.",
  },
  requiredEvidence: [
    {
      id: "observed-result",
      description:
        "A result that was observed, or a clear statement that none was reliably measured.",
    },
    {
      id: "validation-method",
      description:
        "How the result was checked, or a clear statement that it was not reliably validated.",
    },
  ],
  optionalEvidence: [
    {
      id: "technical-detail",
      description: "A useful but non-required implementation detail.",
    },
  ],
  allowedGateIssueTypes: [
    "NOT_ANSWERING_QUESTION",
    "VAGUE_WITHOUT_EVIDENCE",
  ],
};

type Evaluation = (
  input: EvaluateSemanticCheckpointInput,
) =>
  | LlmResult<SemanticCheckResult>
  | Promise<LlmResult<SemanticCheckResult>>;
type ImmediateEvaluation = (
  input: EvaluateSemanticCheckpointInput,
) => LlmResult<SemanticCheckResult>;

function continueEvaluation(
  overrides: Partial<
    Pick<SemanticCheckResult, "confidence" | "gateability" | "answerBoundary">
  > = {},
): ImmediateEvaluation {
  return (input) => ({
    ok: true,
    value: {
      questionId: input.questionPlan.id,
      checkpointVersion: input.checkpointVersion,
      confidence: 0.95,
      gateability: "GATE_ELIGIBLE",
      answerBoundary: "NONE",
      decision: "CONTINUE",
      issueType: null,
      triggeringCriterion: null,
      issueExplanation: null,
      repairCue: null,
      ...overrides,
    },
  });
}

function issueEvaluation(
  issueType: GateIssueType,
  triggeringCriterion: GateCriterion,
  overrides: Partial<
    Pick<SemanticCheckResult, "confidence" | "gateability" | "answerBoundary">
  > = {},
): ImmediateEvaluation {
  return (input) => ({
    ok: true,
    value: {
      questionId: input.questionPlan.id,
      checkpointVersion: input.checkpointVersion,
      confidence: 0.95,
      gateability: "GATE_ELIGIBLE",
      answerBoundary: "NONE",
      decision: "ISSUE_DETECTED",
      issueType,
      triggeringCriterion,
      issueExplanation: "A frozen-plan criterion is not yet satisfied.",
      repairCue: "Address that criterion directly.",
      ...overrides,
    },
  });
}

function errorEvaluation(
  code: "PROVIDER_ERROR" | "INVALID_STRUCTURED_OUTPUT",
): ImmediateEvaluation {
  return () => ({
    ok: false,
    error: {
      code,
      message: "Evaluator unavailable",
      attempts: code === "INVALID_STRUCTURED_OUTPUT" ? 2 : 1,
    },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function createHarness(plan: QuestionPlan, evaluations: readonly Evaluation[]) {
  let now = 1_000;
  let evaluationIndex = 0;
  const store = new InMemoryInterviewSessionStore({
    ttlMs: 60_000,
    now: () => now,
    idFactory: () => `repair-${plan.id}`,
  });
  const session = store.create({
    projectContext: "Private project context for semantic evaluation.",
    scenario: { id: phaseOneScenario.id, version: phaseOneScenario.version },
    questionPlans: [plan],
  });
  const generateQuestionPlan = vi.fn<LlmService["generateQuestionPlan"]>();
  const evaluateSemanticCheckpoint = vi.fn<
    LlmService["evaluateSemanticCheckpoint"]
  >(async (input) => {
    const evaluation = evaluations[evaluationIndex++];
    if (evaluation === undefined) {
      throw new Error("Unexpected evaluator call");
    }
    return evaluation(input);
  });
  const llmService: LlmService = {
    model: "fake-single-model",
    generateQuestionPlan,
    evaluateSemanticCheckpoint,
  };
  const service = new InterviewRuntimeService(store, llmService, {
    now: () => now,
    checkpointHeuristic: {
      minTranscriptCharacters: 1,
      minAnswerDurationMs: 0,
      minCheckpointIntervalMs: 0,
    },
    semanticGateHeuristic: {
      minContextCharacters: 1,
      minContextDurationMs: 0,
      minConfidence: 0.8,
    },
  });

  return {
    evaluateSemanticCheckpoint,
    generateQuestionPlan,
    service,
    sessionId: session.sessionId,
    setNow(value: number) {
      now = value;
    },
    store,
  };
}

async function enterRepair(
  harness: ReturnType<typeof createHarness>,
  originalAnswer: string,
): Promise<CheckpointIdentity> {
  harness.service.start(harness.sessionId);
  harness.setNow(11_000);
  harness.service.updateTranscript(harness.sessionId, originalAnswer, 1);
  const checkpoint = harness.store.get(harness.sessionId)?.runtime.questions[0]
    .latestCheckpoint;
  if (checkpoint === null || checkpoint === undefined) {
    throw new Error("Expected initial semantic checkpoint");
  }
  const identity = {
    questionId: checkpoint.questionId,
    answerVersion: checkpoint.answerVersion,
    checkpointVersion: checkpoint.checkpointVersion,
  };
  const gated = await harness.service.complete(harness.sessionId);
  expect(gated.state).toBe("REPAIR");
  return identity;
}

const repairCases = [
  {
    name: "R01 NOT becomes successful",
    plan: whyPlan,
    before: issueEvaluation("NOT_ANSWERING_QUESTION", {
      kind: "PRIMARY_TARGET",
      id: "technical-reasoning",
    }),
    after: continueEvaluation(),
    repairedAnswer: "因为资源受限，我选择这个方案来降低延迟。",
    expected: "SUCCESSFUL" as const,
  },
  {
    name: "R02 OWNERSHIP becomes successful",
    plan: ownershipPlan,
    before: issueEvaluation("OWNERSHIP_AMBIGUOUS", {
      kind: "REQUIRED_EVIDENCE",
      id: "personal-action",
    }),
    after: continueEvaluation(),
    repairedAnswer: "我本人实现了数据清洗并独立复核了结果。",
    expected: "SUCCESSFUL" as const,
  },
  {
    name: "R03 honest measurement boundary becomes successful",
    plan: resultPlan,
    before: issueEvaluation("VAGUE_WITHOUT_EVIDENCE", {
      kind: "REQUIRED_EVIDENCE",
      id: "observed-result",
    }),
    after: issueEvaluation(
      "VAGUE_WITHOUT_EVIDENCE",
      { kind: "REQUIRED_EVIDENCE", id: "observed-result" },
      { answerBoundary: "HONEST_NO_MEASUREMENT" },
    ),
    repairedAnswer: "当时没有可靠测量，因此我不能声称性能提升。",
    expected: "SUCCESSFUL" as const,
  },
  {
    name: "R04 answer remains off-target",
    plan: whyPlan,
    before: issueEvaluation("NOT_ANSWERING_QUESTION", {
      kind: "PRIMARY_TARGET",
      id: "technical-reasoning",
    }),
    after: issueEvaluation("VAGUE_WITHOUT_EVIDENCE", {
      kind: "PRIMARY_TARGET",
      id: "technical-reasoning",
    }),
    repairedAnswer: "还是只描述方案。",
    expected: "UNRESOLVED" as const,
  },
  {
    name: "R05 ownership remains ambiguous",
    plan: ownershipPlan,
    before: issueEvaluation("OWNERSHIP_AMBIGUOUS", {
      kind: "REQUIRED_EVIDENCE",
      id: "personal-action",
    }),
    after: issueEvaluation("OWNERSHIP_AMBIGUOUS", {
      kind: "REQUIRED_EVIDENCE",
      id: "personal-action",
    }),
    repairedAnswer: "团队一起完成。",
    expected: "UNRESOLVED" as const,
  },
  {
    name: "R06 required evidence remains absent",
    plan: resultPlan,
    before: issueEvaluation("VAGUE_WITHOUT_EVIDENCE", {
      kind: "REQUIRED_EVIDENCE",
      id: "observed-result",
    }),
    after: issueEvaluation("VAGUE_WITHOUT_EVIDENCE", {
      kind: "REQUIRED_EVIDENCE",
      id: "validation-method",
    }),
    repairedAnswer: "效果还是很好。",
    expected: "UNRESOLVED" as const,
  },
];

describe("repair and re-answer orchestration", () => {
  it.each(repairCases)(
    "records $name against the same frozen QuestionPlan",
    async ({ plan, before, after, repairedAnswer, expected }) => {
      const originalAnswer = "这是用于触发首轮检查的原始回答。";
      const harness = createHarness(plan, [before, after]);
      const frozenPlan = harness.store.get(harness.sessionId)?.questionPlans[0];
      await enterRepair(harness, originalAnswer);

      const started = harness.service.startReanswer(harness.sessionId);
      expect(started).toMatchObject({
        state: "REANSWER",
        transcript: "",
        hardGate: {
          status: "REANSWERING",
          originalAnswer,
        },
        repairResult: null,
      });

      harness.service.updateTranscript(harness.sessionId, repairedAnswer, 2);
      const completed = await harness.service.complete(harness.sessionId);
      const stored = harness.store.get(harness.sessionId)?.runtime.questions[0];
      const beforeInput = harness.evaluateSemanticCheckpoint.mock.calls[0]?.[0];
      const afterInput = harness.evaluateSemanticCheckpoint.mock.calls[1]?.[0];

      expect(completed).toMatchObject({
        state: "QUESTION_DONE",
        transcript: repairedAnswer,
        hardGate: null,
        repairResult: {
          status: expected,
          title: expected === "SUCCESSFUL" ? "修复成功" : "仍未解决",
        },
      });
      expect(stored).toMatchObject({
        answerAttempt: 2,
        originalAnswer,
        repairedAnswer,
        gateOverride: null,
        repairOutcome: expected,
      });
      expect(stored?.hardGate?.beforeEvaluation).toMatchObject({
        questionId: plan.id,
        decision: "ISSUE_DETECTED",
        confidence: 0.95,
      });
      expect(stored?.hardGate?.beforeEvaluation.issueType).toBe(
        stored?.hardGate?.issueType,
      );
      expect(stored?.afterEvaluation).toMatchObject({ questionId: plan.id });
      expect(beforeInput?.questionPlan).toBe(frozenPlan);
      expect(afterInput?.questionPlan).toBe(frozenPlan);
      expect(afterInput?.transcript).toBe(repairedAnswer);
      expect(harness.store.get(harness.sessionId)?.questionPlans[0]).toBe(
        frozenPlan,
      );
      expect(harness.generateQuestionPlan).not.toHaveBeenCalled();

      const serialized = JSON.stringify(completed);
      expect(serialized).not.toContain("requiredEvidence");
      expect(serialized).not.toContain("optionalEvidence");
      expect(serialized).not.toContain("confidence");
      expect(serialized).not.toContain("triggeringCriterion");
      expect(serialized).not.toContain("VAGUE_WITHOUT_EVIDENCE");
      expect(serialized).not.toContain("OWNERSHIP_AMBIGUOUS");
      expect(serialized).not.toContain("NOT_ANSWERING_QUESTION");
    },
  );

  it("ignores a delayed transcript write from the original answer attempt", async () => {
    const harness = createHarness(whyPlan, [
      issueEvaluation("NOT_ANSWERING_QUESTION", {
        kind: "PRIMARY_TARGET",
        id: "technical-reasoning",
      }),
    ]);
    await enterRepair(harness, "这是第一轮偏题回答。 ");

    const started = harness.service.startReanswer(harness.sessionId);
    expect(started).toMatchObject({
      state: "REANSWER",
      answerAttempt: 2,
      transcript: "",
    });

    const ignored = harness.service.updateTranscript(
      harness.sessionId,
      "迟到的第一轮转写不应覆盖新回答。",
      1,
    );
    expect(ignored).toMatchObject({
      state: "REANSWER",
      answerAttempt: 2,
      transcript: "",
    });
    expect(
      harness.store.get(harness.sessionId)?.runtime.questions[0],
    ).toMatchObject({ answerAttempt: 2, transcript: "" });
  });

  it("does not let missing optional evidence make a repair unresolved", async () => {
    const optionalCriterion = issueEvaluation("VAGUE_WITHOUT_EVIDENCE", {
      kind: "REQUIRED_EVIDENCE",
      id: "technical-detail",
    });
    const harness = createHarness(resultPlan, [
      issueEvaluation("VAGUE_WITHOUT_EVIDENCE", {
        kind: "REQUIRED_EVIDENCE",
        id: "observed-result",
      }),
      optionalCriterion,
    ]);
    await enterRepair(harness, "原回答缺少明确结果依据。 ");
    harness.service.startReanswer(harness.sessionId);
    harness.service.updateTranscript(
      harness.sessionId,
      "我说明了被明确要求的观察与验证边界，但没有补充可选实现细节。",
      2,
    );

    await expect(harness.service.complete(harness.sessionId)).resolves.toMatchObject({
      state: "QUESTION_DONE",
      repairResult: { status: "SUCCESSFUL", title: "修复成功" },
    });
  });

  it("does not treat missing rationale as repaired by a no-measurement boundary", async () => {
    const vagueRationale = issueEvaluation("VAGUE_WITHOUT_EVIDENCE", {
      kind: "REQUIRED_EVIDENCE",
      id: "decision-rationale",
    });
    const honestButStillMissingRationale = issueEvaluation(
      "VAGUE_WITHOUT_EVIDENCE",
      { kind: "REQUIRED_EVIDENCE", id: "decision-rationale" },
      { answerBoundary: "HONEST_NO_MEASUREMENT" },
    );
    const harness = createHarness(whyPlan, [
      vagueRationale,
      honestButStillMissingRationale,
    ]);
    await enterRepair(harness, "原回答没有说明选择理由。 ");
    harness.service.startReanswer(harness.sessionId);
    harness.service.updateTranscript(
      harness.sessionId,
      "我没有做可靠测量，但仍没有解释为什么选择该方案。",
      2,
    );

    await expect(harness.service.complete(harness.sessionId)).resolves.toMatchObject({
      state: "QUESTION_DONE",
      repairResult: { status: "UNRESOLVED", title: "仍未解决" },
    });
  });

  it.each(["PROVIDER_ERROR", "INVALID_STRUCTURED_OUTPUT"] as const)(
    "keeps a failed %s repair evaluation in REANSWER for retry",
    async (code) => {
      const harness = createHarness(whyPlan, [
        issueEvaluation("NOT_ANSWERING_QUESTION", {
          kind: "PRIMARY_TARGET",
          id: "technical-reasoning",
        }),
        errorEvaluation(code),
        continueEvaluation(),
      ]);
      await enterRepair(harness, "原回答只说明做了什么。 ");
      harness.service.startReanswer(harness.sessionId);
      harness.service.updateTranscript(
        harness.sessionId,
        "补充选择理由供重新评估。",
        2,
      );

      const failed = await harness.service.complete(harness.sessionId);
      const failedStored = harness.store.get(harness.sessionId)?.runtime
        .questions[0];
      expect(failed).toMatchObject({
        state: "REANSWER",
        hardGate: { status: "REANSWERING" },
        repairResult: null,
        checkpoint: { freshness: "CURRENT" },
      });
      expect(failedStored).toMatchObject({
        repairedAnswer: null,
        afterEvaluation: null,
        repairOutcome: null,
      });

      await expect(harness.service.complete(harness.sessionId)).resolves.toMatchObject({
        state: "QUESTION_DONE",
        repairResult: { status: "SUCCESSFUL" },
      });
      const firstRepairInput =
        harness.evaluateSemanticCheckpoint.mock.calls[1]?.[0];
      const retryInput = harness.evaluateSemanticCheckpoint.mock.calls[2]?.[0];
      expect(retryInput?.checkpointVersion).toBe(
        firstRepairInput?.checkpointVersion,
      );
    },
  );

  it("S06 preserves the frozen QuestionPlan after a rejected repair-time rewrite", async () => {
    const harness = createHarness(whyPlan, [
      issueEvaluation("NOT_ANSWERING_QUESTION", {
        kind: "PRIMARY_TARGET",
        id: "technical-reasoning",
      }),
      errorEvaluation("INVALID_STRUCTURED_OUTPUT"),
    ]);
    const frozenPlan = harness.store.get(harness.sessionId)?.questionPlans[0];

    await enterRepair(harness, "原回答只说明了方案是什么。");
    harness.service.startReanswer(harness.sessionId);
    harness.service.updateTranscript(
      harness.sessionId,
      "我补充约束和选择理由，但模型输出试图改写计划。",
      2,
    );

    await expect(harness.service.complete(harness.sessionId)).resolves.toMatchObject({
      state: "REANSWER",
      repairResult: null,
    });
    expect(harness.store.get(harness.sessionId)?.questionPlans[0]).toBe(
      frozenPlan,
    );
    expect(harness.evaluateSemanticCheckpoint.mock.calls[1]?.[0].questionPlan).toBe(
      frozenPlan,
    );
    expect(harness.generateQuestionPlan).not.toHaveBeenCalled();
  });

  it("discards stale initial and re-answer results without changing REANSWER", async () => {
    const staleRepairEvaluation: Evaluation = (input) => {
      const result = continueEvaluation()(input);
      if (!result.ok) {
        return result;
      }
      return {
        ok: true,
        value: {
          ...result.value,
          checkpointVersion: input.checkpointVersion + 1,
        },
      };
    };
    const harness = createHarness(whyPlan, [
      issueEvaluation("NOT_ANSWERING_QUESTION", {
        kind: "PRIMARY_TARGET",
        id: "technical-reasoning",
      }),
      staleRepairEvaluation,
      continueEvaluation(),
    ]);
    const oldIdentity = await enterRepair(
      harness,
      "原回答持续偏离为什么选择这一问题。",
    );
    harness.service.startReanswer(harness.sessionId);
    harness.service.updateTranscript(harness.sessionId, "这次解释选择理由。 ", 2);

    const oldResult = await harness.service.evaluateCheckpoint(
      harness.sessionId,
      oldIdentity,
    );
    expect(oldResult.state).toBe("REANSWER");
    expect(harness.evaluateSemanticCheckpoint).toHaveBeenCalledTimes(1);

    const staleResult = await harness.service.complete(harness.sessionId);
    expect(staleResult).toMatchObject({
      state: "REANSWER",
      repairResult: null,
    });
    expect(
      harness.store.get(harness.sessionId)?.runtime.questions[0],
    ).toMatchObject({ afterEvaluation: null, repairOutcome: null });

    await expect(harness.service.complete(harness.sessionId)).resolves.toMatchObject({
      state: "QUESTION_DONE",
      repairResult: { status: "SUCCESSFUL" },
    });
  });

  it("single-flights duplicate completion for the same re-answer checkpoint", async () => {
    const pending = deferred<LlmResult<SemanticCheckResult>>();
    let repairInput: EvaluateSemanticCheckpointInput | null = null;
    const harness = createHarness(whyPlan, [
      issueEvaluation("NOT_ANSWERING_QUESTION", {
        kind: "PRIMARY_TARGET",
        id: "technical-reasoning",
      }),
      (input) => {
        repairInput = input;
        return pending.promise;
      },
    ]);
    await enterRepair(harness, "原回答只描述了方案。 ");
    harness.service.startReanswer(harness.sessionId);
    harness.service.updateTranscript(
      harness.sessionId,
      "因为约束条件所以选择它。 ",
      2,
    );

    const first = harness.service.complete(harness.sessionId);
    const second = harness.service.complete(harness.sessionId);
    expect(first).toBe(second);
    expect(harness.evaluateSemanticCheckpoint).toHaveBeenCalledTimes(2);
    if (repairInput === null) {
      throw new Error("Repair evaluator was not called");
    }
    pending.resolve(continueEvaluation()(repairInput));

    await expect(first).resolves.toMatchObject({
      state: "QUESTION_DONE",
      repairResult: { status: "SUCCESSFUL" },
    });
  });

  it("records an override, never enters repair, and cannot gate again", async () => {
    const harness = createHarness(whyPlan, [
      issueEvaluation("NOT_ANSWERING_QUESTION", {
        kind: "PRIMARY_TARGET",
        id: "technical-reasoning",
      }),
    ]);
    const identity = await enterRepair(harness, "我认为需要继续补充原回答。 ");

    const resumed = harness.service.overrideGate(harness.sessionId);
    expect(resumed).toMatchObject({
      state: "ANSWERING",
      hardGate: null,
      repairResult: null,
    });
    harness.service.updateTranscript(
      harness.sessionId,
      "我选择判断不合理并继续回答，不进入修复流程。",
      1,
    );
    const ignored = await harness.service.evaluateCheckpoint(
      harness.sessionId,
      identity,
    );
    expect(ignored.state).toBe("ANSWERING");
    expect(harness.evaluateSemanticCheckpoint).toHaveBeenCalledOnce();

    const completed = await harness.service.complete(harness.sessionId);
    const stored = harness.store.get(harness.sessionId)?.runtime.questions[0];
    expect(completed).toMatchObject({
      state: "QUESTION_DONE",
      repairResult: null,
    });
    expect(stored?.gateCount).toBe(1);
    expect(stored?.gateOverride).not.toBeNull();
    expect(stored).toMatchObject({
      repairedAnswer: null,
      afterEvaluation: null,
      repairOutcome: null,
    });
  });
});
