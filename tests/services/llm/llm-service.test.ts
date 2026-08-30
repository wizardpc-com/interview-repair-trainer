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
  id: "question-1",
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
  decision: "CONTINUE",
  issueType: null,
};

const plannerInput: GenerateQuestionPlanInput = {
  projectContext: "Built and evaluated a small autonomous navigation prototype.",
  scenario,
};

const evaluatorInput: EvaluateSemanticCheckpointInput = {
  projectContext: plannerInput.projectContext,
  questionPlan,
  transcript: "The project addressed unreliable indoor navigation for a small robot.",
  checkpointVersion: semanticResult.checkpointVersion,
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
  it("exposes planning and evaluation through one shared interface", async () => {
    const calls: string[] = [];
    const fakeService: LlmService = {
      model: "fake-single-model",
      async generateQuestionPlan() {
        calls.push("planner");
        return { ok: true, value: questionPlan };
      },
      async evaluateSemanticCheckpoint() {
        calls.push("evaluator");
        return { ok: true, value: semanticResult };
      },
    };

    await fakeService.generateQuestionPlan(plannerInput);
    await fakeService.evaluateSemanticCheckpoint(evaluatorInput);

    expect(fakeService.model).toBe("fake-single-model");
    expect(calls).toEqual(["planner", "evaluator"]);
  });

  it("uses the same configured Qwen model for valid planner and evaluator responses", async () => {
    const { fetcher, requests } = queuedFetcher([
      completionResponse(JSON.stringify(questionPlan)),
      completionResponse(JSON.stringify(semanticResult)),
    ]);
    const service: LlmService = qwenService(fetcher);

    await expect(service.generateQuestionPlan(plannerInput)).resolves.toEqual({
      ok: true,
      value: questionPlan,
    });
    await expect(
      service.evaluateSemanticCheckpoint(evaluatorInput),
    ).resolves.toEqual({ ok: true, value: semanticResult });

    const requestSchema = z.object({
      model: z.string(),
      messages: z.array(z.object({ content: z.string() }).passthrough()),
      enable_thinking: z.literal(false),
      response_format: z.object({ type: z.literal("json_object") }),
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
      requestBodies.every(({ messages }) =>
        messages.some(({ content }) => /json/i.test(content)),
      ),
    ).toBe(true);
    expect(
      requestBodies[0].messages.some(({ content }) =>
        content.includes("Simplified Chinese"),
      ),
    ).toBe(true);
    expect(requests.map(({ input }) => input)).toEqual([
      "https://example.test/compatible-mode/v1/chat/completions",
      "https://example.test/compatible-mode/v1/chat/completions",
    ]);
  });

  it("retries one malformed structured response and accepts a valid correction", async () => {
    const { fetcher, requests } = queuedFetcher([
      completionResponse("not JSON"),
      completionResponse(JSON.stringify(questionPlan)),
    ]);

    await expect(
      qwenService(fetcher).generateQuestionPlan(plannerInput),
    ).resolves.toEqual({ ok: true, value: questionPlan });
    expect(requests).toHaveLength(2);
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
    ).resolves.toEqual({ ok: true, value: questionPlan });

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
    ).resolves.toEqual({ ok: true, value: questionPlan });

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
