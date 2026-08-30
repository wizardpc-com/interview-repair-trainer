import { randomUUID } from "node:crypto";
import {
  assertQuestionPlanInvariants,
  type EvidenceRequirement,
  type QuestionPlan,
  type TrainingTarget,
} from "../domain/interview/contracts";
import {
  createInterviewRuntime,
  type InterviewRuntime,
} from "../domain/interview/runtime";
import { createTrainingReport } from "../domain/interview/report";
import type {
  PublicInterviewRuntimeDto,
  PublicInterviewSessionDto,
} from "../lib/interview-api-contracts";

export type SessionScenarioReference = Readonly<{
  id: string;
  version: number;
}>;

export type InterviewSession = Readonly<{
  sessionId: string;
  projectContext: string;
  scenario: SessionScenarioReference;
  questionPlans: readonly QuestionPlan[];
  runtime: InterviewRuntime;
  createdAt: number;
  expiresAt: number;
}>;

export type CreateInterviewSessionRecord = Readonly<{
  projectContext: string;
  scenario: SessionScenarioReference;
  questionPlans: readonly QuestionPlan[];
}>;

export type InMemoryInterviewSessionStoreOptions = Readonly<{
  ttlMs: number;
  now?: () => number;
  idFactory?: () => string;
}>;

function freezeTrainingTarget(target: TrainingTarget): TrainingTarget {
  return Object.freeze({
    id: target.id,
    description: target.description,
  });
}

function freezeEvidenceRequirement(
  evidence: EvidenceRequirement,
): EvidenceRequirement {
  return Object.freeze({
    id: evidence.id,
    description: evidence.description,
  });
}

function freezeQuestionPlan(plan: QuestionPlan): QuestionPlan {
  assertQuestionPlanInvariants(plan);

  return Object.freeze({
    id: plan.id,
    surfaceQuestion: plan.surfaceQuestion,
    primaryTarget: freezeTrainingTarget(plan.primaryTarget),
    requiredEvidence: Object.freeze(
      plan.requiredEvidence.map(freezeEvidenceRequirement),
    ),
    optionalEvidence: Object.freeze(
      plan.optionalEvidence.map(freezeEvidenceRequirement),
    ),
    allowedGateIssueTypes: Object.freeze([...plan.allowedGateIssueTypes]),
  });
}

export function toPublicInterviewSession(
  session: InterviewSession,
): PublicInterviewSessionDto {
  const questions = Object.freeze(
    session.questionPlans.map((plan) =>
      Object.freeze({
        questionId: plan.id,
        surfaceQuestion: plan.surfaceQuestion,
      }),
    ),
  );

  return Object.freeze({
    sessionId: session.sessionId,
    questions,
  });
}

export function toPublicInterviewRuntime(
  session: InterviewSession,
): PublicInterviewRuntimeDto {
  const questionIndex = session.runtime.currentQuestionIndex;
  const questionRuntime = session.runtime.questions[questionIndex];
  const questionPlan = session.questionPlans[questionIndex];

  if (questionRuntime === undefined || questionPlan === undefined) {
    throw new Error("Stored session has no current question");
  }

  const checkpoint = questionRuntime.latestCheckpoint;
  let latestCompletedQuestionIndex = -1;
  for (let index = 0; index < session.runtime.questions.length; index += 1) {
    if (session.runtime.questions[index]?.state === "QUESTION_DONE") {
      latestCompletedQuestionIndex = index;
    }
  }
  const latestCompletedQuestion =
    latestCompletedQuestionIndex === -1
      ? null
      : session.runtime.questions[latestCompletedQuestionIndex] ?? null;

  return Object.freeze({
    sessionId: session.sessionId,
    runtimeRevision: session.runtime.runtimeRevision,
    question: Object.freeze({
      questionId: questionPlan.id,
      surfaceQuestion: questionPlan.surfaceQuestion,
      index: questionIndex + 1,
      total: session.questionPlans.length,
    }),
    state: questionRuntime.state,
    transcript: questionRuntime.transcript,
    answerAttempt: questionRuntime.answerAttempt,
    answerVersion: questionRuntime.answerVersion,
    checkpointVersion: questionRuntime.checkpointVersion,
    checkpoint:
      checkpoint === null
        ? null
        : Object.freeze({
            answerVersion: checkpoint.answerVersion,
            checkpointVersion: checkpoint.checkpointVersion,
            createdAt: checkpoint.createdAt,
            kind: checkpoint.kind,
            freshness:
              (questionRuntime.state === "ANSWERING" ||
                questionRuntime.state === "REANSWER") &&
              questionRuntime.answerVersion === checkpoint.answerVersion &&
              questionRuntime.checkpointVersion === checkpoint.checkpointVersion
                ? "CURRENT"
                : "STALE",
          }),
    wrapUpPrompt:
      questionRuntime.state === "WRAP_UP" && questionRuntime.wrapUp !== null
        ? Object.freeze({
            title: "核心已经回答" as const,
            message:
              "你已经回应了问题核心，后面的内容开始偏离当前问题。",
          })
        : null,
    hardGate:
      (questionRuntime.state === "REPAIR" ||
        questionRuntime.state === "REANSWER") &&
      questionRuntime.hardGate !== null &&
      questionRuntime.repairStatus !== null
        ? Object.freeze({
            status: questionRuntime.repairStatus,
            title:
              questionRuntime.state === "REANSWER"
                ? "正在重新回答"
                : "回答已暂停",
            whyPaused: questionRuntime.hardGate.whyPaused,
            repairCue: questionRuntime.hardGate.repairCue,
            originalAnswer:
              questionRuntime.originalAnswer ?? questionRuntime.transcript,
          })
        : null,
    repairResult:
      questionRuntime.repairOutcome === null
        ? null
        : Object.freeze({
            status: questionRuntime.repairOutcome,
            title:
              questionRuntime.repairOutcome === "SUCCESSFUL"
                ? "修复成功"
                : "仍未解决",
          }),
    completedQuestionResult:
      latestCompletedQuestion?.repairOutcome === null ||
      latestCompletedQuestion?.repairOutcome === undefined
        ? null
        : Object.freeze({
            index: latestCompletedQuestionIndex + 1,
            status: latestCompletedQuestion.repairOutcome,
            title:
              latestCompletedQuestion.repairOutcome === "SUCCESSFUL"
                ? ("修复成功" as const)
                : ("仍未解决" as const),
            hasNextQuestion:
              latestCompletedQuestionIndex < session.questionPlans.length - 1,
          }),
    report:
      session.runtime.interviewState.state === "INTERVIEW_DONE"
        ? createTrainingReport(session.runtime, session.questionPlans)
        : null,
  });
}

