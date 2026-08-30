import type { QuestionPlan } from "../../src/domain/interview/contracts";
import {
  createCheckpoint,
  getCheckpointEligibility,
  MVP_CHECKPOINT_HEURISTIC,
  MVP_FINAL_CHECKPOINT_MIN_CHARACTERS,
  MVP_SEMANTIC_GATE_HEURISTIC,
  startAnswer,
  updateTranscript as updateDomainTranscript,
  type CheckpointEligibility,
  type CheckpointKind,
} from "../../src/domain/interview/runtime";
import {
  arbitrateGate,
  type GateArbiterDecision,
} from "../../src/domain/semantic/gate-arbiter";
import type { SemanticCheckResult } from "../../src/domain/semantic/contracts";
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
import type { GoldenCoreCase } from "../fixtures/golden-oracle";
import type { GoldenRunPhase } from "./qwen-semantic-run-plan";

const projectContext =
  "The candidate is discussing a science or engineering project. Evaluate only the supplied frozen question and transcript structure.";
const answerStartedAt = 1_000;
const checkpointCreatedAt = 16_000;

export type ProductReplay = Readonly<{
  checkpointKind: CheckpointKind;
  checkpointEligibility: CheckpointEligibility;
  transcriptCharacters: number;
  answerDurationMs: number;
  hasSufficientAnswerContext: boolean;
  persistenceSatisfied: boolean;
  persistenceBasis:
    | "FINAL_COMPLETION"
    | "INTERIM_REQUIRES_MATCHING_NEWER_CHECKPOINT";
  evaluatorCheckpoints: readonly Readonly<{
    kind: CheckpointKind;
    checkpointVersion: number;
  }>[];
  arbiterDecision: GateArbiterDecision;
  arbiterDecisionWithOracleContext: GateArbiterDecision;
  finalProductDecision: "CONTINUE" | "GATE";
  finalRuntimeState: string;
}>;

function checkpointKindFor(
  transcriptKind: GoldenCoreCase["transcriptKind"],
): CheckpointKind {
  return transcriptKind === "ANSWER" ? "FINAL" : "INTERIM";
}

function bindEvaluationToCheckpoint(
  result: LlmResult<SemanticCheckResult>,
  input: EvaluateSemanticCheckpointInput,
): LlmResult<SemanticCheckResult> {
  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    value: {
      ...result.value,
      questionId: input.questionPlan.id,
      checkpointVersion: input.checkpointVersion,
    },
  };
}

function fakeEvaluator(
  result: LlmResult<SemanticCheckResult>,
  plan: QuestionPlan,
  evaluatorCheckpoints: Array<{
    kind: CheckpointKind;
    checkpointVersion: number;
  }>,
): LlmService {
  return {
    model: "captured-qwen-result-replay",
    async generateQuestionPlan() {
      return { ok: true, value: plan };
    },
    async evaluateSemanticCheckpoint(input) {
      evaluatorCheckpoints.push({
        kind: input.checkpointKind,
        checkpointVersion: input.checkpointVersion,
      });
      return bindEvaluationToCheckpoint(result, input);
    },
  };
}

function directArbiterDecision(
  plan: QuestionPlan,
  transcript: string,
  evaluation: LlmResult<SemanticCheckResult>,
  checkpointKind: CheckpointKind,
  useOracleContext: boolean,
): GateArbiterDecision {
  let runtime = startAnswer(
    {
      sessionId: "golden-arbiter-diagnostic",
      interviewState: { state: "NOT_STARTED", activeQuestionId: null },
      runtimeRevision: 0,
      currentQuestionIndex: 0,
      questions: [
        {
          questionId: plan.id,
          state: "QUESTION_READY",
          gateCount: 0,
          answerVersion: 0,
          checkpointVersion: 0,
          transcript: "",
          answerStartedAt: null,
          lastCheckpointAt: null,
          latestCheckpoint: null,
          originalAnswer: null,
          hardGate: null,
          gateOverride: null,
          repairStatus: null,
          semanticIssueCandidate: null,
        },
      ],
    },
    answerStartedAt,
  );
  runtime = updateDomainTranscript(runtime, transcript);
  const checkpointed = createCheckpoint(
    runtime,
    checkpointCreatedAt,
    checkpointKind,
  );
  runtime = checkpointed.runtime;
  const question = runtime.questions[0];
  if (question === undefined) {
    throw new Error("Golden Arbiter diagnostic has no question state");
  }

  const characters = transcript.trim().length;
  const durationMs = checkpointCreatedAt - answerStartedAt;
  const semanticResult = evaluation.ok
    ? {
        ...evaluation.value,
        questionId: plan.id,
        checkpointVersion: checkpointed.checkpoint.checkpointVersion,
      }
    : null;
  const actualContextSufficient =
    checkpointKind === "FINAL"
      ? characters >= MVP_FINAL_CHECKPOINT_MIN_CHARACTERS
      : characters >= MVP_SEMANTIC_GATE_HEURISTIC.minContextCharacters &&
        durationMs >= MVP_SEMANTIC_GATE_HEURISTIC.minContextDurationMs;

  return arbitrateGate({
    questionPlan: plan,
    interviewState: runtime.interviewState,
    questionState: question,
    transcriptSnapshot: transcript,
    semanticResult,
    meetsConfidenceThreshold:
      semanticResult !== null &&
      semanticResult.confidence >= MVP_SEMANTIC_GATE_HEURISTIC.minConfidence,
    surfaceQuestionSupport: "SUPPORTED",
    hasSufficientAnswerContext: useOracleContext
      ? checkpointKind === "FINAL"
      : actualContextSufficient,
    // Runtime confirms INTERIM persistence across checkpoints outside the Arbiter.
    issueIsPersistent: true,
  });
}

