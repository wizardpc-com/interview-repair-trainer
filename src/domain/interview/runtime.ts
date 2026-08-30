import type {
  InterviewRuntimeState,
  QuestionRuntimeState,
  QuestionState,
} from "./state";
import type {
  GateCriterion,
  GateIssueType,
  SemanticCheckResult,
} from "../semantic/contracts";

/** MVP tunable heuristic; these thresholds are not scientifically calibrated. */
export const MVP_CHECKPOINT_HEURISTIC = Object.freeze({
  minTranscriptCharacters: 80,
  minAnswerDurationMs: 5_000,
  minCheckpointIntervalMs: 8_000,
});

export const MVP_FINAL_CHECKPOINT_MIN_CHARACTERS = 4;

/** MVP tunable heuristic; confidence is an uncalibrated gating input. */
export const MVP_SEMANTIC_GATE_HEURISTIC = Object.freeze({
  minContextCharacters: 80,
  minContextDurationMs: 5_000,
  minConfidence: 0.8,
});

export type CheckpointHeuristic = Readonly<{
  minTranscriptCharacters: number;
  minAnswerDurationMs: number;
  minCheckpointIntervalMs: number;
}>;

export type SemanticGateHeuristic = Readonly<{
  minContextCharacters: number;
  minContextDurationMs: number;
  minConfidence: number;
}>;

export const CHECKPOINT_KINDS = ["INTERIM", "FINAL"] as const;
export type CheckpointKind = (typeof CHECKPOINT_KINDS)[number];

export type SemanticCheckpoint = Readonly<{
  sessionId: string;
  questionId: string;
  answerVersion: number;
  checkpointVersion: number;
  transcriptSnapshot: string;
  createdAt: number;
  kind: CheckpointKind;
}>;

export type SemanticIssueCandidate = Readonly<{
  issueType: GateIssueType;
  triggeringCriterion: GateCriterion;
  answerVersion: number;
  checkpointVersion: number;
}>;

export type HardGateInterruption = Readonly<{
  issueType: GateIssueType;
  triggeringCriterion: GateCriterion;
  checkpointVersion: number;
  triggeredAt: number;
  whyPaused: string;
  repairCue: string;
  beforeEvaluation: Extract<
    SemanticCheckResult,
    { decision: "ISSUE_DETECTED" }
  >;
}>;

export type GateOverrideRecord = Readonly<{
  checkpointVersion: number;
  recordedAt: number;
}>;

export type RepairStatus = "GATE_PENDING" | "REANSWERING";

export type RepairOutcome = "SUCCESSFUL" | "UNRESOLVED";

export type AnswerRuntimeState = QuestionRuntimeState &
  Readonly<{
    transcript: string;
    answerStartedAt: number | null;
    lastCheckpointAt: number | null;
    latestCheckpoint: SemanticCheckpoint | null;
    answerAttempt: 1 | 2;
    originalAnswer: string | null;
    repairedAnswer: string | null;
    hardGate: HardGateInterruption | null;
    gateOverride: GateOverrideRecord | null;
    repairStatus: RepairStatus | null;
    semanticIssueCandidate: SemanticIssueCandidate | null;
    afterEvaluation: SemanticCheckResult | null;
    repairOutcome: RepairOutcome | null;
  }>;

export type InterviewRuntime = Readonly<{
  sessionId: string;
  interviewState: InterviewRuntimeState;
  runtimeRevision: number;
  currentQuestionIndex: number;
  questions: readonly AnswerRuntimeState[];
}>;

export type CheckpointEligibility = Readonly<{
  eligible: boolean;
  reason:
    | "ELIGIBLE"
    | "INVALID_STATE"
    | "REQUEST_IN_FLIGHT"
    | "GATE_CAPACITY_EXHAUSTED"
    | "ANSWER_UNCHANGED"
    | "TRANSCRIPT_TOO_SHORT"
    | "ANSWER_TOO_NEW"
    | "CHECKPOINT_TOO_RECENT";
}>;

export type RuntimeErrorCode =
  | "INVALID_TRANSITION"
  | "EMPTY_ANSWER"
  | "INVALID_RUNTIME";

export class InterviewRuntimeError extends Error {
  constructor(
    readonly code: RuntimeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "InterviewRuntimeError";
  }
}

