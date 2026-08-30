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
  questionPlanJsonSchema,
  semanticCheckResultJsonSchema,
} from "./schemas";

type ChatMessage = Readonly<{
  role: "system" | "user";
  content: string;
}>;

type StrictStructuredOutput = Readonly<{
  name: string;
  schema: Readonly<Record<string, unknown>>;
}>;

const QWEN_REQUEST_TIMEOUT_MS = 60_000;
const HAN_CHARACTER_PATTERN = /\p{Script=Han}/u;
const INTERNAL_SURFACE_TERM_PATTERN =
  /QuestionPlan|primaryTarget|requiredEvidence|optionalEvidence|NOT_ANSWERING_QUESTION|VAGUE_WITHOUT_EVIDENCE|OWNERSHIP_AMBIGUOUS|Checkpoint|Evaluator|Hard Gate|confidence|REPAIR|REANSWER/i;
const OVERBROAD_SURFACE_PHRASES = [
  "请全面介绍",
  "请详细阐述各个方面",
  "从多个维度分析",
] as const;

function surfaceQuestionIsAcceptable(surfaceQuestion: string): boolean {
  const question = surfaceQuestion.trim();
  return (
    question.length <= 120 &&
    !question.includes("\n") &&
    HAN_CHARACTER_PATTERN.test(question) &&
    !INTERNAL_SURFACE_TERM_PATTERN.test(question) &&
    !OVERBROAD_SURFACE_PHRASES.some((phrase) => question.includes(phrase))
  );
}

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
      content: [
        "Create exactly one interview QuestionPlan from one scenario questionFamily and return only a valid JSON object.",
        "Copy the selected questionFamily surfaceQuestion exactly.",
        "Do not add coaching, scoring, hidden criteria, internal protocol terms, or broad requests such as 请全面介绍, 请详细阐述各个方面, or 从多个维度分析.",
        "Copy the selected primaryTarget from trainingTargets verbatim.",
        "For requiredEvidence, map every selected family's requiredEvidence.evidenceKindId to the matching top-level evidenceKinds object and output only its id and description.",
        "For optionalEvidence, map every optionalEvidenceKindId the same way.",
        "Never output evidenceKindId or surfaceQuestionBasis. Every id and description must match exactly.",
        "Use the selected questionFamily id as the QuestionPlan id and use its allowedGateIssueTypes exactly.",
        "Do not add fields or invent, paraphrase, omit, or combine definitions.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        "Project or research context:",
        input.projectContext,
        "Scenario:",
        JSON.stringify(scenario),
        "Return JSON with exactly these fields: id, surfaceQuestion, primaryTarget, requiredEvidence, optionalEvidence, allowedGateIssueTypes. Use the selected questionFamily id as id and copy its surfaceQuestion exactly.",
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
      content: [
        "Evaluate answer structure only. Return only a valid JSON object and never decide whether to Gate.",
        "Do not write user-facing feedback and do not criticize or infer the candidate's attitude, honesty, confidence, intelligence, or interview readiness.",
        "Judge only the frozen surface question, primary target, and explicitly required evidence; do not judge specialist factual truth.",
        "Detect at most one of NOT_ANSWERING_QUESTION, VAGUE_WITHOUT_EVIDENCE, or OWNERSHIP_AMBIGUOUS.",
        "The transcript comes from real-time ASR and may contain localized typos, homophone substitutions, technical-term mistranscriptions, missing punctuation, or incorrect word boundaries.",
        "Recover the most plausible overall semantic structure from the surrounding context before judging dimension coverage; do not require verbatim lexical accuracy.",
        "If the answer still clearly expresses core relations such as a choice, reason, constraint, comparison, validation method, or result, treat those dimensions as addressed even when a local term or phrase is mistranscribed. Never use NOT_ANSWERING_QUESTION solely because of such local ASR noise.",
        "Apply ASR semantic recovery before the omission-versus-vagueness rules. For a why dimension, a stated selection followed by an explicit causal relation and a concrete project constraint, tradeoff, or reason addresses why even if the selected technical term is mistranscribed; do not reclassify that structure as merely describing what.",
        "A concrete project constraint or tradeoff directly connected to the selection is explanatory evidence. Unless the surface question explicitly requires them, do not demand a numeric threshold, formal comparison, or perfectly transcribed technical term before accepting that reason.",
        "Do not use VAGUE_WITHOUT_EVIDENCE solely because ASR corrupts a local technical noun or measurement term when the surrounding causal basis or validation action remains clear.",
        "Mandatory ASR fail-open rule: when the choice-to-reason or choice-to-constraint relation is clear and only localized ASR words remain uncertain, return CONTINUE with null issue fields; do not return any ISSUE_DETECTED.",
        "When ASR noise leaves multiple plausible readings and there is no clear semantic omission, fail open with CONTINUE.",
        "Assess every dimension explicitly requested by the surface question and requiredEvidence independently.",
        "Use NOT_ANSWERING_QUESTION only when the answer completely omits or substitutes for an explicitly requested dimension. If every required dimension is addressed, never use NOT_ANSWERING_QUESTION.",
        "Judge dimension presence before evidence quality. Material that answers one dimension does not implicitly answer another: a result or metric does not answer how it was validated, implementation activity does not answer why a choice was made, and team activity does not answer personal ownership.",
        "Use VAGUE_WITHOUT_EVIDENCE only after the answer addresses that same required dimension but its claim, explanation, or validation lacks a concrete basis. Never use it for a completely omitted dimension.",
        "Apply this ownership threshold before assigning any issue: an explicit first-person statement that the candidate was responsible for, owned, or handled a named work area, subsystem, component, function, artifact, or task fully satisfies basic ownership. For ownership, return CONTINUE even when that statement is terse, broad, or lacks implementation detail; neither OWNERSHIP_AMBIGUOUS nor VAGUE_WITHOUT_EVIDENCE is allowed solely because more detail could be requested.",
        "A list of named responsibility objects governed by one explicit first-person responsibility phrase counts as personal contribution; do not require a separate action verb for every listed object.",
        "A title, identity, leadership status, or blanket claim of overall responsibility that names no work area or personal action does not establish personal ownership.",
        "For a validation dimension, a described evaluation setup or method such as a test corpus, procedure, controlled run, repeated measurement, comparison, or aggregation is validation evidence. Do not demand a separate independent audit or repeated wording for every nearby result; only a bare result with no described evaluation method omits validation.",
        "When the surface question explicitly asks why, a sustained answer that only defines, describes, or implements what was chosen has not answered the reason; do not infer a rationale from technical detail alone.",
        "Use CONTINUE when semantically uncertain or when the answer states an honest measurement boundary.",
        "For checkpointKind INTERIM only, also prefer CONTINUE when context is insufficient or the transcript is clearly unfinished or self-interrupted, even if a required dimension has not appeared yet; do not treat a transient partial answer as a complete omission.",
        "For checkpointKind INTERIM only, set answerBoundary to ANSWER_COMPLETE_BUT_RAMBLING with decision CONTINUE when every dimension explicitly requested by the surface question is already clearly addressed and a sustained later portion then becomes materially irrelevant or repetitive instead of strengthening those dimensions.",
        "A sustained later portion counts as rambling when it mainly inventories unrequested components, implementation history, broad aspirations, team context, or generic project praise without adding a new reason, constraint, comparison, validation detail, result, or ownership evidence requested by the surface question.",
        "The later material does not need to be completely unrelated: a weak topical connection does not make it responsive when it no longer advances any requested dimension. Prefer ANSWER_COMPLETE_BUT_RAMBLING once that pattern is clear.",
        "Do not use ANSWER_COMPLETE_BUT_RAMBLING merely because an answer is long, detailed, imperfectly organized, contains one short aside, or includes technical context that still supports a requested dimension. If any requested dimension is still missing, the answer is clearly unfinished, or the later material may still substantively support the answer, use the ordinary issue or fail-open rules instead.",
        "ANSWER_COMPLETE_BUT_RAMBLING is a non-Gate flow signal. Never combine it with ISSUE_DETECTED, and when uncertain return CONTINUE with answerBoundary NONE.",
        "For checkpointKind FINAL, the user has actively ended the answer. Evaluate the supplied content as complete: do not infer that it is unfinished merely because it is short, ends abruptly, or lacks elaboration, and apply the omission-versus-vagueness rules above.",
        "For ISSUE_DETECTED, identify exactly one triggeringCriterion from the primaryTarget or requiredEvidence. Never use optionalEvidence.",
        "Use gateability GATE_ELIGIBLE only for a clear issue; use UNCERTAIN for possible drift, ambiguity, or a transient partial answer.",
        "Set answerBoundary to HONEST_NO_MEASUREMENT when the candidate explicitly says no reliable measurement or validation was made, ANSWER_COMPLETE_BUT_RAMBLING only under the INTERIM flow rule above, UNCERTAIN when unclear, otherwise NONE.",
        "issueExplanation and repairCue are short internal English semantic notes. They are advisory and will not be shown directly to the candidate.",
        "Confidence is an uncalibrated signal, not a probability.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        "Project or research context:",
        input.projectContext,
        "Frozen QuestionPlan:",
        JSON.stringify(input.questionPlan),
        `Checkpoint version: ${input.checkpointVersion}`,
        `Checkpoint kind: ${input.checkpointKind}`,
        "Transcript:",
        input.transcript,
        "Return JSON with exactly these fields: questionId, checkpointVersion, confidence, gateability, answerBoundary, decision, issueType, triggeringCriterion, issueExplanation, repairCue. For CONTINUE, issueType, triggeringCriterion, issueExplanation, and repairCue are null. For ISSUE_DETECTED, issueType is one supported issue, triggeringCriterion is {kind: PRIMARY_TARGET|REQUIRED_EVIDENCE, id}, and issueExplanation plus repairCue are short non-empty strings.",
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

  async generateQuestionPlan(
    input: GenerateQuestionPlanInput,
  ): Promise<LlmResult<QuestionPlan>> {
    const structuralSchema = createQuestionPlanSchema(input.scenario);
    const presentationSchema = structuralSchema.refine(
      ({ surfaceQuestion }) => surfaceQuestionIsAcceptable(surfaceQuestion),
      {
        message:
          "surfaceQuestion must be written in Simplified Chinese, remain concise, and avoid broad requests or internal protocol terms",
        path: ["surfaceQuestion"],
      },
    );

    const result = await this.requestValidated(
      questionPlanMessages(input),
      presentationSchema,
      {
        name: "question_plan",
        schema: questionPlanJsonSchema,
      },
      (decoded) => {
        const structuralResult = structuralSchema.safeParse(decoded);
        if (!structuralResult.success) {
          return null;
        }

        const family = input.scenario.questionFamilies.find(
          ({ id }) => id === structuralResult.data.id,
        );
        if (family === undefined) {
          return null;
        }

        const fallbackResult = presentationSchema.safeParse({
          ...structuralResult.data,
          surfaceQuestion: family.surfaceQuestion,
        });
        return fallbackResult.success ? fallbackResult.data : null;
      },
    );

    if (!result.ok) {
      return result;
    }

    const family = input.scenario.questionFamilies.find(
      ({ id }) => id === result.value.id,
    );
    if (family === undefined) {
      return failure(
        "INVALID_STRUCTURED_OUTPUT",
        "QuestionPlan does not match a scenario question family",
        2,
      );
    }

    return {
      ok: true,
      value: {
        ...result.value,
        surfaceQuestion: family.surfaceQuestion,
      },
    };
  }

  evaluateSemanticCheckpoint(
    input: EvaluateSemanticCheckpointInput,
  ): Promise<LlmResult<SemanticCheckResult>> {
    return this.requestValidated(
      semanticCheckpointMessages(input),
      createSemanticCheckResultSchema(
        input.questionPlan,
        input.checkpointVersion,
      ),
      {
        name: "semantic_checkpoint",
        schema: semanticCheckResultJsonSchema,
      },
    );
  }

  private async requestValidated<T>(
    messages: readonly ChatMessage[],
    schema: ZodType<T>,
    structuredOutput: StrictStructuredOutput,
    recoverInvalid?: (decoded: unknown) => T | null,
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
      const completion = await this.requestCompletion(
        attemptMessages,
        attempt,
        structuredOutput,
      );

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
      if (attempt === 2 && recoverInvalid !== undefined) {
        const recovered = recoverInvalid(decoded);
        if (recovered !== null) {
          return { ok: true, value: recovered };
        }
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
    structuredOutput: StrictStructuredOutput,
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
          temperature: 0,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: structuredOutput.name,
              strict: true,
              schema: structuredOutput.schema,
            },
          },
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
