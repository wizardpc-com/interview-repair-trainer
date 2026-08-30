import type { QuestionPlan } from "../domain/interview/contracts";
import {
  clearSemanticCandidates,
  completeAnswer,
  completeRepair,
  createCheckpoint,
  getCheckpointEligibility,
  interruptForHardGate,
  isCheckpointResultStale,
  isCheckpointStale,
  MVP_CHECKPOINT_HEURISTIC,
  MVP_FINAL_CHECKPOINT_MIN_CHARACTERS,
  MVP_SEMANTIC_GATE_HEURISTIC,
  overrideHardGate,
  pauseForWrapUp,
  resumeAfterWrapUp,
  setSemanticIssueCandidate,
  setSemanticWrapUpCandidate,
  startAnswer,
  startReanswer,
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
import { arbitrateRepair } from "../domain/semantic/repair-arbiter";
import type {
  GateCriterion,
  SemanticCheckResult,
} from "../domain/semantic/contracts";
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

function repairSurfaceSupport(
  session: InterviewSession,
  questionPlan: QuestionPlan,
  result: SemanticCheckResult,
): SurfaceQuestionSupport {
  return result.decision === "ISSUE_DETECTED"
    ? criterionSurfaceSupport(
        session,
        questionPlan,
        result.triggeringCriterion,
      )
    : "SUPPORTED";
}

function honestNoMeasurementSatisfiesCriterion(
  session: InterviewSession,
  questionPlan: QuestionPlan,
  criterion: GateCriterion,
): boolean {
  if (
    session.scenario.id !== phaseOneScenario.id ||
    session.scenario.version !== phaseOneScenario.version ||
    criterion.kind !== "REQUIRED_EVIDENCE" ||
    !questionPlan.requiredEvidence.some(({ id }) => id === criterion.id)
  ) {
    return false;
  }

  return (
    phaseOneScenario.evidenceKinds.find(({ id }) => id === criterion.id)
      ?.honestNoMeasurementSatisfies === true
  );
}

export class InterviewRuntimeService {
  readonly #now: () => number;
  readonly #checkpointHeuristic: CheckpointHeuristic;
  readonly #semanticGateHeuristic: SemanticGateHeuristic;
  readonly #inFlightEvaluations = new Map<string, InFlightEvaluation>();
  readonly #inFlightInitialCompletions = new Map<
    string,
    Promise<PublicInterviewRuntimeDto>
  >();

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
    answerAttempt: 1 | 2,
  ): PublicInterviewRuntimeDto {
    const session = this.requireSession(sessionId);
    const activeQuestion =
      session.runtime.questions[session.runtime.currentQuestionIndex];
    if (activeQuestion === undefined) {
      throw new Error("Stored runtime has no current question");
    }
    if (activeQuestion.answerAttempt !== answerAttempt) {
      return toPublicInterviewRuntime(session);
    }

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

  startReanswer(sessionId: string): PublicInterviewRuntimeDto {
    const session = this.requireSession(sessionId);
    const runtime = startReanswer(session.runtime, this.#now());
    return this.saveAndPublish(sessionId, runtime);
  }

  continueAfterWrapUp(sessionId: string): PublicInterviewRuntimeDto {
    const session = this.requireSession(sessionId);
    const runtime = resumeAfterWrapUp(session.runtime);
    return this.saveAndPublish(sessionId, runtime);
  }

  complete(sessionId: string): Promise<PublicInterviewRuntimeDto> {
    const session = this.requireSession(sessionId);
    const question = session.runtime.questions[session.runtime.currentQuestionIndex];

    if (question === undefined) {
      throw new Error("Stored runtime has no current question");
    }

    if (question.state === "REANSWER") {
      return this.completeReanswer(sessionId);
    }

    if (question.state === "WRAP_UP") {
      return Promise.resolve(
        this.saveAndPublish(sessionId, completeAnswer(session.runtime)),
      );
    }

    if (question.state !== "ANSWERING") {
      return Promise.resolve(toPublicInterviewRuntime(session));
    }

    const existingCompletion = this.#inFlightInitialCompletions.get(sessionId);
    if (existingCompletion !== undefined) {
      return existingCompletion;
    }

    const inFlight = this.#inFlightEvaluations.get(sessionId);
    const completion =
      inFlight === undefined
        ? this.completeInitialAnswer(sessionId)
        : inFlight.promise.then(() => this.completeInitialAnswer(sessionId));
    const promise = completion.finally(() => {
      if (this.#inFlightInitialCompletions.get(sessionId) === promise) {
        this.#inFlightInitialCompletions.delete(sessionId);
      }
    });
    this.#inFlightInitialCompletions.set(sessionId, promise);
    return promise;
  }

  private async completeInitialAnswer(
    sessionId: string,
  ): Promise<PublicInterviewRuntimeDto> {
    let session = this.requireSession(sessionId);
    let runtime = session.runtime;
    let question = runtime.questions[runtime.currentQuestionIndex];

    if (question === undefined) {
      throw new Error("Stored runtime has no current question");
    }
    if (question.state !== "ANSWERING") {
      return toPublicInterviewRuntime(session);
    }

    if (question.gateCount >= 1) {
      return this.saveAndPublish(sessionId, completeAnswer(runtime));
    }

    if (
      question.latestCheckpoint?.kind === "FINAL" &&
      !isCheckpointStale(question.latestCheckpoint, runtime)
    ) {
      return this.saveAndPublish(sessionId, completeAnswer(runtime));
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

  private completeReanswer(sessionId: string): Promise<PublicInterviewRuntimeDto> {
    let session = this.requireSession(sessionId);
    let runtime = session.runtime;
    let question = runtime.questions[runtime.currentQuestionIndex];

    if (question === undefined) {
      throw new Error("Stored runtime has no current question");
    }
    if (question.state !== "REANSWER") {
      return Promise.resolve(toPublicInterviewRuntime(session));
    }

    let checkpoint = question.latestCheckpoint;
    if (
      checkpoint === null ||
      checkpoint.kind !== "FINAL" ||
      isCheckpointStale(checkpoint, runtime)
    ) {
      const finalCheckpoint = createCheckpoint(runtime, this.#now(), "FINAL");
      runtime = finalCheckpoint.runtime;
      this.saveAndPublish(sessionId, runtime);
      checkpoint = finalCheckpoint.checkpoint;
      session = this.requireSession(sessionId);
      question = session.runtime.questions[session.runtime.currentQuestionIndex];
      if (question === undefined || question.state !== "REANSWER") {
        return Promise.resolve(toPublicInterviewRuntime(session));
      }
    }

    const identity: CheckpointIdentity = {
      questionId: checkpoint.questionId,
      answerVersion: checkpoint.answerVersion,
      checkpointVersion: checkpoint.checkpointVersion,
    };
    const existing = this.#inFlightEvaluations.get(sessionId);
    if (existing !== undefined) {
      return sameIdentity(existing.identity, identity)
        ? existing.promise
        : Promise.resolve(toPublicInterviewRuntime(session));
    }

    const promise = this.runRepairEvaluation(session, checkpoint).finally(() => {
      const current = this.#inFlightEvaluations.get(sessionId);
      if (current?.promise === promise) {
        this.#inFlightEvaluations.delete(sessionId);
      }
    });
    this.#inFlightEvaluations.set(sessionId, { identity, promise });
    return promise;
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
      return this.clearSemanticCandidates(latestSession);
    }

    const result = evaluation.value;
    if (isCheckpointResultStale(result, latestSession.runtime)) {
      return toPublicInterviewRuntime(latestSession);
    }
    const question = latestSession.runtime.questions[questionIndex];
    if (question === undefined || question.answerStartedAt === null) {
      return toPublicInterviewRuntime(latestSession);
    }

    if (
      result.decision === "CONTINUE" &&
      result.answerBoundary === "ANSWER_COMPLETE_BUT_RAMBLING"
    ) {
      if (checkpoint.kind !== "INTERIM" || question.wrapUpCount !== 0) {
        return this.clearSemanticCandidates(latestSession);
      }

      const candidate = question.semanticWrapUpCandidate;
      if (candidate === null) {
        const runtime = setSemanticWrapUpCandidate(latestSession.runtime, {
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

      const runtime = pauseForWrapUp(latestSession.runtime, {
        checkpointVersion: checkpoint.checkpointVersion,
        triggeredAt: this.#now(),
      });
      return this.saveAndPublish(initialSession.sessionId, runtime);
    }

    if (result.decision !== "ISSUE_DETECTED") {
      return this.clearSemanticCandidates(latestSession);
    }

    const transcriptCharacters = checkpoint.transcriptSnapshot.trim().length;
    const answerDurationMs = checkpoint.createdAt - question.answerStartedAt;
    const isFinalCheckpoint = checkpoint.kind === "FINAL";
    const gateDecisionIfPersistent = arbitrateGate({
      questionPlan,
      interviewState: latestSession.runtime.interviewState,
      questionState: question,
      transcriptSnapshot: checkpoint.transcriptSnapshot,
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
      return this.clearSemanticCandidates(latestSession);
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
      beforeEvaluation: result,
      ...presentation,
    });
    return this.saveAndPublish(initialSession.sessionId, runtime);
  }

  private clearSemanticCandidates(
    session: InterviewSession,
  ): PublicInterviewRuntimeDto {
    const question = session.runtime.questions[session.runtime.currentQuestionIndex];
    if (
      question === undefined ||
      question.state !== "ANSWERING" ||
      (question.semanticIssueCandidate === null &&
        question.semanticWrapUpCandidate === null)
    ) {
      return toPublicInterviewRuntime(session);
    }

    return this.saveAndPublish(
      session.sessionId,
      clearSemanticCandidates(session.runtime),
    );
  }

  private async runRepairEvaluation(
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
    if (!evaluation.ok) {
      return toPublicInterviewRuntime(latestSession);
    }

    const result = evaluation.value;
    if (
      isCheckpointStale(checkpoint, latestSession.runtime) ||
      isCheckpointResultStale(result, latestSession.runtime)
    ) {
      return toPublicInterviewRuntime(latestSession);
    }

    const question = latestSession.runtime.questions[questionIndex];
    if (
      question === undefined ||
      question.state !== "REANSWER" ||
      question.hardGate === null
    ) {
      return toPublicInterviewRuntime(latestSession);
    }

    const repairDecision = arbitrateRepair({
      questionPlan,
      interviewState: latestSession.runtime.interviewState,
      questionState: question,
      originalIssueType: question.hardGate.issueType,
      originalTriggeringCriterion: question.hardGate.triggeringCriterion,
      honestNoMeasurementSatisfiesOriginalCriterion:
        honestNoMeasurementSatisfiesCriterion(
          latestSession,
          questionPlan,
          question.hardGate.triggeringCriterion,
        ),
      semanticResult: result,
      meetsConfidenceThreshold:
        result.confidence >= this.#semanticGateHeuristic.minConfidence,
      surfaceQuestionSupport: repairSurfaceSupport(
        latestSession,
        questionPlan,
        result,
      ),
    });
    const runtime = completeRepair(
      latestSession.runtime,
      result,
      repairDecision,
    );
    return this.saveAndPublish(initialSession.sessionId, runtime);
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
