import { z, type ZodType } from "zod";
import type { QuestionPlan } from "../../domain/interview/contracts";
import type { SemanticCheckResult } from "../../domain/semantic/contracts";
import type {
  EvaluateSemanticCheckpointInput,
  GenerateQuestionPlanInput,
  LlmResult,
  LlmService,
  LlmServiceError,
} from "./llm-service";
import {
  createQuestionPlanSchema,
  createSemanticCheckResultSchema,
} from "./schemas";

type ChatMessage = Readonly<{
  role: "system" | "user";
  content: string;
}>;

const QWEN_REQUEST_TIMEOUT_MS = 60_000;

export type QwenLlmServiceOptions = Readonly<{
  apiKey: string;
  baseUrl: string;
  model: string;
  fetcher?: typeof fetch;
}>;

const qwenResponseSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            message: z
              .object({
                content: z.string().min(1),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();

function failure(
  code: LlmServiceError["code"],
  message: string,
  attempts: number,
): LlmResult<never> {
  return {
    ok: false,
    error: { code, message, attempts },
  };
}

function questionPlanMessages(
  input: GenerateQuestionPlanInput,
): readonly ChatMessage[] {
  const scenario = {
    id: input.scenario.id,
    trainingTargets: input.scenario.trainingTargets,
    evidenceKinds: input.scenario.evidenceKinds,
    gateIssueTypes: input.scenario.gateIssueTypes,
    questionFamilies: input.scenario.questionFamilies,
    plannerHints: input.scenario.hints.planner,
  };

  return [
    {
      role: "system",
      content:
        "Create exactly one interview QuestionPlan from one scenario questionFamily. Return only a valid JSON object. Copy the selected primaryTarget from trainingTargets verbatim. For requiredEvidence, map each selected family's requiredEvidence.evidenceKindId to the matching top-level evidenceKinds object and output only its id and description. For optionalEvidence, map each optionalEvidenceKindId the same way. Never output evidenceKindId or surfaceQuestionBasis. Every id and description must match exactly. Use the selected family's allowedGateIssueTypes exactly. Do not add fields or invent, paraphrase, or combine definitions.",
    },
    {
      role: "user",
      content: [
        "Project or research context:",
        input.projectContext,
        "Scenario:",
        JSON.stringify(scenario),
        "Return JSON with exactly these fields: id, surfaceQuestion, primaryTarget, requiredEvidence, optionalEvidence, allowedGateIssueTypes. Use the selected questionFamily id as id. The surface question may be adapted to the project context, but it must still explicitly ask for every selected requiredEvidence item.",
      ].join("\n\n"),
    },
  ];
}

function semanticCheckpointMessages(
  input: EvaluateSemanticCheckpointInput,
): readonly ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "Evaluate answer structure only. Return only a valid JSON object and never decide whether to Gate. Detect at most one of NOT_ANSWERING_QUESTION, VAGUE_WITHOUT_EVIDENCE, or OWNERSHIP_AMBIGUOUS. Use CONTINUE when uncertain, when context is insufficient, or when the answer states an honest measurement boundary. Confidence is an uncalibrated signal, not a probability.",
    },
    {
      role: "user",
      content: [
        "Project or research context:",
        input.projectContext,
        "Frozen QuestionPlan:",
        JSON.stringify(input.questionPlan),
        `Checkpoint version: ${input.checkpointVersion}`,
        "Transcript:",
        input.transcript,
        "Return JSON with exactly these fields: questionId, checkpointVersion, confidence, decision, issueType. decision is CONTINUE with issueType null, or ISSUE_DETECTED with one supported issueType.",
      ].join("\n\n"),
    },
  ];
}

export class QwenLlmService implements LlmService {
  readonly model: string;

  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly fetcher: typeof fetch;

  constructor(options: QwenLlmServiceOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.endpoint = `${options.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    this.fetcher = options.fetcher ?? fetch;
  }

  generateQuestionPlan(
    input: GenerateQuestionPlanInput,
  ): Promise<LlmResult<QuestionPlan>> {
    return this.requestValidated(
      questionPlanMessages(input),
      createQuestionPlanSchema(input.scenario),
    );
  }

  evaluateSemanticCheckpoint(
    input: EvaluateSemanticCheckpointInput,
  ): Promise<LlmResult<SemanticCheckResult>> {
    return this.requestValidated(
      semanticCheckpointMessages(input),
      createSemanticCheckResultSchema(
        input.questionPlan.id,
        input.checkpointVersion,
      ),
    );
  }

  private async requestValidated<T>(
    messages: readonly ChatMessage[],
    schema: ZodType<T>,
  ): Promise<LlmResult<T>> {
    let correction =
      "The previous response failed schema validation. Return only one corrected JSON object with the exact requested fields.";

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const attemptMessages =
        attempt === 1
          ? messages
          : [
              ...messages,
              {
                role: "user" as const,
                content: correction,
              },
            ];
      const completion = await this.requestCompletion(attemptMessages, attempt);

      if (!completion.ok) {
        return completion;
      }

      let decoded: unknown;
      try {
        decoded = JSON.parse(completion.value);
      } catch {
        correction =
          "The previous response was not valid JSON. Return only one corrected JSON object with the exact requested fields.";
        continue;
      }

      const validated = schema.safeParse(decoded);
      if (validated.success) {
        return { ok: true, value: validated.data };
      }
      const issues = validated.error.issues.map(({ path, message }) => ({
        path,
        message,
      }));
      correction = [
        "The previous response failed schema validation.",
        JSON.stringify(issues),
        "Return only one corrected JSON object with the exact requested fields.",
      ].join("\n");
      if (process.env.NODE_ENV === "development") {
        console.error("Structured LLM output failed validation", issues);
      }
    }

    return failure(
      "INVALID_STRUCTURED_OUTPUT",
      "Model output failed structured validation after one retry",
      2,
    );
  }

  private async requestCompletion(
    messages: readonly ChatMessage[],
    attempt: number,
  ): Promise<LlmResult<string>> {
    let response: Response;

    try {
      response = await this.fetcher(this.endpoint, {
        method: "POST",
        signal: AbortSignal.timeout(QWEN_REQUEST_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          enable_thinking: false,
          response_format: { type: "json_object" },
        }),
      });
    } catch {
      return failure("PROVIDER_ERROR", "Qwen request failed", attempt);
    }

    if (!response.ok) {
      return failure(
        "PROVIDER_ERROR",
        `Qwen request failed with HTTP ${response.status}`,
        attempt,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return failure("PROVIDER_ERROR", "Qwen returned invalid response JSON", attempt);
    }

    const parsed = qwenResponseSchema.safeParse(payload);
    if (!parsed.success) {
      return failure("PROVIDER_ERROR", "Qwen response shape is invalid", attempt);
    }

    return {
      ok: true,
      value: parsed.data.choices[0].message.content,
    };
  }
}
