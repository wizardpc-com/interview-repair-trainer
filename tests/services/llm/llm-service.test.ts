import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import scenarioData from "../../../protocols/scenarios/science-engineering-project-deep-dive.json";
import type { QuestionPlan } from "../../../src/domain/interview/contracts";
import { parseScenarioPack } from "../../../src/domain/interview/scenario";
import type { SemanticCheckResult } from "../../../src/domain/semantic/contracts";
import {
  DEFAULT_QWEN_MODEL,
  createConfiguredLlmService,
} from "../../../src/server/llm-config";
import type {
  EvaluateSemanticCheckpointInput,
  GenerateQuestionPlanInput,
  LlmService,
} from "../../../src/services/llm/llm-service";
import { QwenLlmService } from "../../../src/services/llm/qwen-llm-service";

const scenario = parseScenarioPack(scenarioData);

const questionPlan: QuestionPlan = {
  id: "problem-and-motivation",
  surfaceQuestion: "你当时具体想解决什么问题？这个问题为什么重要？",
  primaryTarget: {
    id: "problem-framing",
    description: "Explain the concrete problem, motivation, and scope.",
  },
  requiredEvidence: [
    {
      id: "problem-context",
      description: "A concrete description of the problem or research question.",
    },
    {
      id: "motivation-or-stakes",
      description: "Why the problem mattered within the stated project scope.",
    },
  ],
  optionalEvidence: [
    {
      id: "technical-detail",
      description: "A concrete technical detail that clarifies the work.",
    },
  ],
  allowedGateIssueTypes: [
    "NOT_ANSWERING_QUESTION",
    "VAGUE_WITHOUT_EVIDENCE",
  ],
};

const semanticResult: SemanticCheckResult = {
  questionId: questionPlan.id,
  checkpointVersion: 1,
  confidence: 0.8,
  gateability: "UNCERTAIN",
  answerBoundary: "NONE",
  decision: "CONTINUE",
  issueType: null,
  triggeringCriterion: null,
  issueExplanation: null,
  repairCue: null,
};

const plannerInput: GenerateQuestionPlanInput = {
  projectContext: "Built and evaluated a small autonomous navigation prototype.",
  scenario,
};

const canonicalQuestionPlan: QuestionPlan = {
  ...questionPlan,
  surfaceQuestion:
    scenario.questionFamilies.find(({ id }) => id === questionPlan.id)
      ?.surfaceQuestion ?? questionPlan.surfaceQuestion,
};

function canonicalPlanForFamily(familyId: string): QuestionPlan {
  const family = scenario.questionFamilies.find(({ id }) => id === familyId);
  if (family === undefined) {
    throw new Error(`Missing question family: ${familyId}`);
  }
  const primaryTarget = scenario.trainingTargets.find(
    ({ id }) => id === family.primaryTargetId,
  );
  if (primaryTarget === undefined) {
    throw new Error(`Missing primary target: ${family.primaryTargetId}`);
  }
  const evidenceById = new Map(
    scenario.evidenceKinds.map((evidence) => [evidence.id, evidence]),
  );
  const evidence = (id: string) => {
    const item = evidenceById.get(id);
    if (item === undefined) {
      throw new Error(`Missing evidence kind: ${id}`);
    }
    return { id: item.id, description: item.description };
  };

  return {
    id: family.id,
    surfaceQuestion: family.surfaceQuestion,
    primaryTarget: {
      id: primaryTarget.id,
      description: primaryTarget.description,
    },
    requiredEvidence: family.requiredEvidence.map(({ evidenceKindId }) =>
      evidence(evidenceKindId),
    ),
    optionalEvidence: family.optionalEvidenceKindIds.map(evidence),
    allowedGateIssueTypes: [...family.allowedGateIssueTypes],
  };
}

const interviewPlans = [
  canonicalPlanForFamily("personal-contribution"),
  canonicalPlanForFamily("technical-choice"),
  canonicalPlanForFamily("results-and-validation"),
] as const;

const evaluatorInput: EvaluateSemanticCheckpointInput = {
  projectContext: plannerInput.projectContext,
  questionPlan,
  transcript: "The project addressed unreliable indoor navigation for a small robot.",
  checkpointVersion: semanticResult.checkpointVersion,
  checkpointKind: "FINAL",
};

