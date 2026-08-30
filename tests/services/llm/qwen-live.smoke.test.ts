import { beforeAll, describe, expect, it } from "vitest";
import scenarioData from "../../../protocols/scenarios/science-engineering-project-deep-dive.json";
import type { QuestionPlan } from "../../../src/domain/interview/contracts";
import { parseScenarioPack } from "../../../src/domain/interview/scenario";
import type { SemanticCheckResult } from "../../../src/domain/semantic/contracts";
import {
  DEFAULT_QWEN_MODEL,
  createConfiguredLlmService,
} from "../../../src/server/llm-config";
import {
  createQuestionPlanSchema,
  createSemanticCheckResultSchema,
} from "../../../src/services/llm/schemas";
import type { LlmService } from "../../../src/services/llm/llm-service";

const runLiveSmoke = process.env.RUN_QWEN_SMOKE === "1";
const scenario = parseScenarioPack(scenarioData);
const projectContext =
  "I designed an indoor robot navigation experiment, implemented sensor-noise filtering, and compared repeated route success before and after the change.";

describe.runIf(runLiveSmoke)("Qwen live smoke", () => {
  let service: LlmService;
  let questionPlan: QuestionPlan;

  beforeAll(async () => {
    service = createConfiguredLlmService();
    expect(service.model).toBe(DEFAULT_QWEN_MODEL);

    const result = await service.generateQuestionPlan({
      projectContext,
      scenario,
    });
    if (!result.ok) {
      throw new Error(
        `generateQuestionPlan failed: ${result.error.code} after ${result.error.attempts} attempt(s)`,
      );
    }

    questionPlan = createQuestionPlanSchema(scenario).parse(result.value);
  }, 130_000);

  it("generates a QuestionPlan accepted by the existing Zod schema", () => {
    expect(questionPlan.surfaceQuestion).not.toHaveLength(0);
  });

  it(
    "evaluates a semantic checkpoint accepted by the existing Zod schema",
    async () => {
      const checkpointVersion = 1;
      const result = await service.evaluateSemanticCheckpoint({
        projectContext,
        questionPlan,
        transcript:
          "I personally implemented the filtering step and ran repeated fixed-route trials. The success rate improved in those trials, but the sample was too small to claim the method works in every environment.",
        checkpointVersion,
      });
      if (!result.ok) {
        throw new Error(
          `evaluateSemanticCheckpoint failed: ${result.error.code} after ${result.error.attempts} attempt(s)`,
        );
      }

      const semanticResult: SemanticCheckResult =
        createSemanticCheckResultSchema(
          questionPlan.id,
          checkpointVersion,
        ).parse(result.value);
      expect(semanticResult.questionId).toBe(questionPlan.id);
      expect(semanticResult.checkpointVersion).toBe(checkpointVersion);
    },
    130_000,
  );
});