export async function replayCapturedSemanticResult(
  fixture: Pick<GoldenCoreCase, "id" | "transcript" | "transcriptKind">,
  phase: GoldenRunPhase,
  run: number,
  plan: QuestionPlan,
  evaluation: LlmResult<SemanticCheckResult>,
): Promise<ProductReplay> {
  let now = answerStartedAt;
  const sessionId = `${phase.toLowerCase()}-${fixture.id}-${run}`;
  const store = new InMemoryInterviewSessionStore({
    ttlMs: 60_000,
    now: () => now,
    idFactory: () => sessionId,
  });
  const session = store.create({
    projectContext,
    scenario: { id: phaseOneScenario.id, version: phaseOneScenario.version },
    questionPlans: [plan],
  });
  const evaluatorCheckpoints: Array<{
    kind: CheckpointKind;
    checkpointVersion: number;
  }> = [];
  const service = new InterviewRuntimeService(
    store,
    fakeEvaluator(evaluation, plan, evaluatorCheckpoints),
    { now: () => now },
  );
  service.start(session.sessionId);
  now = checkpointCreatedAt;

  const answering = store.get(session.sessionId)?.runtime;
  if (answering === undefined) {
    throw new Error("Golden product replay session disappeared");
  }
  const checkpointKind = checkpointKindFor(fixture.transcriptKind);
  const updatedDomain = updateDomainTranscript(answering, fixture.transcript);
  const checkpointEligibility = getCheckpointEligibility(
    updatedDomain,
    now,
    false,
    MVP_CHECKPOINT_HEURISTIC,
    checkpointKind,
  );
  let publicRuntime = service.updateTranscript(
    session.sessionId,
    fixture.transcript,
  );

  if (checkpointKind === "FINAL") {
    publicRuntime = await service.complete(session.sessionId);
  } else if (
    publicRuntime.checkpoint?.kind === "INTERIM" &&
    publicRuntime.checkpoint.freshness === "CURRENT"
  ) {
    const identity: CheckpointIdentity = {
      questionId: publicRuntime.question.questionId,
      answerVersion: publicRuntime.checkpoint.answerVersion,
      checkpointVersion: publicRuntime.checkpoint.checkpointVersion,
    };
    publicRuntime = await service.evaluateCheckpoint(session.sessionId, identity);
  }

  const characters = fixture.transcript.trim().length;
  const durationMs = checkpointCreatedAt - answerStartedAt;
  const isFinal = checkpointKind === "FINAL";
  return {
    checkpointKind,
    checkpointEligibility,
    transcriptCharacters: characters,
    answerDurationMs: durationMs,
    hasSufficientAnswerContext: isFinal
      ? characters >= MVP_FINAL_CHECKPOINT_MIN_CHARACTERS
      : characters >= MVP_SEMANTIC_GATE_HEURISTIC.minContextCharacters &&
        durationMs >= MVP_SEMANTIC_GATE_HEURISTIC.minContextDurationMs,
    persistenceSatisfied: isFinal,
    persistenceBasis: isFinal
      ? "FINAL_COMPLETION"
      : "INTERIM_REQUIRES_MATCHING_NEWER_CHECKPOINT",
    evaluatorCheckpoints,
    arbiterDecision: directArbiterDecision(
      plan,
      fixture.transcript,
      evaluation,
      checkpointKind,
      false,
    ),
    arbiterDecisionWithOracleContext: directArbiterDecision(
      plan,
      fixture.transcript,
      evaluation,
      checkpointKind,
      true,
    ),
    finalProductDecision: publicRuntime.state === "REPAIR" ? "GATE" : "CONTINUE",
    finalRuntimeState: publicRuntime.state,
  };
}