const ALLOWED_QUESTION_TRANSITIONS = {
  QUESTION_READY: Object.freeze(["ANSWERING"]),
  ANSWERING: Object.freeze(["REPAIR", "QUESTION_DONE"]),
  REPAIR: Object.freeze(["ANSWERING", "REANSWER"]),
  REANSWER: Object.freeze(["QUESTION_DONE"]),
  QUESTION_DONE: Object.freeze([]),
} as const satisfies Readonly<Record<QuestionState, readonly QuestionState[]>>;

function freezeSemanticCheckResult<T extends SemanticCheckResult>(
  result: T,
): T {
  if (result.decision === "CONTINUE") {
    return Object.freeze({ ...result }) as T;
  }

  return Object.freeze({
    ...result,
    triggeringCriterion: Object.freeze({ ...result.triggeringCriterion }),
  }) as T;
}

function freezeQuestionState(
  state: AnswerRuntimeState,
): AnswerRuntimeState {
  return Object.freeze({
    ...state,
    latestCheckpoint:
      state.latestCheckpoint === null
        ? null
        : Object.freeze({ ...state.latestCheckpoint }),
    hardGate:
      state.hardGate === null
        ? null
        : Object.freeze({
            ...state.hardGate,
            triggeringCriterion: Object.freeze({
              ...state.hardGate.triggeringCriterion,
            }),
            beforeEvaluation: freezeSemanticCheckResult(
              state.hardGate.beforeEvaluation,
            ),
          }),
    gateOverride:
      state.gateOverride === null
        ? null
        : Object.freeze({ ...state.gateOverride }),
    semanticIssueCandidate:
      state.semanticIssueCandidate === null
        ? null
        : Object.freeze({
            ...state.semanticIssueCandidate,
            triggeringCriterion: Object.freeze({
              ...state.semanticIssueCandidate.triggeringCriterion,
            }),
          }),
    afterEvaluation:
      state.afterEvaluation === null
        ? null
        : freezeSemanticCheckResult(state.afterEvaluation),
  });
}

function freezeRuntime(
  runtime: Omit<InterviewRuntime, "questions"> & {
    questions: readonly AnswerRuntimeState[];
  },
): InterviewRuntime {
  return Object.freeze({
    ...runtime,
    interviewState: Object.freeze({ ...runtime.interviewState }),
    questions: Object.freeze(runtime.questions.map(freezeQuestionState)),
  });
}

function currentQuestion(runtime: InterviewRuntime): AnswerRuntimeState {
  const question = runtime.questions[runtime.currentQuestionIndex];
  if (question === undefined) {
    throw new InterviewRuntimeError(
      "INVALID_RUNTIME",
      "Interview runtime has no current question",
    );
  }
  return question;
}

function replaceCurrentQuestion(
  runtime: InterviewRuntime,
  question: AnswerRuntimeState,
  interviewState: InterviewRuntimeState = runtime.interviewState,
  currentQuestionIndex = runtime.currentQuestionIndex,
): InterviewRuntime {
  const questions = [...runtime.questions];
  questions[runtime.currentQuestionIndex] = question;

  return freezeRuntime({
    ...runtime,
    runtimeRevision: runtime.runtimeRevision + 1,
    interviewState,
    currentQuestionIndex,
    questions,
  });
}

function assertTransition(from: QuestionState, to: QuestionState): void {
  if (!isQuestionTransitionAllowed(from, to)) {
    throw new InterviewRuntimeError(
      "INVALID_TRANSITION",
      `Cannot transition question from ${from} to ${to}`,
    );
  }
}

function assertAnswerActive(question: AnswerRuntimeState): void {
  if (question.state !== "ANSWERING" && question.state !== "REANSWER") {
    throw new InterviewRuntimeError(
      "INVALID_TRANSITION",
      `Cannot update an answer while question is ${question.state}`,
    );
  }
}

function assertAnswering(question: AnswerRuntimeState): void {
  if (question.state !== "ANSWERING") {
    throw new InterviewRuntimeError(
      "INVALID_TRANSITION",
      `Cannot update an initial answer while question is ${question.state}`,
    );
  }
}

export function isQuestionTransitionAllowed(
  from: QuestionState,
  to: QuestionState,
): boolean {
  return (
    ALLOWED_QUESTION_TRANSITIONS[from] as readonly QuestionState[]
  ).includes(to);
}

