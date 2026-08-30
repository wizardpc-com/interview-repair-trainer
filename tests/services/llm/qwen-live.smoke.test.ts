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
const technicalChoicePlan: QuestionPlan = {
  id: "technical-choice",
  surfaceQuestion: "你选择了哪项重要的技术方案？为什么这样选择？",
  primaryTarget: {
    id: "technical-reasoning",
    description: "Explain a technical choice and the reasoning behind it.",
  },
  requiredEvidence: [
    {
      id: "decision-rationale",
      description: "Reasoning or tradeoffs behind a technical choice.",
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
    expect(questionPlan.surfaceQuestion).toMatch(/\p{Script=Han}/u);
  });

  it(
    "continues a normal answer that explains the technical choice",
    async () => {
      const checkpointVersion = 1;
      const result = await service.evaluateSemanticCheckpoint({
        projectContext,
        questionPlan: technicalChoicePlan,
        transcript:
          "我选择中值滤波，是因为传感器噪声主要是偶发尖峰，而板载算力有限。它比复杂模型更容易实时运行，也能保留路径变化需要的边缘信息；我随后用相同路线的重复试验检查了这个取舍。",
        checkpointVersion,
        checkpointKind: "FINAL",
      });
      if (!result.ok) {
        throw new Error(
          `evaluateSemanticCheckpoint failed: ${result.error.code} after ${result.error.attempts} attempt(s)`,
        );
      }

      const semanticResult: SemanticCheckResult =
        createSemanticCheckResultSchema(
          technicalChoicePlan,
          checkpointVersion,
        ).parse(result.value);
      expect(semanticResult.questionId).toBe(technicalChoicePlan.id);
      expect(semanticResult.checkpointVersion).toBe(checkpointVersion);
      expect(semanticResult.decision).toBe("CONTINUE");
    },
    130_000,
  );

  it(
    "detects a clear answer that keeps describing what instead of why",
    async () => {
      const checkpointVersion = 2;
      const result = await service.evaluateSemanticCheckpoint({
        projectContext,
        questionPlan: technicalChoicePlan,
        transcript:
          "中值滤波会把窗口里的数值排序，再取中间值作为输出。我实现了一个滑动窗口，对每一帧传感器数据依次处理，然后把处理后的数据送进路径规划模块。这个模块包含输入缓冲、窗口更新、排序和输出几个步骤，我还把每一步都封装成了独立函数。至于为什么选择它、当时有什么约束或取舍，我这里没有说明。",
        checkpointVersion,
        checkpointKind: "FINAL",
      });
      if (!result.ok) {
        throw new Error(
          `evaluateSemanticCheckpoint failed: ${result.error.code} after ${result.error.attempts} attempt(s)`,
        );
      }

      const semanticResult = createSemanticCheckResultSchema(
        technicalChoicePlan,
        checkpointVersion,
      ).parse(result.value);
      expect(semanticResult.decision).toBe("ISSUE_DETECTED");
      if (semanticResult.decision === "ISSUE_DETECTED") {
        expect(technicalChoicePlan.allowedGateIssueTypes).toContain(
          semanticResult.issueType,
        );
      }
    },
    130_000,
  );
});