export class InMemoryInterviewSessionStore {
  readonly #sessions = new Map<string, InterviewSession>();
  readonly #ttlMs: number;
  readonly #now: () => number;
  readonly #idFactory: () => string;

  constructor(options: InMemoryInterviewSessionStoreOptions) {
    if (!Number.isSafeInteger(options.ttlMs) || options.ttlMs <= 0) {
      throw new Error("Session TTL must be a positive integer in milliseconds");
    }

    this.#ttlMs = options.ttlMs;
    this.#now = options.now ?? Date.now;
    this.#idFactory = options.idFactory ?? randomUUID;
  }

  create(input: CreateInterviewSessionRecord): InterviewSession {
    if (input.questionPlans.length === 0) {
      throw new Error("Interview session requires at least one QuestionPlan");
    }

    const sessionId = this.#idFactory();
    if (this.#sessions.has(sessionId)) {
      throw new Error(`Interview session id already exists: ${sessionId}`);
    }

    const createdAt = this.#now();
    const questionPlans = Object.freeze(input.questionPlans.map(freezeQuestionPlan));
    const session = Object.freeze({
      sessionId,
      projectContext: input.projectContext,
      scenario: Object.freeze({
        id: input.scenario.id,
        version: input.scenario.version,
      }),
      questionPlans,
      runtime: createInterviewRuntime(
        sessionId,
        questionPlans.map(({ id }) => id),
      ),
      createdAt,
      expiresAt: createdAt + this.#ttlMs,
    });

    this.#sessions.set(sessionId, session);
    return session;
  }

  updateRuntime(
    sessionId: string,
    runtime: InterviewRuntime,
  ): InterviewSession | null {
    const session = this.get(sessionId);
    if (session === null) {
      return null;
    }
    if (runtime.sessionId !== sessionId) {
      throw new Error("Runtime session id does not match stored session");
    }

    const storedQuestionIds = session.questionPlans.map(({ id }) => id);
    const runtimeQuestionIds = runtime.questions.map(({ questionId }) => questionId);
    if (
      storedQuestionIds.length !== runtimeQuestionIds.length ||
      storedQuestionIds.some((id, index) => id !== runtimeQuestionIds[index])
    ) {
      throw new Error("Runtime question ids do not match the frozen QuestionPlans");
    }

    const updatedSession = Object.freeze({ ...session, runtime });
    this.#sessions.set(sessionId, updatedSession);
    return updatedSession;
  }

  get(sessionId: string): InterviewSession | null {
    const session = this.#sessions.get(sessionId);
    if (session === undefined) {
      return null;
    }

    if (this.#now() >= session.expiresAt) {
      this.#sessions.delete(sessionId);
      return null;
    }

    return session;
  }

  cleanupExpired(): number {
    const now = this.#now();
    let removed = 0;

    for (const [sessionId, session] of this.#sessions) {
      if (now >= session.expiresAt) {
        this.#sessions.delete(sessionId);
        removed += 1;
      }
    }

    return removed;
  }

  get size(): number {
    this.cleanupExpired();
    return this.#sessions.size;
  }
}