export function createInterviewRuntime(
  sessionId: string,
  questionIds: readonly string[],
): InterviewRuntime {
  if (questionIds.length === 0 || new Set(questionIds).size !== questionIds.length) {
    throw new InterviewRuntimeError(
      "INVALID_RUNTIME",
      "Interview runtime requires unique question ids",
    );
  }

  return freezeRuntime({
    sessionId,
    interviewState: { state: "NOT_STARTED", activeQuestionId: null },
    runtimeRevision: 0,
    currentQuestionIndex: 0,
    questions: questionIds.map((questionId) => ({
      questionId,
      state: "QUESTION_READY",
      gateCount: 0,
      answerVersion: 0,
      checkpointVersion: 0,
      transcript: "",
      answerStartedAt: null,
      lastCheckpointAt: null,
      latestCheckpoint: null,
      answerAttempt: 1,
      originalAnswer: null,
      repairedAnswer: null,
      hardGate: null,
      gateOverride: null,
      repairStatus: null,
      semanticIssueCandidate: null,
      afterEvaluation: null,
      repairOutcome: null,
    })),
  });
}

export function startAnswer(
  runtime: InterviewRuntime,
  startedAt: number,
): InterviewRuntime {
  const question = currentQuestion(runtime);
  assertTransition(question.state, "ANSWERING");

  return replaceCurrentQuestion(
    runtime,
    {
      ...question,
      state: "ANSWERING",
      answerStartedAt: startedAt,
    },
    { state: "IN_PROGRESS", activeQuestionId: question.questionId },
  );
}

export function updateTranscript(
  runtime: InterviewRuntime,
  transcript: string,
): InterviewRuntime {
  const question = currentQuestion(runtime);
  assertAnswerActive(question);

  if (transcript === question.transcript) {
    return runtime;
  }

  return replaceCurrentQuestion(runtime, {
    ...question,
    transcript,
    answerVersion: question.answerVersion + 1,
  });
}

export function getCheckpointEligibility(
  runtime: InterviewRuntime,
  now: number,
  isRequestInFlight: boolean,
  heuristic: CheckpointHeuristic = MVP_CHECKPOINT_HEURISTIC,
  kind: CheckpointKind = "INTERIM",
): CheckpointEligibility {
  const question = currentQuestion(runtime);

  if (question.state !== "ANSWERING" || question.answerStartedAt === null) {
    return { eligible: false, reason: "INVALID_STATE" };
  }
  if (isRequestInFlight) {
    return { eligible: false, reason: "REQUEST_IN_FLIGHT" };
  }
  if (question.gateCount !== 0) {
    return { eligible: false, reason: "GATE_CAPACITY_EXHAUSTED" };
  }
  if (
    question.latestCheckpoint?.answerVersion === question.answerVersion &&
    (kind === "INTERIM" || question.latestCheckpoint.kind === "FINAL")
  ) {
    return { eligible: false, reason: "ANSWER_UNCHANGED" };
  }
  const minimumTranscriptCharacters =
    kind === "FINAL"
      ? MVP_FINAL_CHECKPOINT_MIN_CHARACTERS
      : heuristic.minTranscriptCharacters;
  if (question.transcript.trim().length < minimumTranscriptCharacters) {
    return { eligible: false, reason: "TRANSCRIPT_TOO_SHORT" };
  }
  if (kind === "FINAL") {
    return { eligible: true, reason: "ELIGIBLE" };
  }
  if (now - question.answerStartedAt < heuristic.minAnswerDurationMs) {
    return { eligible: false, reason: "ANSWER_TOO_NEW" };
  }
  if (
    question.lastCheckpointAt !== null &&
    now - question.lastCheckpointAt < heuristic.minCheckpointIntervalMs
  ) {
    return { eligible: false, reason: "CHECKPOINT_TOO_RECENT" };
  }

  return { eligible: true, reason: "ELIGIBLE" };
}

export function createCheckpoint(
  runtime: InterviewRuntime,
  createdAt: number,
  kind: CheckpointKind = "INTERIM",
): Readonly<{ runtime: InterviewRuntime; checkpoint: SemanticCheckpoint }> {
  const question = currentQuestion(runtime);
  assertAnswerActive(question);

  if (question.transcript.trim().length === 0) {
    throw new InterviewRuntimeError(
      "EMPTY_ANSWER",
      "Cannot checkpoint an empty answer",
    );
  }

  const checkpoint = Object.freeze({
    sessionId: runtime.sessionId,
    questionId: question.questionId,
    answerVersion: question.answerVersion,
    checkpointVersion: question.checkpointVersion + 1,
    transcriptSnapshot: question.transcript,
    createdAt,
    kind,
  });

  return Object.freeze({
    checkpoint,
    runtime: replaceCurrentQuestion(runtime, {
      ...question,
      checkpointVersion: checkpoint.checkpointVersion,
      lastCheckpointAt: createdAt,
      latestCheckpoint: checkpoint,
    }),
  });
}

