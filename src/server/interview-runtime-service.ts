import type { QuestionPlan } from "../domain/interview/contracts";
import {
  completeAnswer,
  createCheckpoint,
  getCheckpointEligibility,
  interruptForHardGate,
  isCheckpointResultStale,
  isCheckpointStale,
  MVP_CHECKPOINT_HEURISTIC,
  MVP_FINAL_CHECKPOINT_MIN_CHARACTERS,
  MVP_SEMANTIC_GATE_HEURISTIC,
  overrideHardGate,
  prepareReanswer,
  setSemanticIssueCandidate,
  startAnswer,
  updateTranscript,
  type CheckpointHeuristic,
  type InterviewRuntime,
  type SemanticCheckpoint,
  type SemanticGateHeuristic,
  type SemanticIssueCandidate,
} from "../domain/interview/runtime";
import {
  arbitrateGate,
  type SurfaceQuestionSupport,
} from "../domain/semantic/gate-arbiter";
import type { GateCriterion } from "../domain/semantic/contracts";
import type { PublicInterviewRuntimeDto } from "../lib/interview-api-contracts";
import type { LlmService } from "../services/llm/llm-service";
import { createHardGatePresentation } from "./hard-gate-presentation";
import { phaseOneScenario } from "./phase-one-scenario";
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
  semanticGateHeuristic?: SemanticGateHeuristic;
}>;

export type CheckpointIdentity = Readonly<{
  questionId: string;
  answerVersion: number;
  checkpointVersion: number;
}>;

type InFlightEvaluation = Readonly<{
  identity: CheckpointIdentity;
  promise: Promise<PublicInterviewRuntimeDto>;
}>;

function sameIdentity(
  left: CheckpointIdentity,
  right: CheckpointIdentity,
): boolean {
  return (
    left.questionId === right.questionId &&
    left.answerVersion === right.answerVersion &&
    left.checkpointVersion === right.checkpointVersion
  );
}

function sameCheckpoint(
  checkpoint: SemanticCheckpoint | null,
  identity: CheckpointIdentity,
): checkpoint is SemanticCheckpoint {
  return (
    checkpoint !== null &&
    checkpoint.questionId === identity.questionId &&
    checkpoint.answerVersion === identity.answerVersion &&
    checkpoint.checkpointVersion === identity.checkpointVersion
  );
}

function sameCandidateIssue(
  candidate: SemanticIssueCandidate,
  issueType: SemanticIssueCandidate["issueType"],
  criterion: GateCriterion,
): boolean {
  return (
    candidate.issueType === issueType &&
    candidate.triggeringCriterion.kind === criterion.kind &&
    candidate.triggeringCriterion.id === criterion.id
  );
}

function criterionSurfaceSupport(
  session: InterviewSession,
  questionPlan: QuestionPlan,
  criterion: GateCriterion,
): SurfaceQuestionSupport {
  if (
    session.scenario.id !== phaseOneScenario.id ||
    session.scenario.version !== phaseOneScenario.version
  ) {
    return "UNCERTAIN";
  }

  const family = phaseOneScenario.questionFamilies.find(
    ({ id }) => id === questionPlan.id,
  );
  if (
    family === undefined ||
    questionPlan.surfaceQuestion !== family.surfaceQuestion ||
    questionPlan.primaryTarget.id !== family.primaryTargetId
  ) {
    return "UNCERTAIN";
  }

  if (criterion.kind === "PRIMARY_TARGET") {
    return criterion.id === family.primaryTargetId
      ? "SUPPORTED"
      : "NOT_SUPPORTED";
  }

  return family.requiredEvidence.some(
    ({ evidenceKindId }) => evidenceKindId === criterion.id,
  ) && questionPlan.requiredEvidence.some(({ id }) => id === criterion.id)
    ? "SUPPORTED"
    : "NOT_SUPPORTED";
}

export class InterviewRuntimeService {
  readonly #now: () => number;
  readonly #checkpointHeuristic: CheckpointHeuristic;
  readonly #semanticGateHeuristic: SemanticGateHeuristic;
  readonly #inFlightEvaluations = new Map<string, InFlightEvaluation>();

