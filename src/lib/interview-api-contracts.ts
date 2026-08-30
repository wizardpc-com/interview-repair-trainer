import { z } from "zod";
import { CHECKPOINT_KINDS } from "../domain/interview/runtime";
import { QUESTION_STATES } from "../domain/interview/state";

const nonEmptyString = z.string().trim().min(1);

export const createSessionRequestSchema = z
  .object({
    projectContext: nonEmptyString.max(10_000),
  })
  .strict();

export const answerActionRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("START") }).strict(),
  z
    .object({
      action: z.literal("UPDATE_TRANSCRIPT"),
      transcript: z.string().max(20_000),
      answerAttempt: z.union([z.literal(1), z.literal(2)]),
    })
    .strict(),
  z
    .object({
      action: z.literal("EVALUATE_CHECKPOINT"),
      questionId: nonEmptyString,
      answerVersion: z.number().int().positive(),
      checkpointVersion: z.number().int().positive(),
    })
    .strict(),
  z.object({ action: z.literal("OVERRIDE_GATE") }).strict(),
  z.object({ action: z.literal("CONTINUE_AFTER_WRAP_UP") }).strict(),
  z.object({ action: z.literal("START_REANSWER") }).strict(),
  z.object({ action: z.literal("COMPLETE") }).strict(),
]);

export const publicInterviewSessionSchema = z
  .object({
    sessionId: nonEmptyString,
    questions: z.array(
      z
        .object({
          questionId: nonEmptyString,
          surfaceQuestion: nonEmptyString,
        })
        .strict(),
    ),
  })
  .strict();

const publicCheckpointSchema = z
  .object({
    answerVersion: z.number().int().nonnegative(),
    checkpointVersion: z.number().int().positive(),
    createdAt: z.number().finite(),
    kind: z.enum(CHECKPOINT_KINDS),
    freshness: z.enum(["CURRENT", "STALE"]),
  })
  .strict();

const publicHardGateSchema = z
  .object({
    status: z.enum(["GATE_PENDING", "REANSWERING"]),
    title: nonEmptyString,
    whyPaused: nonEmptyString,
    repairCue: nonEmptyString,
    originalAnswer: z.string(),
  })
  .strict();

const publicRepairResultSchema = z
  .object({
    status: z.enum(["SUCCESSFUL", "UNRESOLVED"]),
    title: z.enum(["修复成功", "仍未解决"]),
  })
  .strict();

const publicCompletedQuestionResultSchema = z
  .object({
    index: z.number().int().positive(),
    status: z.enum(["SUCCESSFUL", "UNRESOLVED"]),
    title: z.enum(["修复成功", "仍未解决"]),
    hasNextQuestion: z.boolean(),
  })
  .strict();

const publicTrainingReportSchema = z
  .object({
    completedQuestions: z.number().int().nonnegative(),
    firstPassQuestions: z.number().int().nonnegative(),
    hardGateCount: z.number().int().nonnegative(),
    repairCount: z.number().int().nonnegative(),
    repairSuccessfulCount: z.number().int().nonnegative(),
    unresolvedCount: z.number().int().nonnegative(),
    questions: z.array(
      z
        .object({
          index: z.number().int().positive(),
          question: nonEmptyString,
          finalAnswer: z.string(),
          hardGate: z
            .object({
              whyPaused: nonEmptyString,
              originalAnswer: z.string(),
              repairAnswer: z.string().nullable(),
              repairResult: z.enum(["修复成功", "仍未解决"]).nullable(),
              overridden: z.boolean(),
            })
            .strict()
            .nullable(),
        })
        .strict(),
    ),
  })
  .strict();

const publicWrapUpPromptSchema = z
  .object({
    title: z.literal("核心已经回答"),
    message: nonEmptyString,
  })
  .strict();

export const publicInterviewRuntimeSchema = z
  .object({
    sessionId: nonEmptyString,
    runtimeRevision: z.number().int().nonnegative(),
    question: z
      .object({
        questionId: nonEmptyString,
        surfaceQuestion: nonEmptyString,
        index: z.number().int().positive(),
        total: z.number().int().positive(),
      })
      .strict(),
    state: z.enum(QUESTION_STATES),
    transcript: z.string(),
    answerAttempt: z.union([z.literal(1), z.literal(2)]),
    answerVersion: z.number().int().nonnegative(),
    checkpointVersion: z.number().int().nonnegative(),
    checkpoint: publicCheckpointSchema.nullable(),
    wrapUpPrompt: publicWrapUpPromptSchema.nullable(),
    hardGate: publicHardGateSchema.nullable(),
    repairResult: publicRepairResultSchema.nullable(),
    completedQuestionResult: publicCompletedQuestionResultSchema.nullable(),
    report: publicTrainingReportSchema.nullable(),
  })
  .strict();

export const createSessionResponseSchema = z
  .object({
    session: publicInterviewSessionSchema,
    runtime: publicInterviewRuntimeSchema,
  })
  .strict();

export const answerActionResponseSchema = z
  .object({ runtime: publicInterviewRuntimeSchema })
  .strict();

export const apiErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: nonEmptyString,
        message: nonEmptyString,
      })
      .strict(),
  })
  .strict();

export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;
export type AnswerActionRequest = z.infer<typeof answerActionRequestSchema>;
export type PublicInterviewSessionDto = Readonly<{
  sessionId: string;
  questions: readonly Readonly<{
    questionId: string;
    surfaceQuestion: string;
  }>[];
}>;
export type PublicInterviewRuntimeDto = Readonly<{
  sessionId: string;
  runtimeRevision: number;
  question: Readonly<{
    questionId: string;
    surfaceQuestion: string;
    index: number;
    total: number;
  }>;
  state: z.infer<typeof publicInterviewRuntimeSchema>["state"];
  transcript: string;
  answerAttempt: 1 | 2;
  answerVersion: number;
  checkpointVersion: number;
  checkpoint: Readonly<{
    answerVersion: number;
    checkpointVersion: number;
    createdAt: number;
    kind: (typeof CHECKPOINT_KINDS)[number];
    freshness: "CURRENT" | "STALE";
  }> | null;
  wrapUpPrompt: Readonly<{
    title: "核心已经回答";
    message: string;
  }> | null;
  hardGate: Readonly<{
    status: "GATE_PENDING" | "REANSWERING";
    title: string;
    whyPaused: string;
    repairCue: string;
    originalAnswer: string;
  }> | null;
  repairResult: Readonly<{
    status: "SUCCESSFUL" | "UNRESOLVED";
    title: "修复成功" | "仍未解决";
  }> | null;
  completedQuestionResult: Readonly<{
    index: number;
    status: "SUCCESSFUL" | "UNRESOLVED";
    title: "修复成功" | "仍未解决";
    hasNextQuestion: boolean;
  }> | null;
  report: Readonly<{
    completedQuestions: number;
    firstPassQuestions: number;
    hardGateCount: number;
    repairCount: number;
    repairSuccessfulCount: number;
    unresolvedCount: number;
    questions: readonly Readonly<{
      index: number;
      question: string;
      finalAnswer: string;
      hardGate: Readonly<{
        whyPaused: string;
        originalAnswer: string;
        repairAnswer: string | null;
        repairResult: "修复成功" | "仍未解决" | null;
        overridden: boolean;
      }> | null;
    }>[];
  }> | null;
}>;
