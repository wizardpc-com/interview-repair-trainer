import { describe, expect, it, vi } from "vitest";
import type { QuestionPlan } from "../../src/domain/interview/contracts";
import {
  createCheckpoint,
  InterviewRuntimeError,
  isCheckpointStale,
  type CheckpointHeuristic,
  type CheckpointKind,
  type SemanticGateHeuristic,
} from "../../src/domain/interview/runtime";
import type {
  GateCriterion,
  GateIssueType,
  SemanticCheckResult,
} from "../../src/domain/semantic/contracts";
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
      description:
        "A specific action, decision, implementation, or analysis performed by the candidate.",
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
        "A result that was actually observed, or a clear statement that no reliable result was measured.",
    },
    {
      id: "validation-method",
      description:
        "How an observation was checked, or a clear statement that it was not reliably validated.",
    },
  ],
  optionalEvidence: [],
  allowedGateIssueTypes: [
    "NOT_ANSWERING_QUESTION",
    "VAGUE_WITHOUT_EVIDENCE",
  ],
};

type Evaluator = (
  input: EvaluateSemanticCheckpointInput,
) => Promise<LlmResult<SemanticCheckResult>>;

function continueResult(
  input: EvaluateSemanticCheckpointInput,
): SemanticCheckResult {
  return {
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
  };
}

function issueResult(
  input: EvaluateSemanticCheckpointInput,
  issueType: GateIssueType,
  triggeringCriterion: GateCriterion,
  overrides: Partial<
    Pick<SemanticCheckResult, "confidence" | "gateability" | "answerBoundary">
  > = {},
): SemanticCheckResult {
  return {
    questionId: input.questionPlan.id,
    checkpointVersion: input.checkpointVersion,
    confidence: 0.95,
    gateability: "GATE_ELIGIBLE",
    answerBoundary: "NONE",
    decision: "ISSUE_DETECTED",
    issueType,
    triggeringCriterion,
    issueExplanation: "The answer persistently misses the requested criterion.",
    repairCue: "Address the requested criterion directly.",
    ...overrides,
  };
}