  constructor(
    private readonly sessionStore: InMemoryInterviewSessionStore,
    private readonly llmService: LlmService,
    options: InterviewRuntimeServiceOptions = {},
  ) {
    this.#now = options.now ?? Date.now;
    this.#checkpointHeuristic =
      options.checkpointHeuristic ?? MVP_CHECKPOINT_HEURISTIC;
    this.#semanticGateHeuristic =
      options.semanticGateHeuristic ?? MVP_SEMANTIC_GATE_HEURISTIC;
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
  ): PublicInterviewRuntimeDto {
    const session = this.requireSession(sessionId);
    let runtime = updateTranscript(session.runtime, transcript);
    const question = runtime.questions[runtime.currentQuestionIndex];
    if (question === undefined) {
      throw new Error("Stored runtime has no current question");
    }

    const now = this.#now();
    const eligibility = getCheckpointEligibility(
      runtime,
      now,
      this.hasInFlightEvaluation(sessionId, question.questionId),
      this.#checkpointHeuristic,
      "INTERIM",
    );

    if (eligibility.eligible) {
      runtime = createCheckpoint(runtime, now, "INTERIM").runtime;
    }

    return this.saveAndPublish(sessionId, runtime);
  }

  evaluateCheckpoint(
    sessionId: string,
    identity: CheckpointIdentity,
  ): Promise<PublicInterviewRuntimeDto> {
    const session = this.requireSession(sessionId);
    const question = session.runtime.questions[session.runtime.currentQuestionIndex];
    const checkpoint = question?.latestCheckpoint ?? null;

    if (
      question === undefined ||
      question.state !== "ANSWERING" ||
      !sameCheckpoint(checkpoint, identity) ||
      isCheckpointStale(checkpoint, session.runtime)
    ) {
      return Promise.resolve(toPublicInterviewRuntime(session));
    }

    const existing = this.#inFlightEvaluations.get(sessionId);
    if (existing !== undefined) {
      return sameIdentity(existing.identity, identity)
        ? existing.promise
        : Promise.resolve(toPublicInterviewRuntime(session));
    }

    const promise = this.runEvaluation(session, checkpoint).finally(() => {
      const current = this.#inFlightEvaluations.get(sessionId);
      if (current?.promise === promise) {
        this.#inFlightEvaluations.delete(sessionId);
      }
    });
    this.#inFlightEvaluations.set(sessionId, { identity, promise });
    return promise;
  }

