import { describe, expect, it } from "vitest";
import {
  completeRepair,
  completeAnswer,
  createCheckpoint,
  createInterviewRuntime,
  getCheckpointEligibility,
  interruptForHardGate,
  InterviewRuntimeError,
  isCheckpointResultStale,
  isCheckpointStale,
  isQuestionTransitionAllowed,
  MVP_CHECKPOINT_HEURISTIC,
  overrideHardGate,
  pauseForWrapUp,
  resumeAfterWrapUp,
  startAnswer,
  startReanswer,
  updateTranscript,
  type CheckpointHeuristic,
  type InterviewRuntime,
  type SemanticCheckpoint,
} from "../../src/domain/interview/runtime";
import type { SemanticCheckResult } from "../../src/domain/semantic/contracts";

const immediateCheckpoint: CheckpointHeuristic = {
  minTranscriptCharacters: 1,
  minAnswerDurationMs: 0,
  minCheckpointIntervalMs: 0,
};

type IssueDetectedResult = Extract<
  SemanticCheckResult,
  { decision: "ISSUE_DETECTED" }
>;

function issueResult(
  checkpointVersion: number,
  overrides: Partial<IssueDetectedResult> = {},
): IssueDetectedResult {
  return {
    questionId: "question-1",
    checkpointVersion,
    decision: "ISSUE_DETECTED",
    issueType: "NOT_ANSWERING_QUESTION",
    confidence: 0.98,
    gateability: "GATE_ELIGIBLE",
    answerBoundary: "NONE",
    triggeringCriterion: { kind: "PRIMARY_TARGET", id: "reason" },
    issueExplanation: "The answer describes what happened but not why.",
    repairCue: "Explain the reason for the choice.",
    ...overrides,
  };
}

function gatedRuntime(): Readonly<{
  runtime: InterviewRuntime;
  checkpoint: SemanticCheckpoint;
  beforeEvaluation: IssueDetectedResult;
}> {
  let runtime = startAnswer(
    createInterviewRuntime("session-1", ["question-1"]),
    1_000,
  );
  runtime = updateTranscript(runtime, "We selected the smaller model.");
  const checkpointed = createCheckpoint(runtime, 2_000);
  const beforeEvaluation = issueResult(
    checkpointed.checkpoint.checkpointVersion,
  );

  return {
    checkpoint: checkpointed.checkpoint,
    beforeEvaluation,
    runtime: interruptForHardGate(checkpointed.runtime, {
      issueType: beforeEvaluation.issueType,
      triggeringCriterion: beforeEvaluation.triggeringCriterion,
      checkpointVersion: beforeEvaluation.checkpointVersion,
      triggeredAt: 2_100,
      whyPaused: "请先补充选择原因。",
      repairCue: "说明一个关键取舍。",
      beforeEvaluation,
    }),
  };
}