function successfulEvaluator(
  createResult: (input: EvaluateSemanticCheckpointInput) => SemanticCheckResult,
): Evaluator {
  return async (input) => ({ ok: true, value: createResult(input) });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function createHarness(
  plan: QuestionPlan,
  evaluator: Evaluator,
  options: Readonly<{
    transcript?: string;
    checkpointKind?: CheckpointKind;
    checkpointHeuristic?: Partial<CheckpointHeuristic>;
    semanticGateHeuristic?: Partial<SemanticGateHeuristic>;
  }> = {},
) {
  let now = 1_000;
  const store = new InMemoryInterviewSessionStore({
    ttlMs: 60_000,
    now: () => now,
    idFactory: () => `session-${plan.id}`,
  });
  const session = store.create({
    projectContext: "A private project context used by the evaluator.",
    scenario: { id: phaseOneScenario.id, version: phaseOneScenario.version },
    questionPlans: [plan],
  });
  const evaluateSemanticCheckpoint = vi.fn(evaluator);
  const llmService: LlmService = {
    model: "fake-single-model",
    async generateQuestionPlan() {
      return { ok: true, value: plan };
    },
    evaluateSemanticCheckpoint,
  };
  const semanticGateHeuristic: SemanticGateHeuristic = {
    minContextCharacters: 1,
    minContextDurationMs: 0,
    minConfidence: 0.8,
    ...options.semanticGateHeuristic,
  };
  const service = new InterviewRuntimeService(store, llmService, {
    now: () => now,
    checkpointHeuristic: {
      minTranscriptCharacters: 1,
      minAnswerDurationMs: 0,
      minCheckpointIntervalMs: 0,
      ...options.checkpointHeuristic,
    },
    semanticGateHeuristic,
  });

  service.start(session.sessionId);
  now = 11_000;
  const transcript =
    options.transcript ?? "我先完整说明当前回答中与问题相关的事实和理由。";
  let checkpointed = service.updateTranscript(session.sessionId, transcript, 1);
  if ((options.checkpointKind ?? "FINAL") === "FINAL") {
    const stored = store.get(session.sessionId);
    if (stored === null) {
      throw new Error("Test harness lost its session");
    }
    const finalCheckpoint = createCheckpoint(stored.runtime, now, "FINAL");
    store.updateRuntime(session.sessionId, finalCheckpoint.runtime);
    checkpointed = service.getPublic(session.sessionId);
  }
  const checkpoint = store.get(session.sessionId)?.runtime.questions[0]
    .latestCheckpoint;
  if (checkpoint === null || checkpoint === undefined) {
    throw new Error("Test harness failed to create a semantic checkpoint");
  }
  const identity: CheckpointIdentity = {
    questionId: checkpoint.questionId,
    answerVersion: checkpoint.answerVersion,
    checkpointVersion: checkpoint.checkpointVersion,
  };

  return {
    checkpoint,
    checkpointed,
    evaluateSemanticCheckpoint,
    identity,
    service,
    sessionId: session.sessionId,
    setNow(value: number) {
      now = value;
    },
    store,
    transcript,
  };
}

describe("semantic evaluator orchestration", () => {
  it("keeps a normal answer in ANSWERING after a validated CONTINUE", async () => {
    const harness = createHarness(
      whyPlan,
      successfulEvaluator(continueResult),
    );

    const runtime = await harness.service.evaluateCheckpoint(
      harness.sessionId,
      harness.identity,
    );

    expect(runtime).toMatchObject({ state: "ANSWERING", hardGate: null });
    expect(harness.evaluateSemanticCheckpoint).toHaveBeenCalledOnce();
  });

  it("continues when team context is quickly followed by a personal contribution", async () => {
    const transcript =
      "我们一起确定了实验方向；其中我本人实现了数据清洗管线，设计了异常值规则，并独立完成了结果复核。";
    const harness = createHarness(
      ownershipPlan,
      successfulEvaluator(continueResult),
      { transcript },
    );

    const runtime = await harness.service.evaluateCheckpoint(
      harness.sessionId,
      harness.identity,
    );

    expect(runtime).toMatchObject({
      state: "ANSWERING",
      transcript,
      hardGate: null,
    });
  });

  it.each([
    {
      name: "why question answered only with what",
      plan: whyPlan,
      transcript:
        "我们使用了卡尔曼滤波。它会维护状态向量和协方差矩阵，然后循环执行预测与更新。",
      issueType: "NOT_ANSWERING_QUESTION" as const,
      criterion: { kind: "PRIMARY_TARGET", id: "technical-reasoning" } as const,
      expectedWhy: "当前问题问的是为什么选择它",
    },
    {
      name: "personal contribution answered only with we",
      plan: ownershipPlan,
      transcript:
        "我们设计了实验，完成了实现，也一起分析了数据，最后由团队整理了全部结论。",
      issueType: "OWNERSHIP_AMBIGUOUS" as const,
      criterion: { kind: "REQUIRED_EVIDENCE", id: "personal-action" } as const,
      expectedWhy: "还没有说明你本人完成了什么",
    },
    {
      name: "explicit result request answered vaguely",
      plan: resultPlan,
      transcript:
        "调整之后效果提升了很多，整体表现明显更好，所以我们认为这次修改是成功的。",
      issueType: "VAGUE_WITHOUT_EVIDENCE" as const,
      criterion: { kind: "REQUIRED_EVIDENCE", id: "observed-result" } as const,
      expectedWhy: "只给出了笼统结论",
    },
  ])("gates a persistent $name", async (fixture) => {
    const harness = createHarness(
      fixture.plan,
      successfulEvaluator((input) =>
        issueResult(input, fixture.issueType, fixture.criterion),
      ),
      { transcript: fixture.transcript },
    );

    const runtime = await harness.service.evaluateCheckpoint(
      harness.sessionId,
      harness.identity,
    );

    expect(runtime.state).toBe("REPAIR");
    expect(runtime.hardGate).toMatchObject({
      status: "GATE_PENDING",
      originalAnswer: fixture.transcript,
    });
    expect(runtime.hardGate?.whyPaused).toContain(fixture.expectedWhy);
  });

  it("lets a FINAL issue reach the Arbiter without interim timing thresholds", async () => {
    const harness = createHarness(
      whyPlan,
      successfulEvaluator((input) =>
        issueResult(input, "NOT_ANSWERING_QUESTION", {
          kind: "PRIMARY_TARGET",
          id: "technical-reasoning",
        }),
      ),
      {
        transcript: "我只介绍了这个方法的定义和工作步骤，没有解释选择理由。",
        checkpointKind: "FINAL",
        checkpointHeuristic: {
          minTranscriptCharacters: 10_000,
          minAnswerDurationMs: 60_000,
          minCheckpointIntervalMs: 60_000,
        },
        semanticGateHeuristic: {
          minContextCharacters: 10_000,
          minContextDurationMs: 60_000,
        },
      },
    );

    expect(harness.checkpoint.kind).toBe("FINAL");
    await expect(
      harness.service.evaluateCheckpoint(harness.sessionId, harness.identity),
    ).resolves.toMatchObject({ state: "REPAIR" });
    expect(harness.evaluateSemanticCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({ checkpointKind: "FINAL" }),
    );
  });

  it("requires the same issue on a newer stable INTERIM checkpoint", async () => {
    const evaluator = successfulEvaluator((input) =>
      issueResult(input, "NOT_ANSWERING_QUESTION", {
        kind: "PRIMARY_TARGET",
        id: "technical-reasoning",
      }),
    );
    const harness = createHarness(whyPlan, evaluator, {
      transcript: "我先介绍这个方法是什么，以及它按哪些步骤工作。",
      checkpointKind: "INTERIM",
    });

    const first = await harness.service.evaluateCheckpoint(
      harness.sessionId,
      harness.identity,
    );
    expect(harness.evaluateSemanticCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({ checkpointKind: "INTERIM" }),
    );
    const firstQuestion = harness.store.get(harness.sessionId)?.runtime.questions[0];
    expect(first).toMatchObject({ state: "ANSWERING", hardGate: null });
    expect(firstQuestion?.semanticIssueCandidate).toMatchObject({
      issueType: "NOT_ANSWERING_QUESTION",
      answerVersion: harness.identity.answerVersion,
      checkpointVersion: harness.identity.checkpointVersion,
    });

    harness.setNow(20_000);
    const secondSnapshot = harness.service.updateTranscript(
      harness.sessionId,
      `${harness.transcript}我继续说明它的输入、输出和执行流程。`,
      1,
    );
    const secondCheckpoint = harness.store.get(harness.sessionId)?.runtime.questions[0]
      .latestCheckpoint;
    if (secondCheckpoint === null || secondCheckpoint === undefined) {
      throw new Error("Expected a newer INTERIM checkpoint");
    }

    expect(secondSnapshot.checkpoint?.kind).toBe("INTERIM");
    const gated = await harness.service.evaluateCheckpoint(harness.sessionId, {
      questionId: secondCheckpoint.questionId,
      answerVersion: secondCheckpoint.answerVersion,
      checkpointVersion: secondCheckpoint.checkpointVersion,
    });
    expect(gated.state).toBe("REPAIR");
    expect(harness.evaluateSemanticCheckpoint).toHaveBeenCalledTimes(2);
  });

  it("fails open for insufficient INTERIM context", async () => {
    const harness = createHarness(
      whyPlan,
      successfulEvaluator((input) =>
        issueResult(input, "NOT_ANSWERING_QUESTION", {
          kind: "PRIMARY_TARGET",
          id: "technical-reasoning",
        }),
      ),
      {
        transcript: "这只是尚未展开的一小段回答。",
        checkpointKind: "INTERIM",
        semanticGateHeuristic: {
          minContextCharacters: 200,
        },
      },
    );

    const runtime = await harness.service.evaluateCheckpoint(
      harness.sessionId,
      harness.identity,
    );

    expect(runtime).toMatchObject({ state: "ANSWERING", hardGate: null });
    expect(
      harness.store.get(harness.sessionId)?.runtime.questions[0]
        .semanticIssueCandidate,
    ).toBeNull();
  });

  it.each([
    {
      name: "low confidence",
      overrides: { confidence: 0.79 } as const,
    },
    {
      name: "upstream uncertainty",
      overrides: { gateability: "UNCERTAIN" } as const,
    },
  ])("fails open for $name", async ({ overrides }) => {
    const harness = createHarness(
      ownershipPlan,
      successfulEvaluator((input) =>
        issueResult(
          input,
          "OWNERSHIP_AMBIGUOUS",
          { kind: "REQUIRED_EVIDENCE", id: "personal-action" },
          overrides,
        ),
      ),
    );

    const runtime = await harness.service.evaluateCheckpoint(
      harness.sessionId,
      harness.identity,
    );

    expect(runtime).toMatchObject({ state: "ANSWERING", hardGate: null });
  });

  it("does not gate an explicit honest no-measurement boundary", async () => {
    const transcript =
      "当时没有进行可靠测量，因此我不能声称性能真的提升；现有观察只适合作为后续实验假设。";
    const harness = createHarness(
      resultPlan,
      successfulEvaluator((input) =>
        issueResult(
          input,
          "VAGUE_WITHOUT_EVIDENCE",
          { kind: "REQUIRED_EVIDENCE", id: "observed-result" },
          { answerBoundary: "HONEST_NO_MEASUREMENT" },
        ),
      ),
      { transcript },
    );

    const runtime = await harness.service.evaluateCheckpoint(
      harness.sessionId,
      harness.identity,
    );

    expect(runtime).toMatchObject({
      state: "ANSWERING",
      transcript,
      hardGate: null,
    });
  });

  it("does not gate when the frozen surface question lacks canonical support", async () => {
    const unsupportedPlan: QuestionPlan = {
      ...whyPlan,
      surfaceQuestion: "请介绍你选择的技术方案。",
    };
    const harness = createHarness(
      unsupportedPlan,
      successfulEvaluator((input) =>
        issueResult(input, "NOT_ANSWERING_QUESTION", {
          kind: "REQUIRED_EVIDENCE",
          id: "decision-rationale",
        }),
      ),
    );

    const runtime = await harness.service.evaluateCheckpoint(
      harness.sessionId,
      harness.identity,
    );

    expect(runtime).toMatchObject({ state: "ANSWERING", hardGate: null });
  });

  it.each(["PROVIDER_ERROR", "INVALID_STRUCTURED_OUTPUT"] as const)(
    "fails open for %s",
    async (code) => {
      const harness = createHarness(whyPlan, async () => ({
        ok: false,
        error: {
          code,
          message: "Evaluator unavailable",
          attempts: code === "PROVIDER_ERROR" ? 1 : 2,
        },
      }));

      const runtime = await harness.service.evaluateCheckpoint(
        harness.sessionId,
        harness.identity,
      );

      expect(runtime).toMatchObject({ state: "ANSWERING", hardGate: null });
    },
  );

  it("single-flights concurrent requests for the same checkpoint", async () => {
    const pending = deferred<LlmResult<SemanticCheckResult>>();
    const harness = createHarness(whyPlan, () => pending.promise);

    const first = harness.service.evaluateCheckpoint(
      harness.sessionId,
      harness.identity,
    );
    const second = harness.service.evaluateCheckpoint(
      harness.sessionId,
      harness.identity,
    );

    expect(first).toBe(second);
    expect(harness.evaluateSemanticCheckpoint).toHaveBeenCalledOnce();
    const input = harness.evaluateSemanticCheckpoint.mock.calls[0]?.[0];
    if (input === undefined) {
      throw new Error("Evaluator was not called");
    }
    pending.resolve({ ok: true, value: continueResult(input) });

    await expect(first).resolves.toMatchObject({ state: "ANSWERING" });
    await expect(second).resolves.toMatchObject({ state: "ANSWERING" });
  });

  it("waits for an in-flight INTERIM evaluation before forcing FINAL completion", async () => {
    const pending = deferred<LlmResult<SemanticCheckResult>>();
    let callCount = 0;
    const harness = createHarness(
      whyPlan,
      async (input) => {
        callCount += 1;
        return callCount === 1
          ? pending.promise
          : { ok: true, value: continueResult(input) };
      },
      { checkpointKind: "INTERIM" },
    );

    const interimEvaluation = harness.service.evaluateCheckpoint(
      harness.sessionId,
      harness.identity,
    );
    const completion = harness.service.complete(harness.sessionId);

    expect(harness.evaluateSemanticCheckpoint).toHaveBeenCalledOnce();
    const interimInput = harness.evaluateSemanticCheckpoint.mock.calls[0]?.[0];
    if (interimInput === undefined) {
      throw new Error("Expected the INTERIM evaluator input");
    }
    pending.resolve({ ok: true, value: continueResult(interimInput) });

    await expect(interimEvaluation).resolves.toMatchObject({
      state: "ANSWERING",
    });
    const done = await completion;
    expect(done).toMatchObject({ state: "QUESTION_DONE" });
    expect(done.checkpoint).toMatchObject({
      kind: "FINAL",
      freshness: "STALE",
    });
    expect(harness.evaluateSemanticCheckpoint).toHaveBeenCalledTimes(2);
    expect(harness.evaluateSemanticCheckpoint.mock.calls[1]?.[0]).toMatchObject({
      checkpointKind: "FINAL",
    });
  });

  it("single-flights duplicate completion across INTERIM and FINAL evaluation", async () => {
    const pendingInterim = deferred<LlmResult<SemanticCheckResult>>();
    const pendingFinal = deferred<LlmResult<SemanticCheckResult>>();
    let callCount = 0;
    const harness = createHarness(
      whyPlan,
      async () => {
        callCount += 1;
        return callCount === 1 ? pendingInterim.promise : pendingFinal.promise;
      },
      {
        transcript: "我只说明了方法的定义、输入和执行步骤，没有给出选择理由。",
        checkpointKind: "INTERIM",
      },
    );

    const interimEvaluation = harness.service.evaluateCheckpoint(
      harness.sessionId,
      harness.identity,
    );
    const firstCompletion = harness.service.complete(harness.sessionId);
    const secondCompletion = harness.service.complete(harness.sessionId);

    expect(firstCompletion).toBe(secondCompletion);
    const interimInput = harness.evaluateSemanticCheckpoint.mock.calls[0]?.[0];
    if (interimInput === undefined) {
      throw new Error("Expected the INTERIM evaluator input");
    }
    pendingInterim.resolve({ ok: true, value: continueResult(interimInput) });
    await expect(interimEvaluation).resolves.toMatchObject({
      state: "ANSWERING",
    });
    await vi.waitFor(() => {
      expect(harness.evaluateSemanticCheckpoint).toHaveBeenCalledTimes(2);
    });

    expect(harness.service.getPublic(harness.sessionId).state).toBe("ANSWERING");
    const finalInput = harness.evaluateSemanticCheckpoint.mock.calls[1]?.[0];
    if (finalInput === undefined) {
      throw new Error("Expected the FINAL evaluator input");
    }
    expect(finalInput.checkpointKind).toBe("FINAL");
    pendingFinal.resolve({
      ok: true,
      value: issueResult(finalInput, "NOT_ANSWERING_QUESTION", {
        kind: "PRIMARY_TARGET",
        id: "technical-reasoning",
      }),
    });

    await expect(firstCompletion).resolves.toMatchObject({ state: "REPAIR" });
    await expect(secondCompletion).resolves.toMatchObject({ state: "REPAIR" });
    expect(harness.evaluateSemanticCheckpoint).toHaveBeenCalledTimes(2);
  });

  it("keeps COMPLETE in REPAIR when the forced FINAL checkpoint gates", async () => {
    const harness = createHarness(
      whyPlan,
      successfulEvaluator((input) =>
        issueResult(input, "NOT_ANSWERING_QUESTION", {
          kind: "PRIMARY_TARGET",
          id: "technical-reasoning",
        }),
      ),
      {
        transcript: "我只说明了方法的定义、输入和执行步骤，没有给出选择理由。",
        checkpointKind: "INTERIM",
      },
    );

    const gated = await harness.service.complete(harness.sessionId);

    expect(gated).toMatchObject({ state: "REPAIR" });
    expect(harness.evaluateSemanticCheckpoint).toHaveBeenCalledOnce();
    expect(harness.evaluateSemanticCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({ checkpointKind: "FINAL" }),
    );
  });

  it("discards an in-flight result after a newer transcript version arrives", async () => {
    const pending = deferred<LlmResult<SemanticCheckResult>>();
    const harness = createHarness(whyPlan, () => pending.promise);
    const evaluation = harness.service.evaluateCheckpoint(
      harness.sessionId,
      harness.identity,
    );

    const revisedTranscript = `${harness.transcript}我随后补充了真正的选择理由。`;
    const revised = harness.service.updateTranscript(
      harness.sessionId,
      revisedTranscript,
      1,
    );
    expect(revised.answerVersion).toBe(harness.identity.answerVersion + 1);
    const input = harness.evaluateSemanticCheckpoint.mock.calls[0]?.[0];
    if (input === undefined) {
      throw new Error("Evaluator was not called");
    }
    pending.resolve({
      ok: true,
      value: issueResult(input, "NOT_ANSWERING_QUESTION", {
        kind: "PRIMARY_TARGET",
        id: "technical-reasoning",
      }),
    });

    const runtime = await evaluation;
    expect(runtime).toMatchObject({
      state: "ANSWERING",
      transcript: revisedTranscript,
      answerVersion: revised.answerVersion,
      hardGate: null,
    });
  });

  it("freezes the answer and permanently invalidates the triggering checkpoint", async () => {
    const harness = createHarness(
      ownershipPlan,
      successfulEvaluator((input) =>
        issueResult(input, "OWNERSHIP_AMBIGUOUS", {
          kind: "REQUIRED_EVIDENCE",
          id: "personal-action",
        }),
      ),
      { transcript: "我们一起完成了所有设计、实现和分析工作。" },
    );

    const gated = await harness.service.evaluateCheckpoint(
      harness.sessionId,
      harness.identity,
    );
    const stored = harness.store.get(harness.sessionId)?.runtime;
    const question = stored?.questions[0];

    expect(gated.state).toBe("REPAIR");
    expect(question).toMatchObject({
      state: "REPAIR",
      gateCount: 1,
      transcript: harness.transcript,
      originalAnswer: harness.transcript,
      latestCheckpoint: null,
    });
    expect(stored === undefined ? false : isCheckpointStale(harness.checkpoint, stored))
      .toBe(true);
    expect(() =>
      harness.service.updateTranscript(
        harness.sessionId,
        `${harness.transcript}不应继续追加`,
        1,
      ),
    ).toThrow(InterviewRuntimeError);

    const oldResult = await harness.service.evaluateCheckpoint(
      harness.sessionId,
      harness.identity,
    );
    expect(oldResult.state).toBe("REPAIR");
    expect(harness.evaluateSemanticCheckpoint).toHaveBeenCalledOnce();
  });

  it("restores ANSWERING on override while consuming the only gate", async () => {
    const harness = createHarness(
      whyPlan,
      successfulEvaluator((input) =>
        issueResult(input, "NOT_ANSWERING_QUESTION", {
          kind: "PRIMARY_TARGET",
          id: "technical-reasoning",
        }),
      ),
    );
    await harness.service.evaluateCheckpoint(harness.sessionId, harness.identity);

    const resumed = harness.service.overrideGate(harness.sessionId);
    const revised = harness.service.updateTranscript(
      harness.sessionId,
      `${harness.transcript}我认为需要继续补充。`,
      1,
    );
    const question = harness.store.get(harness.sessionId)?.runtime.questions[0];

    expect(resumed).toMatchObject({ state: "ANSWERING", hardGate: null });
    expect(revised.checkpoint).toBeNull();
    expect(question).toMatchObject({
      state: "ANSWERING",
      gateCount: 1,
      originalAnswer: harness.transcript,
    });
    expect(question?.gateOverride).not.toBeNull();

    await harness.service.evaluateCheckpoint(harness.sessionId, harness.identity);
    expect(harness.evaluateSemanticCheckpoint).toHaveBeenCalledOnce();
    expect(harness.service.getPublic(harness.sessionId).state).toBe("ANSWERING");
  });

  it("starts an independent re-answer without losing the frozen original answer", async () => {
    const harness = createHarness(
      resultPlan,
      successfulEvaluator((input) =>
        issueResult(input, "VAGUE_WITHOUT_EVIDENCE", {
          kind: "REQUIRED_EVIDENCE",
          id: "observed-result",
        }),
      ),
      { transcript: "结果提升了很多，但我没有给出观察或验证细节。" },
    );
    const frozenPlan = harness.store.get(harness.sessionId)?.questionPlans[0];
    await harness.service.evaluateCheckpoint(harness.sessionId, harness.identity);

    const prepared = harness.service.startReanswer(harness.sessionId);
    const stored = harness.store.get(harness.sessionId);

    expect(prepared).toMatchObject({
      state: "REANSWER",
      transcript: "",
      hardGate: {
        status: "REANSWERING",
        originalAnswer: harness.transcript,
      },
    });
    expect(stored?.runtime.questions[0]).toMatchObject({
      originalAnswer: harness.transcript,
      answerAttempt: 2,
    });
    expect(stored?.questionPlans[0]).toBe(frozenPlan);
    expect(() => harness.service.overrideGate(harness.sessionId)).toThrow(
      InterviewRuntimeError,
    );
  });
});
