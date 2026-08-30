import {
  completeAnswer,
  createCheckpoint,
  getCheckpointEligibility,
  isCheckpointStale,
  startAnswer,
  updateTranscript,
  type CheckpointHeuristic,
  type InterviewRuntime,
  MVP_CHECKPOINT_HEURISTIC,
} from "../domain/interview/runtime";
import type { PublicInterviewRuntimeDto } from "../lib/interview-api-contracts";
import {
  toPublicInterviewRuntime,
  type InMemoryInterviewSessionStore,
  type InterviewSession,
} from "./session-store";

export class InterviewSessionNotFoundError extends Error {
  constructor() {
    super("Interview session was not found or has expired");
    this.name = "InterviewSessionNotFoundError";
  }
}

export type InterviewRuntimeServiceOptions = Readonly<{
  now?: () => number;
  checkpointHeuristic?: CheckpointHeuristic;
}>;

export class InterviewRuntimeService {
  readonly #now: () => number;
  readonly #checkpointHeuristic: CheckpointHeuristic;

  constructor(
    private readonly sessionStore: InMemoryInterviewSessionStore,
    options: InterviewRuntimeServiceOptions = {},
  ) {
    this.#now = options.now ?? Date.now;
    this.#checkpointHeuristic =
      options.checkpointHeuristic ?? MVP_CHECKPOINT_HEURISTIC;
  }

  getPublic(sessionId: string): PublicInterviewRuntimeDto {
    return toPublicInterviewRuntime(this.requireSession(sessionId));
  }

  start(sessionId: string): PublicInterviewRuntimeDto {
    const session = this.requireSession(sessionId);
    const runtime = startAnswer(session.runtime, this.#now());
    return this.saveAndPublish(sessionId, runtime);
  }

  updateTranscript(
    sessionId: string,
    transcript: string,
    isCheckpointRequestInFlight = false,
  ): PublicInterviewRuntimeDto {
    const session = this.requireSession(sessionId);
    let runtime = updateTranscript(session.runtime, transcript);
    const now = this.#now();
    const eligibility = getCheckpointEligibility(
      runtime,
      now,
      isCheckpointRequestInFlight,
      this.#checkpointHeuristic,
    );

    if (eligibility.eligible) {
      runtime = createCheckpoint(runtime, now).runtime;
    }

    return this.saveAndPublish(sessionId, runtime);
  }

  complete(sessionId: string): PublicInterviewRuntimeDto {
    const session = this.requireSession(sessionId);
    let runtime = session.runtime;
    const question = runtime.questions[runtime.currentQuestionIndex];

    if (question === undefined) {
      throw new Error("Stored runtime has no current question");
    }

    if (
      question.transcript.trim().length > 0 &&
      (question.latestCheckpoint === null ||
        isCheckpointStale(question.latestCheckpoint, runtime))
    ) {
      runtime = createCheckpoint(runtime, this.#now()).runtime;
    }

    runtime = completeAnswer(runtime);
    return this.saveAndPublish(sessionId, runtime);
  }

  private requireSession(sessionId: string): InterviewSession {
    const session = this.sessionStore.get(sessionId);
    if (session === null) {
      throw new InterviewSessionNotFoundError();
    }
    return session;
  }

  private saveAndPublish(
    sessionId: string,
    runtime: InterviewRuntime,
  ): PublicInterviewRuntimeDto {
    const session = this.sessionStore.updateRuntime(sessionId, runtime);
    if (session === null) {
      throw new InterviewSessionNotFoundError();
    }
    return toPublicInterviewRuntime(session);
  }
}