describe("text-first interview runtime", () => {
  it("uses the stricter five-second stable checkpoint cadence", () => {
    expect(MVP_CHECKPOINT_HEURISTIC).toEqual({
      minTranscriptCharacters: 80,
      minAnswerDurationMs: 5_000,
      minCheckpointIntervalMs: 5_000,
    });
  });

  it("allows the active and reserved question transitions only", () => {
    expect(isQuestionTransitionAllowed("QUESTION_READY", "ANSWERING")).toBe(true);
    expect(isQuestionTransitionAllowed("ANSWERING", "QUESTION_DONE")).toBe(true);
    expect(isQuestionTransitionAllowed("ANSWERING", "WRAP_UP")).toBe(true);
    expect(isQuestionTransitionAllowed("WRAP_UP", "ANSWERING")).toBe(true);
    expect(isQuestionTransitionAllowed("WRAP_UP", "QUESTION_DONE")).toBe(true);
    expect(isQuestionTransitionAllowed("ANSWERING", "REPAIR")).toBe(true);
    expect(isQuestionTransitionAllowed("REPAIR", "REANSWER")).toBe(true);
    expect(isQuestionTransitionAllowed("REANSWER", "QUESTION_DONE")).toBe(true);

    expect(isQuestionTransitionAllowed("QUESTION_READY", "QUESTION_DONE")).toBe(
      false,
    );
    expect(isQuestionTransitionAllowed("QUESTION_DONE", "ANSWERING")).toBe(false);
  });

  it("runs QUESTION_READY to ANSWERING to QUESTION_DONE deterministically", () => {
    const ready = createInterviewRuntime("session-1", ["question-1"]);
    const answering = startAnswer(ready, 1_000);
    const withAnswer = updateTranscript(answering, "I designed the test harness.");
    const done = completeAnswer(withAnswer);

    expect(ready.interviewState).toEqual({
      state: "NOT_STARTED",
      activeQuestionId: null,
    });
    expect(answering.interviewState).toEqual({
      state: "IN_PROGRESS",
      activeQuestionId: "question-1",
    });
    expect(answering.questions[0].state).toBe("ANSWERING");
    expect(done.questions[0].state).toBe("QUESTION_DONE");
    expect(done.interviewState).toEqual({
      state: "INTERVIEW_DONE",
      activeQuestionId: null,
    });
  });

  it("advances through three questions and finishes the interview after the third", () => {
    let runtime = createInterviewRuntime("session-round", [
      "question-1",
      "question-2",
      "question-3",
    ]);

    runtime = completeAnswer(
      updateTranscript(startAnswer(runtime, 1_000), "First answer."),
    );
    expect(runtime).toMatchObject({
      currentQuestionIndex: 1,
      interviewState: { state: "IN_PROGRESS", activeQuestionId: "question-2" },
    });
    expect(runtime.questions.map(({ state }) => state)).toEqual([
      "QUESTION_DONE",
      "QUESTION_READY",
      "QUESTION_READY",
    ]);

    runtime = completeAnswer(
      updateTranscript(startAnswer(runtime, 2_000), "Second answer."),
    );
    expect(runtime.currentQuestionIndex).toBe(2);
    expect(runtime.interviewState).toEqual({
      state: "IN_PROGRESS",
      activeQuestionId: "question-3",
    });

    runtime = completeAnswer(
      updateTranscript(startAnswer(runtime, 3_000), "Third answer."),
    );
    expect(runtime.currentQuestionIndex).toBe(2);
    expect(runtime.questions.every(({ state }) => state === "QUESTION_DONE")).toBe(
      true,
    );
    expect(runtime.interviewState).toEqual({
      state: "INTERVIEW_DONE",
      activeQuestionId: null,
    });
  });

  it.each(["SUCCESSFUL", "UNRESOLVED"] as const)(
    "advances to the next question after a %s repair",
    (outcome) => {
      let runtime = startAnswer(
        createInterviewRuntime("session-repair-round", [
          "question-1",
          "question-2",
          "question-3",
        ]),
        1_000,
      );
      runtime = updateTranscript(runtime, "The first answer misses the reason.");
      const firstCheckpoint = createCheckpoint(runtime, 2_000, "FINAL");
      const beforeEvaluation = issueResult(
        firstCheckpoint.checkpoint.checkpointVersion,
      );
      runtime = interruptForHardGate(firstCheckpoint.runtime, {
        issueType: beforeEvaluation.issueType,
        triggeringCriterion: beforeEvaluation.triggeringCriterion,
        checkpointVersion: beforeEvaluation.checkpointVersion,
        triggeredAt: 2_100,
        whyPaused: "请补充选择原因。",
        repairCue: "说明一个真实约束。",
        beforeEvaluation,
      });
      runtime = updateTranscript(
        startReanswer(runtime, 3_000),
        "I chose it because memory was limited.",
      );
      const repairCheckpoint = createCheckpoint(runtime, 4_000, "FINAL");
      const afterEvaluation: SemanticCheckResult =
        outcome === "SUCCESSFUL"
          ? {
              questionId: "question-1",
              checkpointVersion: repairCheckpoint.checkpoint.checkpointVersion,
              confidence: 0.9,
              gateability: "UNCERTAIN",
              answerBoundary: "NONE",
              decision: "CONTINUE",
              issueType: null,
              triggeringCriterion: null,
              issueExplanation: null,
              repairCue: null,
            }
          : issueResult(repairCheckpoint.checkpoint.checkpointVersion);

      const advanced = completeRepair(
        repairCheckpoint.runtime,
        afterEvaluation,
        outcome,
      );
      expect(advanced).toMatchObject({
        currentQuestionIndex: 1,
        interviewState: { state: "IN_PROGRESS", activeQuestionId: "question-2" },
      });
      expect(advanced.questions[0]).toMatchObject({
        state: "QUESTION_DONE",
        repairOutcome: outcome,
      });
      expect(advanced.questions[1].state).toBe("QUESTION_READY");
    },
  );

  it("freezes a rambling answer, resumes without consuming Gate capacity, and cannot pause twice", () => {
    let runtime = startAnswer(
      createInterviewRuntime("session-1", ["question-1"]),
      1_000,
    );
    runtime = updateTranscript(
      runtime,
      "I answered the requested problem and then continued into unrelated detail.",
    );
    const checkpointed = createCheckpoint(runtime, 10_000, "INTERIM");
    const paused = pauseForWrapUp(checkpointed.runtime, {
      checkpointVersion: checkpointed.checkpoint.checkpointVersion,
      triggeredAt: 10_100,
    });
    const pausedQuestion = paused.questions[0];

    expect(pausedQuestion).toMatchObject({
      state: "WRAP_UP",
      transcript: checkpointed.checkpoint.transcriptSnapshot,
      gateCount: 0,
      wrapUpCount: 1,
      latestCheckpoint: null,
      semanticIssueCandidate: null,
      semanticWrapUpCandidate: null,
    });
    expect(isCheckpointStale(checkpointed.checkpoint, paused)).toBe(true);
    expect(() => updateTranscript(paused, "late transcript")).toThrow(
      "Cannot update an answer while question is WRAP_UP",
    );

    const resumed = resumeAfterWrapUp(paused);
    expect(resumed.questions[0]).toMatchObject({
      state: "ANSWERING",
      transcript: checkpointed.checkpoint.transcriptSnapshot,
      gateCount: 0,
      wrapUpCount: 1,
    });

    const next = createCheckpoint(
      updateTranscript(resumed, `${resumed.questions[0].transcript} More detail.`),
      20_000,
      "INTERIM",
    );
    expect(() =>
      pauseForWrapUp(next.runtime, {
        checkpointVersion: next.checkpoint.checkpointVersion,
        triggeredAt: 20_100,
      }),
    ).toThrow("Wrap-up interruption does not match the current checkpoint");
  });

  it("can finish directly from a wrap-up pause", () => {
    let runtime = startAnswer(
      createInterviewRuntime("session-1", ["question-1"]),
      1_000,
    );
    runtime = updateTranscript(runtime, "A complete answer with extra detail.");
    const checkpointed = createCheckpoint(runtime, 10_000, "INTERIM");
    runtime = pauseForWrapUp(checkpointed.runtime, {
      checkpointVersion: checkpointed.checkpoint.checkpointVersion,
      triggeredAt: 10_100,
    });

    const done = completeAnswer(runtime);
    expect(done.questions[0]).toMatchObject({
      state: "QUESTION_DONE",
      transcript: "A complete answer with extra detail.",
      gateCount: 0,
      wrapUpCount: 1,
    });
  });

  it("rejects illegal transitions, pre-start updates, and empty completion", () => {
    const ready = createInterviewRuntime("session-1", ["question-1"]);

    expect(() => updateTranscript(ready, "too early")).toThrow(
      InterviewRuntimeError,
    );
    expect(() => completeAnswer(ready)).toThrow("Cannot transition question");

    const answering = startAnswer(ready, 1_000);
    expect(() => startAnswer(answering, 2_000)).toThrow(
      "Cannot transition question",
    );
    expect(() => completeAnswer(answering)).toThrow("Cannot complete an empty answer");
  });

  it("updates the transcript and advances answerVersion only for a new snapshot", () => {
    const answering = startAnswer(
      createInterviewRuntime("session-1", ["question-1"]),
      1_000,
    );
    const first = updateTranscript(answering, "First draft");
    const unchanged = updateTranscript(first, "First draft");
    const second = updateTranscript(unchanged, "Second draft");

    expect(first.questions[0]).toMatchObject({
      transcript: "First draft",
      answerVersion: 1,
    });
    expect(unchanged).toBe(first);
    expect(second.questions[0]).toMatchObject({
      transcript: "Second draft",
      answerVersion: 2,
    });
  });

  it("applies the centralized MVP heuristic including the in-flight guard", () => {
    const started = startAnswer(
      createInterviewRuntime("session-1", ["question-1"]),
      1_000,
    );
    const short = updateTranscript(started, "Brief");
    const long = updateTranscript(started, "x".repeat(80));

    expect(getCheckpointEligibility(short, 20_000, false).reason).toBe(
      "TRANSCRIPT_TOO_SHORT",
    );
    expect(getCheckpointEligibility(long, 5_999, false).reason).toBe(
      "ANSWER_TOO_NEW",
    );
    expect(getCheckpointEligibility(long, 6_000, true).reason).toBe(
      "REQUEST_IN_FLIGHT",
    );
    expect(getCheckpointEligibility(long, 6_000, false)).toEqual({
      eligible: true,
      reason: "ELIGIBLE",
    });

    const checkpointed = createCheckpoint(long, 6_000).runtime;
    expect(getCheckpointEligibility(checkpointed, 13_999, false).reason).toBe(
      "ANSWER_UNCHANGED",
    );
    expect(getCheckpointEligibility(checkpointed, 14_000, false).reason).toBe(
      "ANSWER_UNCHANGED",
    );

    const revised = updateTranscript(checkpointed, `${"x".repeat(80)} revised`);
    expect(getCheckpointEligibility(revised, 10_999, false).reason).toBe(
      "CHECKPOINT_TOO_RECENT",
    );
    expect(getCheckpointEligibility(revised, 11_000, false).eligible).toBe(true);

    expect(
      getCheckpointEligibility(
        checkpointed,
        6_001,
        false,
        immediateCheckpoint,
        "FINAL",
      ),
    ).toEqual({ eligible: true, reason: "ELIGIBLE" });
  });

  it("lets a non-trivial FINAL snapshot bypass interim timing thresholds", () => {
    const started = startAnswer(
      createInterviewRuntime("session-1", ["question-1"]),
      1_000,
    );
    const tooShort = updateTranscript(started, "太短");
    const final = updateTranscript(started, "这是一个已经结束的完整回答片段。");

    expect(
      getCheckpointEligibility(
        tooShort,
        1_001,
        false,
        immediateCheckpoint,
        "FINAL",
      ).reason,
    ).toBe("TRANSCRIPT_TOO_SHORT");
    expect(
      getCheckpointEligibility(
        final,
        1_001,
        true,
        immediateCheckpoint,
        "FINAL",
      ).reason,
    ).toBe("REQUEST_IN_FLIGHT");
    expect(
      getCheckpointEligibility(
        final,
        1_001,
        false,
        {
          minTranscriptCharacters: 10_000,
          minAnswerDurationMs: 60_000,
          minCheckpointIntervalMs: 60_000,
        },
        "FINAL",
      ),
    ).toEqual({ eligible: true, reason: "ELIGIBLE" });
  });

  it("increments checkpointVersion monotonically and snapshots its answer version", () => {
    let runtime = startAnswer(
      createInterviewRuntime("session-1", ["question-1"]),
      1_000,
    );
    runtime = updateTranscript(runtime, "First answer");
    const first = createCheckpoint(runtime, 2_000, "INTERIM");
    runtime = updateTranscript(first.runtime, "Revised answer");
    const second = createCheckpoint(runtime, 3_000, "FINAL");

    expect(first.checkpoint).toEqual({
      sessionId: "session-1",
      questionId: "question-1",
      answerVersion: 1,
      checkpointVersion: 1,
      transcriptSnapshot: "First answer",
      createdAt: 2_000,
      kind: "INTERIM",
    });
    expect(second.checkpoint).toMatchObject({
      answerVersion: 2,
      checkpointVersion: 2,
      transcriptSnapshot: "Revised answer",
      kind: "FINAL",
    });
    expect(isCheckpointStale(first.checkpoint, runtime)).toBe(true);
    expect(isCheckpointStale(second.checkpoint, second.runtime)).toBe(false);
    expect(
      isCheckpointResultStale(
        {
          questionId: "question-1",
          checkpointVersion: first.checkpoint.checkpointVersion,
        },
        second.runtime,
      ),
    ).toBe(true);
    expect(
      isCheckpointResultStale(
        {
          questionId: "question-1",
          checkpointVersion: second.checkpoint.checkpointVersion,
        },
        second.runtime,
      ),
    ).toBe(false);
  });

  it("invalidates every checkpoint after QUESTION_DONE", () => {
    let runtime = startAnswer(
      createInterviewRuntime("session-1", ["question-1"]),
      1_000,
    );
    runtime = updateTranscript(runtime, "A complete answer");
    const { checkpoint, runtime: checkpointed } = createCheckpoint(runtime, 2_000);
    const done = completeAnswer(checkpointed);

    expect(isCheckpointStale(checkpoint, checkpointed)).toBe(false);
    expect(isCheckpointStale(checkpoint, done)).toBe(true);
    expect(
      isCheckpointResultStale(
        {
          questionId: checkpoint.questionId,
          checkpointVersion: checkpoint.checkpointVersion,
        },
        done,
      ),
    ).toBe(true);
  });

  it("freezes produced runtime and checkpoint snapshots", () => {
    let runtime = startAnswer(
      createInterviewRuntime("session-1", ["question-1"]),
      1_000,
    );
    runtime = updateTranscript(runtime, "Frozen answer");
    const result = createCheckpoint(runtime, 2_000);

    expect(Object.isFrozen(result.runtime)).toBe(true);
    expect(Object.isFrozen(result.runtime.questions)).toBe(true);
    expect(Object.isFrozen(result.runtime.questions[0])).toBe(true);
    expect(Object.isFrozen(result.checkpoint)).toBe(true);
    expect(getCheckpointEligibility(runtime, 2_000, false, immediateCheckpoint)).toEqual(
      { eligible: true, reason: "ELIGIBLE" },
    );
  });

  it("freezes the original answer and complete before-evaluation at the Hard Gate", () => {
    const { runtime, beforeEvaluation } = gatedRuntime();
    const question = runtime.questions[0];

    expect(question).toMatchObject({
      state: "REPAIR",
      gateCount: 1,
      answerAttempt: 1,
      originalAnswer: "We selected the smaller model.",
      repairedAnswer: null,
      repairStatus: "GATE_PENDING",
      afterEvaluation: null,
      repairOutcome: null,
    });
    expect(question.hardGate?.beforeEvaluation).toEqual(beforeEvaluation);
    expect(Object.isFrozen(question.hardGate)).toBe(true);
    expect(Object.isFrozen(question.hardGate?.triggeringCriterion)).toBe(true);
    expect(Object.isFrozen(question.hardGate?.beforeEvaluation)).toBe(true);
    expect(
      Object.isFrozen(question.hardGate?.beforeEvaluation.triggeringCriterion),
    ).toBe(true);
  });

  it("starts an independent re-answer without restoring periodic gate eligibility", () => {
    const gated = gatedRuntime();
    const reanswering = startReanswer(gated.runtime, 3_000);
    const question = reanswering.questions[0];

    expect(question).toMatchObject({
      state: "REANSWER",
      transcript: "",
      answerStartedAt: 3_000,
      lastCheckpointAt: null,
      latestCheckpoint: null,
      answerAttempt: 2,
      originalAnswer: "We selected the smaller model.",
      repairedAnswer: null,
      gateCount: 1,
      repairStatus: "REANSWERING",
    });
    expect(question.answerVersion).toBe(2);
    expect(question.checkpointVersion).toBe(1);
    expect(question.hardGate?.beforeEvaluation).toEqual(gated.beforeEvaluation);
    expect(getCheckpointEligibility(reanswering, 99_000, false).reason).toBe(
      "INVALID_STATE",
    );
    expect(isCheckpointStale(gated.checkpoint, reanswering)).toBe(true);
  });

  it("checkpoints the re-answer while every earlier answer result stays stale", () => {
    const gated = gatedRuntime();
    let runtime = startReanswer(gated.runtime, 3_000);
    runtime = updateTranscript(runtime, "I chose it to meet the latency budget.");
    const reanswer = createCheckpoint(runtime, 4_000);

    expect(reanswer.checkpoint).toMatchObject({
      answerVersion: 3,
      checkpointVersion: 2,
      transcriptSnapshot: "I chose it to meet the latency budget.",
    });
    expect(isCheckpointStale(gated.checkpoint, reanswer.runtime)).toBe(true);
    expect(isCheckpointStale(reanswer.checkpoint, reanswer.runtime)).toBe(false);
    expect(
      isCheckpointResultStale(gated.beforeEvaluation, reanswer.runtime),
    ).toBe(true);
    expect(
      isCheckpointResultStale(
        {
          questionId: reanswer.checkpoint.questionId,
          checkpointVersion: reanswer.checkpoint.checkpointVersion,
        },
        reanswer.runtime,
      ),
    ).toBe(false);
  });

  it("records a successful repair and both evaluator snapshots", () => {
    const gated = gatedRuntime();
    let runtime = startReanswer(gated.runtime, 3_000);
    runtime = updateTranscript(runtime, "I chose it to meet the latency budget.");
    const checkpointed = createCheckpoint(runtime, 4_000, "FINAL");
    const afterEvaluation = {
      questionId: "question-1",
      checkpointVersion: checkpointed.checkpoint.checkpointVersion,
      decision: "CONTINUE",
      issueType: null,
      confidence: 0.91,
      gateability: "UNCERTAIN",
      answerBoundary: "NONE",
      triggeringCriterion: null,
      issueExplanation: null,
      repairCue: null,
    } satisfies SemanticCheckResult;
    const done = completeRepair(
      checkpointed.runtime,
      afterEvaluation,
      "SUCCESSFUL",
    );
    const question = done.questions[0];

    expect(question).toMatchObject({
      state: "QUESTION_DONE",
      originalAnswer: "We selected the smaller model.",
      repairedAnswer: "I chose it to meet the latency budget.",
      answerAttempt: 2,
      gateCount: 1,
      repairStatus: null,
      repairOutcome: "SUCCESSFUL",
    });
    expect(question.hardGate?.beforeEvaluation).toEqual(gated.beforeEvaluation);
    expect(question.afterEvaluation).toEqual(afterEvaluation);
    expect(Object.isFrozen(question.afterEvaluation)).toBe(true);
    expect(isCheckpointStale(checkpointed.checkpoint, done)).toBe(true);
    expect(done.interviewState.state).toBe("INTERVIEW_DONE");
  });

  it("records an unresolved repair without losing either answer", () => {
    const gated = gatedRuntime();
    let runtime = startReanswer(gated.runtime, 3_000);
    runtime = updateTranscript(runtime, "It was suitable for the edge device.");
    const checkpointed = createCheckpoint(runtime, 4_000, "FINAL");
    const afterEvaluation = issueResult(
      checkpointed.checkpoint.checkpointVersion,
    );
    const done = completeRepair(
      checkpointed.runtime,
      afterEvaluation,
      "UNRESOLVED",
    );

    expect(done.questions[0]).toMatchObject({
      state: "QUESTION_DONE",
      originalAnswer: "We selected the smaller model.",
      repairedAnswer: "It was suitable for the edge device.",
      repairOutcome: "UNRESOLVED",
    });
    expect(Object.isFrozen(done.questions[0].afterEvaluation)).toBe(true);
    expect(
      Object.isFrozen(done.questions[0].afterEvaluation?.triggeringCriterion),
    ).toBe(true);
  });

  it("rejects stale repair results and completion paths that bypass evaluation", () => {
    const gated = gatedRuntime();
    let runtime = startReanswer(gated.runtime, 3_000);
    runtime = updateTranscript(runtime, "I chose it for the memory constraint.");

    expect(() => completeAnswer(runtime)).toThrow(
      "Cannot complete an initial answer while question is REANSWER",
    );
    expect(() =>
      completeRepair(runtime, gated.beforeEvaluation, "SUCCESSFUL"),
    ).toThrow("does not match the current re-answer checkpoint");

    const checkpointed = createCheckpoint(runtime, 4_000);
    const currentAfter = {
      questionId: "question-1",
      checkpointVersion: checkpointed.checkpoint.checkpointVersion,
      decision: "CONTINUE",
      issueType: null,
      confidence: 0.9,
      gateability: "UNCERTAIN",
      answerBoundary: "NONE",
      triggeringCriterion: null,
      issueExplanation: null,
      repairCue: null,
    } satisfies SemanticCheckResult;
    expect(() =>
      completeRepair(checkpointed.runtime, currentAfter, "SUCCESSFUL"),
    ).toThrow("does not match the current re-answer checkpoint");

    runtime = updateTranscript(
      checkpointed.runtime,
      "I chose it for both memory and latency constraints.",
    );
    const staleAfter = {
      questionId: "question-1",
      checkpointVersion: checkpointed.checkpoint.checkpointVersion,
      decision: "CONTINUE",
      issueType: null,
      confidence: 0.9,
      gateability: "UNCERTAIN",
      answerBoundary: "NONE",
      triggeringCriterion: null,
      issueExplanation: null,
      repairCue: null,
    } satisfies SemanticCheckResult;

    expect(() => completeRepair(runtime, staleAfter, "SUCCESSFUL")).toThrow(
      "does not match the current re-answer checkpoint",
    );
  });

  it("keeps an override out of Repair and permanently consumes gate capacity", () => {
    const gated = gatedRuntime();
    const overridden = overrideHardGate(gated.runtime, 2_500);
    const question = overridden.questions[0];

    expect(question).toMatchObject({
      state: "ANSWERING",
      gateCount: 1,
      answerAttempt: 1,
      repairStatus: null,
      repairedAnswer: null,
      repairOutcome: null,
    });
    expect(question.gateOverride).toEqual({
      checkpointVersion: gated.beforeEvaluation.checkpointVersion,
      recordedAt: 2_500,
    });
    expect(getCheckpointEligibility(overridden, 99_000, false).reason).toBe(
      "GATE_CAPACITY_EXHAUSTED",
    );
    expect(() => startReanswer(overridden, 3_000)).toThrow(
      "Cannot start a re-answer",
    );
  });
});
