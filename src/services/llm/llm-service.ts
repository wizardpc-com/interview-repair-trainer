import type { QuestionPlan } from "../../domain/interview/contracts";
import type { CheckpointKind } from "../../domain/interview/runtime";
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

export type GenerateInterviewPlanInput = Readonly<{
  projectContext: string;
  scenario: InterviewScenarioPack;
}>;

export type GenerateQuestionPlanInput = GenerateInterviewPlanInput;

export type EvaluateSemanticCheckpointInput = Readonly<{
  projectContext: string;
  questionPlan: QuestionPlan;
  transcript: string;
  checkpointVersion: number;
  checkpointKind: CheckpointKind;
}>;

export interface LlmService {
  readonly model: string;

  generateInterviewPlan(
    input: GenerateInterviewPlanInput,
  ): Promise<LlmResult<readonly QuestionPlan[]>>;

  generateQuestionPlan(
    input: GenerateQuestionPlanInput,
  ): Promise<LlmResult<QuestionPlan>>;

  evaluateSemanticCheckpoint(
    input: EvaluateSemanticCheckpointInput,
  ): Promise<LlmResult<SemanticCheckResult>>;
}