export function setSemanticIssueCandidate(
  runtime: InterviewRuntime,
  candidate: SemanticIssueCandidate | null,
): InterviewRuntime {
  const question = currentQuestion(runtime);
  assertAnswering(question);

  const current = question.semanticIssueCandidate;
  if (
    current === candidate ||
    (current === null && candidate === null)
  ) {
    return runtime;
  }

  return replaceCurrentQuestion(runtime, {
    ...question,
    semanticIssueCandidate: candidate,
  });
}

export function isCheckpointStale(
  checkpoint: SemanticCheckpoint,
  runtime: InterviewRuntime,
): boolean {
  if (checkpoint.sessionId !== runtime.sessionId) {
    return true;
  }

  const question = runtime.questions.find(
    ({ questionId }) => questionId === checkpoint.questionId,
  );

  return (
    question === undefined ||
    (question.state !== "ANSWERING" && question.state !== "REANSWER") ||
    question.answerVersion !== checkpoint.answerVersion ||
    question.checkpointVersion !== checkpoint.checkpointVersion ||
    question.latestCheckpoint?.checkpointVersion !== checkpoint.checkpointVersion
  );
}

export function isCheckpointResultStale(
  result: Pick<SemanticCheckResult, "questionId" | "checkpointVersion">,
  runtime: InterviewRuntime,
): boolean {
  const question = runtime.questions.find(
    ({ questionId }) => questionId === result.questionId,
  );
  const checkpoint = question?.latestCheckpoint;

  return (
    checkpoint === null ||
    checkpoint === undefined ||
    checkpoint.checkpointVersion !== result.checkpointVersion ||
    isCheckpointStale(checkpoint, runtime)
  );
}

export function interruptForHardGate(
  runtime: InterviewRuntime,
  interruption: HardGateInterruption,
): InterviewRuntime {
  const question = currentQuestion(runtime);
  assertTransition(question.state, "REPAIR");

  if (
    question.gateCount !== 0 ||
    question.latestCheckpoint === null ||
    question.latestCheckpoint.checkpointVersion !== interruption.checkpointVersion ||
    question.latestCheckpoint.answerVersion !== question.answerVersion ||
    question.latestCheckpoint.transcriptSnapshot !== question.transcript ||
    interruption.beforeEvaluation.questionId !== question.questionId ||
    interruption.beforeEvaluation.checkpointVersion !==
      interruption.checkpointVersion ||
    interruption.beforeEvaluation.issueType !== interruption.issueType ||
    interruption.beforeEvaluation.triggeringCriterion.kind !==
      interruption.triggeringCriterion.kind ||
    interruption.beforeEvaluation.triggeringCriterion.id !==
      interruption.triggeringCriterion.id
  ) {
    throw new InterviewRuntimeError(
      "INVALID_RUNTIME",
      "Hard Gate interruption does not match the current checkpoint",
    );
  }

  return replaceCurrentQuestion(runtime, {
    ...question,
    state: "REPAIR",
    gateCount: 1,
    originalAnswer: question.transcript,
    hardGate: interruption,
    gateOverride: null,
    repairStatus: "GATE_PENDING",
    latestCheckpoint: null,
    semanticIssueCandidate: null,
    afterEvaluation: null,
    repairOutcome: null,
  });
}

export function overrideHardGate(
  runtime: InterviewRuntime,
  recordedAt: number,
): InterviewRuntime {
  const question = currentQuestion(runtime);
  assertTransition(question.state, "ANSWERING");

  if (
    question.hardGate === null ||
    question.originalAnswer === null ||
    question.gateCount !== 1 ||
    question.repairStatus !== "GATE_PENDING"
  ) {
    throw new InterviewRuntimeError(
      "INVALID_TRANSITION",
      "Cannot override a question without a pending Hard Gate decision",
    );
  }

  return replaceCurrentQuestion(runtime, {
    ...question,
    state: "ANSWERING",
    gateOverride: Object.freeze({
      checkpointVersion: question.hardGate.checkpointVersion,
      recordedAt,
    }),
    repairStatus: null,
    latestCheckpoint: null,
    semanticIssueCandidate: null,
  });
}

