import type { QuestionPlan } from "../../domain/interview/contracts";
import type { InterviewScenarioPack } from "../../domain/interview/scenario";
import type { SemanticCheckResult } from "../../domain/semantic/contracts";

export type LlmServiceErrorCode =
  | "PROVIDER_ERROR"
  | "INVALID_STRUCTURED_OUTPUT";

export type LlmServiceError = Readonly<{
  code: LlmServiceErrorCode;
  message: string;
  attempts: number;
}>;

export type LlmResult<T> =
  | Readonly<{
      ok: true;
      value: T;
    }>
  | Readonly<{
      ok: false;
      error: LlmServiceError;
    }>;

export type GenerateQuestionPlanInput = Readonly<{
  projectContext: string;
  scenario: InterviewScenarioPack;
}>;

export type EvaluateSemanticCheckpointInput = Readonly<{
  projectContext: string;
  questionPlan: QuestionPlan;
  transcript: string;
  checkpointVersion: number;
}>;

export interface LlmService {
  readonly model: string;

  generateQuestionPlan(
    input: GenerateQuestionPlanInput,
  ): Promise<LlmResult<QuestionPlan>>;

  evaluateSemanticCheckpoint(
    input: EvaluateSemanticCheckpointInput,
  ): Promise<LlmResult<SemanticCheckResult>>;
}
