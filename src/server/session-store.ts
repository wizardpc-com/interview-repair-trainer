import { randomUUID } from "node:crypto";
import {
  assertQuestionPlanInvariants,
  type EvidenceRequirement,
  type QuestionPlan,
  type TrainingTarget,
} from "../domain/interview/contracts";

export type SessionScenarioReference = Readonly<{
  id: string;
  version: number;
}>;

export type InterviewSession = Readonly<{
  sessionId: string;
  projectContext: string;
  scenario: SessionScenarioReference;
  questionPlans: readonly QuestionPlan[];
  createdAt: number;
  expiresAt: number;
}>;

export type PublicQuestionDto = Readonly<{
  questionId: string;
  surfaceQuestion: string;
}>;

export type PublicInterviewSessionDto = Readonly<{
  sessionId: string;
  questions: readonly PublicQuestionDto[];
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
    const session = Object.freeze({
      sessionId,
      projectContext: input.projectContext,
      scenario: Object.freeze({
        id: input.scenario.id,
        version: input.scenario.version,
      }),
      questionPlans: Object.freeze(input.questionPlans.map(freezeQuestionPlan)),
      createdAt,
      expiresAt: createdAt + this.#ttlMs,
    });

    this.#sessions.set(sessionId, session);
    return session;
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
