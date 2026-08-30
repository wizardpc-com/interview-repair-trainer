import { describe, expect, it, vi } from "vitest";
import type { QuestionPlan } from "../../src/domain/interview/contracts";
import {
  completeAnswer,
  interruptForHardGate,
  isCheckpointResultStale,
  type HardGateInterruption,
  type InterviewRuntime,
} from "../../src/domain/interview/runtime";
import type { SemanticCheckResult } from "../../src/domain/semantic/contracts";
import {
  InterviewRuntimeService,
  type CheckpointIdentity,
} from "../../src/server/interview-runtime-service";
import { phaseOneScenario } from "../../src/server/phase-one-scenario";
import { InMemoryInterviewSessionStore } from "../../src/server/session-store";
import { QwenLlmService } from "../../src/services/llm/qwen-llm-service";

const technicalChoicePlan: QuestionPlan = {
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

const persistentTranscript =
  "中值滤波会把窗口里的数值排序，再取中间值作为输出。我实现了一个滑动窗口，对每一帧传感器数据依次处理，然后把处理后的数据送进路径规划模块。这个模块包含输入缓冲、窗口更新、排序和输出几个步骤，我还把每一步都封装成了独立函数。至于为什么选择它、当时有什么约束或取舍，我这里没有说明。";

type FetchHandler = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function completionResponse(output: unknown): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(output) } }],
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function issueResult(checkpointVersion: number): SemanticCheckResult {
  return {
    questionId: technicalChoicePlan.id,
    checkpointVersion,
    confidence: 0.99,
    gateability: "GATE_ELIGIBLE",
    answerBoundary: "NONE",
    decision: "ISSUE_DETECTED",
    issueType: "NOT_ANSWERING_QUESTION",
    triggeringCriterion: {
      kind: "PRIMARY_TARGET",
      id: technicalChoicePlan.primaryTarget.id,
    },
    issueExplanation:
      "The answer persistently describes what the method does without explaining why it was selected.",
    repairCue: "State the project constraint and explain the choice.",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function createHarness(provider: FetchHandler) {
  let now = 1_000;
  const fetcher = vi.fn(provider);
  const llmService = new QwenLlmService({
    apiKey: "fake-api-key",
    baseUrl: "https://provider.invalid/v1",
    model: "fake-qwen",
    fetcher: fetcher as unknown as typeof fetch,
  });
  const store = new InMemoryInterviewSessionStore({
    ttlMs: 60_000,
    now: () => now,
    idFactory: () => "system-safety-session",
  });
  const session = store.create({
    projectContext: "A synthetic robot-navigation project context.",
    scenario: {
      id: phaseOneScenario.id,
      version: phaseOneScenario.version,
    },
    questionPlans: [technicalChoicePlan],
  });
  const service = new InterviewRuntimeService(store, llmService, {
    now: () => now,
  });

  service.start(session.sessionId);
  now = 12_000;
  const checkpointed = service.updateTranscript(
    session.sessionId,
    persistentTranscript,
  );
  const checkpoint = checkpointed.checkpoint;
  if (checkpoint === null) {
    throw new Error("Safety harness did not produce an eligible checkpoint");
  }
  const identity: CheckpointIdentity = {
    questionId: checkpointed.question.questionId,
    answerVersion: checkpoint.answerVersion,
    checkpointVersion: checkpoint.checkpointVersion,
  };

  return {
    fetcher,
    identity,
    service,
    sessionId: session.sessionId,
    store,
  };
}

function currentRuntime(
  store: InMemoryInterviewSessionStore,
  sessionId: string,
): InterviewRuntime {
  const runtime = store.get(sessionId)?.runtime;
  if (runtime === undefined) {
    throw new Error("Safety harness session disappeared");
  }
  return runtime;
}

function interruptionFor(identity: CheckpointIdentity): HardGateInterruption {
  return {
    issueType: "NOT_ANSWERING_QUESTION",
    triggeringCriterion: {
      kind: "PRIMARY_TARGET",
      id: technicalChoicePlan.primaryTarget.id,
    },
    checkpointVersion: identity.checkpointVersion,
    triggeredAt: 12_000,
    whyPaused: "当前回答没有回应问题核心。",
    repairCue: "先直接回答当前问题。",
  };
}

function reservedReanswerSnapshot(runtime: InterviewRuntime): InterviewRuntime {
  const question = runtime.questions[runtime.currentQuestionIndex];
  if (question === undefined) {
    throw new Error("Safety harness runtime has no current question");
  }
  const questions = [...runtime.questions];
  questions[runtime.currentQuestionIndex] = Object.freeze({
    ...question,
    state: "REANSWER" as const,
  });
  return Object.freeze({
    ...runtime,
    runtimeRevision: runtime.runtimeRevision + 1,
    questions: Object.freeze(questions),
  });
}

describe("system semantic safety Golden", () => {
  it.each([
    {
      name: "timeout",
      provider: async () => {
        throw new DOMException("timed out", "TimeoutError");
      },
    },
    {
      name: "provider HTTP error",
      provider: async () => new Response(null, { status: 503 }),
    },
  ] satisfies readonly Readonly<{ name: string; provider: FetchHandler }>[]) (
    "S01 fails open on $name",
    async ({ provider }) => {
      const harness = createHarness(provider);

      const runtime = await harness.service.evaluateCheckpoint(
        harness.sessionId,
        harness.identity,
      );

      expect(runtime).toMatchObject({ state: "ANSWERING", hardGate: null });
      expect(harness.fetcher).toHaveBeenCalledOnce();
    },
  );

  it("S02 fails open after two invalid structured outputs and retries only once", async () => {
    const harness = createHarness(async () =>
      completionResponse({ decision: "GATE", confidence: "certain" }),
    );

    const runtime = await harness.service.evaluateCheckpoint(
      harness.sessionId,
      harness.identity,
    );

    expect(runtime).toMatchObject({ state: "ANSWERING", hardGate: null });
    expect(harness.fetcher).toHaveBeenCalledTimes(2);
  });

  it("S03 discards an evaluator result after the transcript version changes", async () => {
    const pending = deferred<Response>();
    const harness = createHarness(() => pending.promise);
    const evaluation = harness.service.evaluateCheckpoint(
      harness.sessionId,
      harness.identity,
    );
    const revisedTranscript = `${persistentTranscript}真实原因是板载算力和尖峰噪声约束。`;

    const revised = harness.service.updateTranscript(
      harness.sessionId,
      revisedTranscript,
    );
    pending.resolve(
      completionResponse(issueResult(harness.identity.checkpointVersion)),
    );

    const runtime = await evaluation;
    expect(runtime).toMatchObject({
      state: "ANSWERING",
      transcript: revisedTranscript,
      answerVersion: revised.answerVersion,
      hardGate: null,
    });
    expect(revised.answerVersion).toBe(harness.identity.answerVersion + 1);
    expect(harness.fetcher).toHaveBeenCalledOnce();
  });

  it.each(["REPAIR", "REANSWER", "QUESTION_DONE"] as const)(
    "S04 discards an old evaluator result after entering %s",
    async (targetState) => {
      const pending = deferred<Response>();
      const harness = createHarness(() => pending.promise);
      const evaluation = harness.service.evaluateCheckpoint(
        harness.sessionId,
        harness.identity,
      );
      const oldResult = issueResult(harness.identity.checkpointVersion);
      const answering = currentRuntime(harness.store, harness.sessionId);

      let transitioned: InterviewRuntime;
      if (targetState === "QUESTION_DONE") {
        transitioned = completeAnswer(answering);
      } else {
        const repair = interruptForHardGate(
          answering,
          interruptionFor(harness.identity),
        );
        transitioned =
          targetState === "REPAIR"
            ? repair
            : reservedReanswerSnapshot(repair);
      }
      harness.store.updateRuntime(harness.sessionId, transitioned);

      expect(isCheckpointResultStale(oldResult, transitioned)).toBe(true);
      pending.resolve(completionResponse(oldResult));

      const runtime = await evaluation;
      expect(runtime.state).toBe(targetState);
      expect(currentRuntime(harness.store, harness.sessionId).questions[0].state)
        .toBe(targetState);
      expect(harness.fetcher).toHaveBeenCalledOnce();
    },
  );

  it("S05 permits at most one Hard Gate for a question", async () => {
    let output: SemanticCheckResult | undefined;
    const harness = createHarness(async () => {
      if (output === undefined) {
        throw new Error("Provider output was not prepared");
      }
      return completionResponse(output);
    });
    output = issueResult(harness.identity.checkpointVersion + 1);

    const gated = await harness.service.complete(harness.sessionId);
    expect(gated.state).toBe("REPAIR");

    const resumed = harness.service.overrideGate(harness.sessionId);
    const updated = harness.service.updateTranscript(
      harness.sessionId,
      `${persistentTranscript}我选择继续回答并补充选择理由。`,
    );
    const secondDecision = await harness.service.evaluateCheckpoint(
      harness.sessionId,
      harness.identity,
    );
    const question = currentRuntime(
      harness.store,
      harness.sessionId,
    ).questions[0];

    expect(resumed.state).toBe("ANSWERING");
    expect(updated.checkpoint).toBeNull();
    expect(secondDecision).toMatchObject({ state: "ANSWERING", hardGate: null });
    expect(question).toMatchObject({ gateCount: 1, state: "ANSWERING" });
    expect(harness.fetcher).toHaveBeenCalledOnce();
  });
});