export function startReanswer(
  runtime: InterviewRuntime,
  startedAt: number,
): InterviewRuntime {
  const question = currentQuestion(runtime);

  if (
    question.state !== "REPAIR" ||
    question.hardGate === null ||
    question.originalAnswer === null ||
    question.gateOverride !== null ||
    question.gateCount !== 1 ||
    question.repairStatus !== "GATE_PENDING"
  ) {
    throw new InterviewRuntimeError(
      "INVALID_TRANSITION",
      `Cannot start a re-answer while question is ${question.state}`,
    );
  }

  assertTransition(question.state, "REANSWER");

  return replaceCurrentQuestion(runtime, {
    ...question,
    state: "REANSWER",
    transcript: "",
    answerStartedAt: startedAt,
    lastCheckpointAt: null,
    latestCheckpoint: null,
    answerVersion: question.answerVersion + 1,
    answerAttempt: 2,
    repairedAnswer: null,
    repairStatus: "REANSWERING",
    semanticIssueCandidate: null,
    afterEvaluation: null,
    repairOutcome: null,
  });
}

export function completeAnswer(runtime: InterviewRuntime): InterviewRuntime {
  const question = currentQuestion(runtime);
  assertTransition(question.state, "QUESTION_DONE");

  if (question.state !== "ANSWERING") {
    throw new InterviewRuntimeError(
      "INVALID_TRANSITION",
      `Cannot complete an initial answer while question is ${question.state}`,
    );
  }

  if (question.transcript.trim().length === 0) {
    throw new InterviewRuntimeError(
      "EMPTY_ANSWER",
      "Cannot complete an empty answer",
    );
  }

  const nextQuestionIndex = runtime.currentQuestionIndex + 1;
  const nextQuestion = runtime.questions[nextQuestionIndex];
  const interviewState: InterviewRuntimeState =
    nextQuestion === undefined
      ? { state: "INTERVIEW_DONE", activeQuestionId: null }
      : { state: "IN_PROGRESS", activeQuestionId: nextQuestion.questionId };

  return replaceCurrentQuestion(
    runtime,
    { ...question, state: "QUESTION_DONE", semanticIssueCandidate: null },
    interviewState,
    nextQuestion === undefined ? runtime.currentQuestionIndex : nextQuestionIndex,
  );
}

export function completeRepair(
  runtime: InterviewRuntime,
  afterEvaluation: SemanticCheckResult,
  outcome: RepairOutcome,
): InterviewRuntime {
  const question = currentQuestion(runtime);

  if (
    question.state !== "REANSWER" ||
    question.answerAttempt !== 2 ||
    question.repairStatus !== "REANSWERING" ||
    question.originalAnswer === null ||
    question.hardGate === null ||
    question.gateCount !== 1 ||
    question.latestCheckpoint === null ||
    question.latestCheckpoint.answerVersion !== question.answerVersion ||
    question.latestCheckpoint.transcriptSnapshot !== question.transcript ||
    afterEvaluation.questionId !== question.questionId ||
    afterEvaluation.checkpointVersion !==
      question.latestCheckpoint.checkpointVersion
  ) {
    throw new InterviewRuntimeError(
      "INVALID_RUNTIME",
      "Repair evaluation does not match the current re-answer checkpoint",
    );
  }

  if (question.transcript.trim().length === 0) {
    throw new InterviewRuntimeError(
      "EMPTY_ANSWER",
      "Cannot complete an empty re-answer",
    );
  }

  const nextQuestionIndex = runtime.currentQuestionIndex + 1;
  const nextQuestion = runtime.questions[nextQuestionIndex];
  const interviewState: InterviewRuntimeState =
    nextQuestion === undefined
      ? { state: "INTERVIEW_DONE", activeQuestionId: null }
      : { state: "IN_PROGRESS", activeQuestionId: nextQuestion.questionId };

  return replaceCurrentQuestion(
    runtime,
    {
      ...question,
      state: "QUESTION_DONE",
      repairedAnswer: question.latestCheckpoint.transcriptSnapshot,
      repairStatus: null,
      afterEvaluation: freezeSemanticCheckResult(afterEvaluation),
      repairOutcome: outcome,
      latestCheckpoint: null,
      semanticIssueCandidate: null,
    },
    interviewState,
    nextQuestion === undefined ? runtime.currentQuestionIndex : nextQuestionIndex,
  );
}