  overrideGate(sessionId: string): PublicInterviewRuntimeDto {
    const session = this.requireSession(sessionId);
    const runtime = overrideHardGate(session.runtime, this.#now());
    return this.saveAndPublish(sessionId, runtime);
  }

  prepareReanswer(sessionId: string): PublicInterviewRuntimeDto {
    const session = this.requireSession(sessionId);
    const runtime = prepareReanswer(session.runtime);
    return this.saveAndPublish(sessionId, runtime);
  }

  async complete(sessionId: string): Promise<PublicInterviewRuntimeDto> {
    const inFlight = this.#inFlightEvaluations.get(sessionId);
    if (inFlight !== undefined) {
      await inFlight.promise;
    }

    let session = this.requireSession(sessionId);
    let runtime = session.runtime;
    let question = runtime.questions[runtime.currentQuestionIndex];

    if (question === undefined) {
      throw new Error("Stored runtime has no current question");
    }
    if (question.state !== "ANSWERING") {
      return toPublicInterviewRuntime(session);
    }

    if (
      question.transcript.trim().length <
      MVP_FINAL_CHECKPOINT_MIN_CHARACTERS
    ) {
      runtime = completeAnswer(runtime);
      return this.saveAndPublish(sessionId, runtime);
    }

    const finalCheckpoint = createCheckpoint(runtime, this.#now(), "FINAL");
    runtime = finalCheckpoint.runtime;
    this.saveAndPublish(sessionId, runtime);

    const identity: CheckpointIdentity = {
      questionId: finalCheckpoint.checkpoint.questionId,
      answerVersion: finalCheckpoint.checkpoint.answerVersion,
      checkpointVersion: finalCheckpoint.checkpoint.checkpointVersion,
    };
    const evaluated = await this.evaluateCheckpoint(sessionId, identity);
    if (evaluated.state !== "ANSWERING") {
      return evaluated;
    }

    session = this.requireSession(sessionId);
    runtime = session.runtime;
    question = runtime.questions[runtime.currentQuestionIndex];
    if (
      question === undefined ||
      question.state !== "ANSWERING" ||
      question.latestCheckpoint?.kind !== "FINAL" ||
      !sameCheckpoint(question.latestCheckpoint, identity) ||
      isCheckpointStale(question.latestCheckpoint, runtime)
    ) {
      return toPublicInterviewRuntime(session);
    }

    runtime = completeAnswer(runtime);
    return this.saveAndPublish(sessionId, runtime);
  }

  private hasInFlightEvaluation(
    sessionId: string,
    questionId: string,
  ): boolean {
    return (
      this.#inFlightEvaluations.get(sessionId)?.identity.questionId === questionId
    );
  }

  private async runEvaluation(
    initialSession: InterviewSession,
    checkpoint: SemanticCheckpoint,
  ): Promise<PublicInterviewRuntimeDto> {
    const questionIndex = initialSession.questionPlans.findIndex(
      ({ id }) => id === checkpoint.questionId,
    );
    const questionPlan = initialSession.questionPlans[questionIndex];
    if (questionPlan === undefined) {
      return toPublicInterviewRuntime(initialSession);
    }

    const evaluation = await this.llmService.evaluateSemanticCheckpoint({
      projectContext: initialSession.projectContext,
      questionPlan,
      transcript: checkpoint.transcriptSnapshot,
      checkpointVersion: checkpoint.checkpointVersion,
      checkpointKind: checkpoint.kind,
    });

    const latestSession = this.requireSession(initialSession.sessionId);
    if (isCheckpointStale(checkpoint, latestSession.runtime)) {
      return toPublicInterviewRuntime(latestSession);
    }
    if (!evaluation.ok) {
      return this.clearSemanticIssueCandidate(latestSession);
    }

    const result = evaluation.value;
    if (isCheckpointResultStale(result, latestSession.runtime)) {
      return toPublicInterviewRuntime(latestSession);
    }
    if (result.decision !== "ISSUE_DETECTED") {
      return this.clearSemanticIssueCandidate(latestSession);
    }

    const question = latestSession.runtime.questions[questionIndex];
    if (question === undefined || question.answerStartedAt === null) {
      return toPublicInterviewRuntime(latestSession);
    }

    const transcriptCharacters = checkpoint.transcriptSnapshot.trim().length;
    const answerDurationMs = checkpoint.createdAt - question.answerStartedAt;
    const isFinalCheckpoint = checkpoint.kind === "FINAL";
    const gateDecisionIfPersistent = arbitrateGate({
      questionPlan,
      interviewState: latestSession.runtime.interviewState,
      questionState: question,
      semanticResult: result,
      meetsConfidenceThreshold:
        result.confidence >= this.#semanticGateHeuristic.minConfidence,
      surfaceQuestionSupport: criterionSurfaceSupport(
        latestSession,
        questionPlan,
        result.triggeringCriterion,
      ),
      hasSufficientAnswerContext:
        isFinalCheckpoint
          ? transcriptCharacters >= MVP_FINAL_CHECKPOINT_MIN_CHARACTERS
          : transcriptCharacters >=
                this.#semanticGateHeuristic.minContextCharacters &&
              answerDurationMs >=
                this.#semanticGateHeuristic.minContextDurationMs,
      issueIsPersistent: true,
    });

    if (gateDecisionIfPersistent !== "GATE") {
      return this.clearSemanticIssueCandidate(latestSession);
    }

    if (!isFinalCheckpoint) {
      const candidate = question.semanticIssueCandidate;
      if (
        candidate === null ||
        !sameCandidateIssue(candidate, result.issueType, result.triggeringCriterion)
      ) {
        const runtime = setSemanticIssueCandidate(latestSession.runtime, {
          issueType: result.issueType,
          triggeringCriterion: result.triggeringCriterion,
          answerVersion: checkpoint.answerVersion,
          checkpointVersion: checkpoint.checkpointVersion,
        });
        return this.saveAndPublish(initialSession.sessionId, runtime);
      }

      if (
        candidate.answerVersion >= checkpoint.answerVersion ||
        candidate.checkpointVersion >= checkpoint.checkpointVersion
      ) {
        return toPublicInterviewRuntime(latestSession);
      }
    }

    const presentation = createHardGatePresentation(questionPlan, result);
    const runtime = interruptForHardGate(latestSession.runtime, {
      issueType: result.issueType,
      triggeringCriterion: result.triggeringCriterion,
      checkpointVersion: result.checkpointVersion,
      triggeredAt: this.#now(),
      ...presentation,
    });
    return this.saveAndPublish(initialSession.sessionId, runtime);
  }

  private clearSemanticIssueCandidate(
    session: InterviewSession,
  ): PublicInterviewRuntimeDto {
    const question = session.runtime.questions[session.runtime.currentQuestionIndex];
    if (
      question === undefined ||
      question.state !== "ANSWERING" ||
      question.semanticIssueCandidate === null
    ) {
      return toPublicInterviewRuntime(session);
    }

    return this.saveAndPublish(
      session.sessionId,
      setSemanticIssueCandidate(session.runtime, null),
    );
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
