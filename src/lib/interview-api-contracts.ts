import { z } from "zod";
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
    })
    .strict(),
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
    freshness: z.enum(["CURRENT", "STALE"]),
  })
  .strict();

export const publicInterviewRuntimeSchema = z
  .object({
    sessionId: nonEmptyString,
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
    answerVersion: z.number().int().nonnegative(),
    checkpointVersion: z.number().int().nonnegative(),
    checkpoint: publicCheckpointSchema.nullable(),
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
  question: Readonly<{
    questionId: string;
    surfaceQuestion: string;
    index: number;
    total: number;
  }>;
  state: z.infer<typeof publicInterviewRuntimeSchema>["state"];
  transcript: string;
  answerVersion: number;
  checkpointVersion: number;
  checkpoint: Readonly<{
    answerVersion: number;
    checkpointVersion: number;
    createdAt: number;
    freshness: "CURRENT" | "STALE";
  }> | null;
}>;
