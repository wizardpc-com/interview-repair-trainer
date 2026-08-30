import { describe, expect, it } from "vitest";
import {
  completeAnswer,
  createCheckpoint,
  createInterviewRuntime,
  getCheckpointEligibility,
  InterviewRuntimeError,
  isCheckpointResultStale,
  isCheckpointStale,
  isQuestionTransitionAllowed,
  startAnswer,
  updateTranscript,
  type CheckpointHeuristic,
} from "../../src/domain/interview/runtime";

const immediateCheckpoint: CheckpointHeuristic = {
  minTranscriptCharacters: 1,
  minAnswerDurationMs: 0,
  minCheckpointIntervalMs: 0,
};

describe("text-first interview runtime", () => {
  it("allows the active and reserved question transitions only", () => {
    expect(isQuestionTransitionAllowed("QUESTION_READY", "ANSWERING")).toBe(true);
    expect(isQuestionTransitionAllowed("ANSWERING", "QUESTION_DONE")).toBe(true);
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
    expect(getCheckpointEligibility(revised, 13_999, false).reason).toBe(
      "CHECKPOINT_TOO_RECENT",
    );
    expect(getCheckpointEligibility(revised, 14_000, false).eligible).toBe(true);
  });

  it("increments checkpointVersion monotonically and snapshots its answer version", () => {
    let runtime = startAnswer(
      createInterviewRuntime("session-1", ["question-1"]),
      1_000,
    );
    runtime = updateTranscript(runtime, "First answer");
    const first = createCheckpoint(runtime, 2_000);
    runtime = updateTranscript(first.runtime, "Revised answer");
    const second = createCheckpoint(runtime, 3_000);

    expect(first.checkpoint).toEqual({
      sessionId: "session-1",
      questionId: "question-1",
      answerVersion: 1,
      checkpointVersion: 1,
      transcriptSnapshot: "First answer",
      createdAt: 2_000,
    });
    expect(second.checkpoint).toMatchObject({
      answerVersion: 2,
      checkpointVersion: 2,
      transcriptSnapshot: "Revised answer",
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
});