function completionResponse(content: string): Response {
  return Response.json({
    choices: [{ message: { content } }],
  });
}

function queuedFetcher(initialResponses: readonly Response[]) {
  const responses = [...initialResponses];
  const requests: Array<Readonly<{ input: string; init?: RequestInit }>> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({ input: String(input), init });
    const response = responses.shift();
    if (response === undefined) {
      throw new Error("No fake response queued");
    }
    return response;
  };

  return { fetcher, requests };
}

function qwenService(fetcher: typeof fetch): QwenLlmService {
  return new QwenLlmService({
    apiKey: "test-api-key",
    baseUrl: "https://example.test/compatible-mode/v1",
    model: "qwen3.8-flash",
    fetcher,
  });
}

describe("provider-independent LLM service", () => {
  it("generates one validated three-question plan with distinct preferred families", async () => {
    const { fetcher, requests } = queuedFetcher([
      completionResponse(JSON.stringify({ questionPlans: interviewPlans })),
    ]);
    const service = qwenService(fetcher);

    await expect(service.generateInterviewPlan(plannerInput)).resolves.toEqual({
      ok: true,
      value: interviewPlans,
    });
    expect(requests).toHaveLength(1);

    const body = z
      .object({
        messages: z.array(z.object({ content: z.string() }).passthrough()),
        response_format: z.object({
          json_schema: z.object({
            name: z.literal("interview_plan"),
            schema: z.object({
              required: z.array(z.string()),
              properties: z.record(z.string(), z.unknown()),
            }).passthrough(),
          }).passthrough(),
        }).passthrough(),
      })
      .passthrough()
      .parse(JSON.parse(String(requests[0].init?.body)));
    expect(body.response_format.json_schema.schema.required).toEqual([
      "questionPlans",
    ]);
    const prompt = body.messages.map(({ content }) => content).join("\n");
    expect(prompt).toContain("exactly three interview QuestionPlans");
    expect(prompt).toContain("three distinct scenario questionFamilies");
    expect(prompt).toContain(
      "personal-contribution, technical-choice, and results-and-validation",
    );
  });

  it("rejects a three-question plan that repeats a family", async () => {
    const repeated = {
      questionPlans: [interviewPlans[0], interviewPlans[0], interviewPlans[2]],
    };
    const { fetcher, requests } = queuedFetcher([
      completionResponse(JSON.stringify(repeated)),
      completionResponse(JSON.stringify(repeated)),
    ]);

    await expect(
      qwenService(fetcher).generateInterviewPlan(plannerInput),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_STRUCTURED_OUTPUT", attempts: 2 },
    });
    expect(requests).toHaveLength(2);
  });

  it("exposes planning and evaluation through one shared interface", async () => {
    const calls: string[] = [];
    const fakeService: LlmService = {
      model: "fake-single-model",
      async generateInterviewPlan() {
        calls.push("interview-planner");
        return { ok: true, value: [questionPlan, questionPlan, questionPlan] };
      },
      async generateQuestionPlan() {
        calls.push("planner");
        return { ok: true, value: questionPlan };
      },
      async evaluateSemanticCheckpoint() {
        calls.push("evaluator");
        return { ok: true, value: semanticResult };
      },
    };

    await fakeService.generateInterviewPlan(plannerInput);
    await fakeService.generateQuestionPlan(plannerInput);
    await fakeService.evaluateSemanticCheckpoint(evaluatorInput);

    expect(fakeService.model).toBe("fake-single-model");
    expect(calls).toEqual(["interview-planner", "planner", "evaluator"]);
  });

  it("uses the same configured Qwen model for valid planner and evaluator responses", async () => {
    const { fetcher, requests } = queuedFetcher([
      completionResponse(JSON.stringify(questionPlan)),
      completionResponse(JSON.stringify(semanticResult)),
    ]);
    const service: LlmService = qwenService(fetcher);

    await expect(service.generateQuestionPlan(plannerInput)).resolves.toEqual({
      ok: true,
      value: canonicalQuestionPlan,
    });
    await expect(
      service.evaluateSemanticCheckpoint(evaluatorInput),
    ).resolves.toEqual({ ok: true, value: semanticResult });

    const requestSchema = z.object({
      model: z.string(),
      messages: z.array(z.object({ content: z.string() }).passthrough()),
      enable_thinking: z.literal(false),
      temperature: z.literal(0),
      response_format: z.object({
        type: z.literal("json_schema"),
        json_schema: z.object({
          name: z.string(),
          strict: z.literal(true),
          schema: z
            .object({
              type: z.literal("object"),
              properties: z.record(z.string(), z.unknown()),
              required: z.array(z.string()),
              additionalProperties: z.literal(false),
            })
            .passthrough(),
        }),
      }),
    });
    const requestBodies = requests.map(({ init }) =>
      requestSchema.parse(JSON.parse(String(init?.body))),
    );

    expect(service.model).toBe("qwen3.8-flash");
    expect(requestBodies.map(({ model }) => model)).toEqual([
      "qwen3.8-flash",
      "qwen3.8-flash",
    ]);
    expect(requestBodies.every(({ enable_thinking }) => !enable_thinking)).toBe(
      true,
    );
    expect(
      requestBodies.map(({ response_format }) =>
        response_format.json_schema.name,
      ),
    ).toEqual(["question_plan", "semantic_checkpoint"]);
    expect(
      requestBodies.map(({ response_format }) =>
        response_format.json_schema.schema.required,
      ),
    ).toEqual([
      [
        "id",
        "surfaceQuestion",
        "primaryTarget",
        "requiredEvidence",
        "optionalEvidence",
        "allowedGateIssueTypes",
      ],
      [
        "questionId",
        "checkpointVersion",
        "confidence",
        "gateability",
        "answerBoundary",
        "decision",
        "issueType",
        "triggeringCriterion",
        "issueExplanation",
        "repairCue",
      ],
    ]);
    expect(
      requestBodies.every(({ response_format }) => {
        const { properties, required } = response_format.json_schema.schema;
        return (
          Object.keys(properties).length === required.length &&
          required.every((field) => field in properties) &&
          !("$schema" in response_format.json_schema.schema)
        );
      }),
    ).toBe(true);
    expect(
      requestBodies.every(({ messages }) =>
        messages.some(({ content }) => /json/i.test(content)),
      ),
    ).toBe(true);
    expect(
      requestBodies[0].messages.some(({ content }) =>
        content.includes("Simplified Chinese"),
      ),
    ).toBe(true);
    expect(
      requestBodies[1].messages.some(({ content }) =>
        content.includes("Do not write user-facing feedback"),
      ),
    ).toBe(true);
    expect(requests.map(({ input }) => input)).toEqual([
      "https://example.test/compatible-mode/v1/chat/completions",
      "https://example.test/compatible-mode/v1/chat/completions",
    ]);
  });

  it("accepts the validated non-Gate wrap-up boundary", async () => {
    const wrapUpResult: SemanticCheckResult = {
      ...semanticResult,
      answerBoundary: "ANSWER_COMPLETE_BUT_RAMBLING",
    };
    const { fetcher } = queuedFetcher([
      completionResponse(JSON.stringify(wrapUpResult)),
    ]);

    await expect(
      qwenService(fetcher).evaluateSemanticCheckpoint({
        ...evaluatorInput,
        checkpointKind: "INTERIM",
      }),
    ).resolves.toEqual({ ok: true, value: wrapUpResult });
  });

  it("states the evaluator boundaries and distinguishes INTERIM from FINAL", async () => {
    const { fetcher, requests } = queuedFetcher([
      completionResponse(JSON.stringify(semanticResult)),
      completionResponse(JSON.stringify(semanticResult)),
    ]);

    const service = qwenService(fetcher);
    await service.evaluateSemanticCheckpoint({
      ...evaluatorInput,
      checkpointKind: "INTERIM",
    });
    await service.evaluateSemanticCheckpoint({
      ...evaluatorInput,
      checkpointKind: "FINAL",
    });

    const prompts = requests.map(({ init }) => {
      const request = z
        .object({
          messages: z.array(z.object({ content: z.string() }).passthrough()),
        })
        .passthrough()
        .parse(JSON.parse(String(init?.body)));
      return request.messages.map(({ content }) => content).join("\n");
    });
    const [interimPrompt, finalPrompt] = prompts;
    expect(interimPrompt).toBeDefined();
    expect(finalPrompt).toBeDefined();
    const prompt = prompts.join("\n");

    expect(prompt).toContain(
      "If every required dimension is addressed, never use NOT_ANSWERING_QUESTION",
    );
    expect(prompt).toContain("comes from real-time ASR");
    expect(prompt).toContain(
      "Recover the most plausible overall semantic structure",
    );
    expect(prompt).toContain(
      "Never use NOT_ANSWERING_QUESTION solely because of such local ASR noise",
    );
    expect(prompt).toContain(
      "a stated selection followed by an explicit causal relation and a concrete project constraint",
    );
    expect(prompt).toContain(
      "A concrete project constraint or tradeoff directly connected to the selection is explanatory evidence",
    );
    expect(prompt).toContain(
      "Do not use VAGUE_WITHOUT_EVIDENCE solely because ASR corrupts a local technical noun",
    );
    expect(prompt).toContain(
      "Mandatory ASR fail-open rule: when the choice-to-reason or choice-to-constraint relation is clear",
    );
    expect(prompt).toContain(
      "When ASR noise leaves multiple plausible readings and there is no clear semantic omission, fail open with CONTINUE",
    );
    expect(prompt).toContain(
      "completely omits or substitutes for an explicitly requested dimension",
    );
    expect(prompt).toContain(
      "Use VAGUE_WITHOUT_EVIDENCE only after the answer addresses that same required dimension",
    );
    expect(prompt).toContain(
      "Apply this ownership threshold before assigning any issue",
    );
    expect(prompt).toContain(
      "return CONTINUE even when that statement is terse, broad, or lacks implementation detail",
    );
    expect(prompt).toContain(
      "counts as personal contribution; do not require a separate action verb",
    );
    expect(prompt).toContain(
      "a result or metric does not answer how it was validated",
    );
    expect(prompt).toContain(
      "A title, identity, leadership status, or blanket claim of overall responsibility that names no work area or personal action does not establish personal ownership",
    );
    expect(prompt).toContain(
      "a described evaluation setup or method",
    );
    expect(prompt).toContain(
      "For checkpointKind INTERIM only, also prefer CONTINUE",
    );
    expect(prompt).toContain(
      "set answerBoundary to ANSWER_COMPLETE_BUT_RAMBLING with decision CONTINUE",
    );
    expect(prompt).toContain(
      "Do not use ANSWER_COMPLETE_BUT_RAMBLING merely because an answer is long",
    );
    expect(prompt).toContain(
      "mainly inventories unrequested components, implementation history, broad aspirations, team context, or generic project praise",
    );
    expect(prompt).toContain(
      "The later material does not need to be completely unrelated",
    );
    expect(prompt).toContain(
      "ANSWER_COMPLETE_BUT_RAMBLING is a non-Gate flow signal",
    );
    expect(prompt).toContain(
      "For checkpointKind FINAL, the user has actively ended the answer",
    );
    expect(interimPrompt).toContain("Checkpoint kind: INTERIM");
    expect(finalPrompt).toContain("Checkpoint kind: FINAL");
    expect(finalPrompt).toContain(
      "do not infer that it is unfinished merely because it is short",
    );
    expect(prompt).not.toMatch(/\bG\d{2}\b/);
    expect(prompt).not.toContain("inc8");
  });

  it("retries one malformed structured response and accepts a valid correction", async () => {
    const { fetcher, requests } = queuedFetcher([
      completionResponse("not JSON"),
      completionResponse(JSON.stringify(questionPlan)),
    ]);

    await expect(
      qwenService(fetcher).generateQuestionPlan(plannerInput),
    ).resolves.toEqual({ ok: true, value: canonicalQuestionPlan });
    expect(requests).toHaveLength(2);
    const responseFormats = requests.map(({ init }) =>
      z
        .object({
          response_format: z.object({
            type: z.literal("json_schema"),
            json_schema: z.object({
              name: z.literal("question_plan"),
              strict: z.literal(true),
            }).passthrough(),
          }),
        })
        .passthrough()
        .parse(JSON.parse(String(init?.body))).response_format,
    );
    expect(responseFormats).toHaveLength(2);
    expect(responseFormats[1]).toEqual(responseFormats[0]);
  });

  it("retries an English surface question and accepts a Chinese correction", async () => {
    const englishQuestionPlan = {
      ...questionPlan,
      surfaceQuestion:
        "What problem were you trying to solve, and why did it matter?",
    };
    const { fetcher, requests } = queuedFetcher([
      completionResponse(JSON.stringify(englishQuestionPlan)),
      completionResponse(JSON.stringify(questionPlan)),
    ]);

    await expect(
      qwenService(fetcher).generateQuestionPlan(plannerInput),
    ).resolves.toEqual({ ok: true, value: canonicalQuestionPlan });

    const secondRequest = z
      .object({
        messages: z.array(z.object({ content: z.string() }).passthrough()),
      })
      .passthrough()
      .parse(JSON.parse(String(requests[1].init?.body)));
    expect(secondRequest.messages.at(-1)?.content).toContain(
      "surfaceQuestion must be written in Simplified Chinese",
    );
    expect(requests).toHaveLength(2);
  });

  it("uses the selected family's fixed Chinese question after two unsafe surface questions", async () => {
    const englishQuestionPlan = {
      ...questionPlan,
      surfaceQuestion:
        "What problem were you trying to solve, and why did it matter?",
    };
    const { fetcher, requests } = queuedFetcher([
      completionResponse(JSON.stringify(englishQuestionPlan)),
      completionResponse(JSON.stringify(englishQuestionPlan)),
    ]);

    await expect(
      qwenService(fetcher).generateQuestionPlan(plannerInput),
    ).resolves.toEqual({
      ok: true,
      value: {
        ...questionPlan,
        surfaceQuestion:
          scenario.questionFamilies.find(
            ({ id }) => id === questionPlan.id,
          )?.surfaceQuestion,
      },
    });
    expect(requests).toHaveLength(2);
  });

  it("rejects a plan whose id does not match its selected question family", async () => {
    const mismatchedQuestionPlan = {
      ...questionPlan,
      id: "personal-contribution",
    };
    const { fetcher, requests } = queuedFetcher([
      completionResponse(JSON.stringify(mismatchedQuestionPlan)),
      completionResponse(JSON.stringify(mismatchedQuestionPlan)),
    ]);

    await expect(
      qwenService(fetcher).generateQuestionPlan(plannerInput),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_STRUCTURED_OUTPUT", attempts: 2 },
    });
    expect(requests).toHaveLength(2);
  });

  it("rejects a plan that omits required evidence from the selected family", async () => {
    const incompleteQuestionPlan = {
      ...questionPlan,
      requiredEvidence: questionPlan.requiredEvidence.slice(0, 1),
    };
    const { fetcher, requests } = queuedFetcher([
      completionResponse(JSON.stringify(incompleteQuestionPlan)),
      completionResponse(JSON.stringify(incompleteQuestionPlan)),
    ]);

    await expect(
      qwenService(fetcher).generateQuestionPlan(plannerInput),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_STRUCTURED_OUTPUT", attempts: 2 },
    });
    expect(requests).toHaveLength(2);
  });

  it("rejects a plan that omits optional evidence from the selected family", async () => {
    const incompleteQuestionPlan = {
      ...questionPlan,
      optionalEvidence: [],
    };
    const { fetcher, requests } = queuedFetcher([
      completionResponse(JSON.stringify(incompleteQuestionPlan)),
      completionResponse(JSON.stringify(incompleteQuestionPlan)),
    ]);

    await expect(
      qwenService(fetcher).generateQuestionPlan(plannerInput),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_STRUCTURED_OUTPUT", attempts: 2 },
    });
    expect(requests).toHaveLength(2);
  });

  it("rejects a plan that omits an allowed issue type from the selected family", async () => {
    const incompleteQuestionPlan = {
      ...questionPlan,
      allowedGateIssueTypes: questionPlan.allowedGateIssueTypes.slice(0, 1),
    };
    const { fetcher, requests } = queuedFetcher([
      completionResponse(JSON.stringify(incompleteQuestionPlan)),
      completionResponse(JSON.stringify(incompleteQuestionPlan)),
    ]);

    await expect(
      qwenService(fetcher).generateQuestionPlan(plannerInput),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_STRUCTURED_OUTPUT", attempts: 2 },
    });
    expect(requests).toHaveLength(2);
  });

  it("feeds schema issue paths back into the single structured-output retry", async () => {
    const invalidQuestionPlan = {
      ...questionPlan,
      requiredEvidence: [
        {
          evidenceKindId: "problem-context",
          surfaceQuestionBasis: "The question asks for the problem.",
        },
      ],
    };
    const { fetcher, requests } = queuedFetcher([
      completionResponse(JSON.stringify(invalidQuestionPlan)),
      completionResponse(JSON.stringify(questionPlan)),
    ]);

    await expect(
      qwenService(fetcher).generateQuestionPlan(plannerInput),
    ).resolves.toEqual({ ok: true, value: canonicalQuestionPlan });

    const secondRequest = z
      .object({
        messages: z.array(z.object({ content: z.string() }).passthrough()),
      })
      .passthrough()
      .parse(JSON.parse(String(requests[1].init?.body)));
    const correction = secondRequest.messages.at(-1)?.content;

    expect(correction).toContain("requiredEvidence");
    expect(correction).toContain("expected string");
    expect(requests).toHaveLength(2);
  });

  it("rejects schema-invalid output after exactly one retry", async () => {
    const invalidQuestionPlan = {
      ...questionPlan,
      primaryTarget: {
        id: "unsupported-target",
        description: "An unsupported target.",
      },
    };
    const { fetcher, requests } = queuedFetcher([
      completionResponse(JSON.stringify(invalidQuestionPlan)),
      completionResponse(JSON.stringify(invalidQuestionPlan)),
    ]);

    await expect(
      qwenService(fetcher).generateQuestionPlan(plannerInput),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "INVALID_STRUCTURED_OUTPUT",
        message: "Model output failed structured validation after one retry",
        attempts: 2,
      },
    });
    expect(requests).toHaveLength(2);
  });

  it("returns an explicit fail-open-compatible error after evaluator validation fails", async () => {
    const invalidSemanticResult = {
      ...semanticResult,
      decision: "GATE",
    };
    const { fetcher, requests } = queuedFetcher([
      completionResponse(JSON.stringify(invalidSemanticResult)),
      completionResponse(JSON.stringify(invalidSemanticResult)),
    ]);

    const result = await qwenService(fetcher).evaluateSemanticCheckpoint(
      evaluatorInput,
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "INVALID_STRUCTURED_OUTPUT",
        message: "Model output failed structured validation after one retry",
        attempts: 2,
      },
    });
    expect(result).not.toHaveProperty("decision");
    expect(result).not.toHaveProperty("hardGate");
    expect(requests).toHaveLength(2);
  });

  it("S06 rejects evaluator output that tries to replace the frozen plan", async () => {
    const attemptedPlanRewrite = {
      ...semanticResult,
      primaryTarget: {
        id: "model-rewritten-target",
        description: "A target invented during repair.",
      },
      requiredEvidence: [
        {
          id: "model-rewritten-evidence",
          description: "Evidence invented during repair.",
        },
      ],
    };
    const { fetcher, requests } = queuedFetcher([
      completionResponse(JSON.stringify(attemptedPlanRewrite)),
      completionResponse(JSON.stringify(attemptedPlanRewrite)),
    ]);

    await expect(
      qwenService(fetcher).evaluateSemanticCheckpoint(evaluatorInput),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_STRUCTURED_OUTPUT", attempts: 2 },
    });
    expect(evaluatorInput.questionPlan).toBe(questionPlan);
    expect(requests).toHaveLength(2);
  });

  it("does not retry a provider transport failure as structured output", async () => {
    const { fetcher, requests } = queuedFetcher([
      new Response(null, { status: 503 }),
    ]);

    await expect(
      qwenService(fetcher).evaluateSemanticCheckpoint(evaluatorInput),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "PROVIDER_ERROR",
        message: "Qwen request failed with HTTP 503",
        attempts: 1,
      },
    });
    expect(requests).toHaveLength(1);
  });

  it("creates one configured model and requires only one API key", () => {
    const service = createConfiguredLlmService({
      QWEN_API_KEY: "test-api-key",
    });

    expect(service.model).toBe(DEFAULT_QWEN_MODEL);
    expect(() => createConfiguredLlmService({})).toThrow();
  });
});

function typeScriptFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return typeScriptFiles(path);
    }
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("domain dependency boundary", () => {
  it("keeps provider and LLM service dependencies out of the domain", () => {
    const domainSource = typeScriptFiles(resolve("src/domain"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(domainSource).not.toMatch(/services[\\/]llm/i);
    expect(domainSource).not.toMatch(
      /from\s+["'](?:openai|dashscope|qwen|@alicloud\/)/i,
    );
  });
});
