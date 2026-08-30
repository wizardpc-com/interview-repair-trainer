import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createCheckpoint,
  interruptForHardGate,
  prepareReanswer,
  startAnswer,
  updateTranscript,
} from "../../src/domain/interview/runtime";
import { arbitrateGate } from "../../src/domain/semantic/gate-arbiter";
import type { SemanticCheckResult } from "../../src/domain/semantic/contracts";
import { phaseOneScenario } from "../../src/server/phase-one-scenario";
import { InMemoryInterviewSessionStore } from "../../src/server/session-store";
import { createQuestionPlanSchema } from "../../src/services/llm/schemas";
import { GOLDEN_QUESTION_PLANS } from "../fixtures/golden-oracle";
import {
  createCapturingQwenService,
  redactConfiguredApiKey,
  type CapturedQwenAttempt,
} from "./qwen-live-helpers";

const reportDirectory = resolve("reports/golden");
const projectContexts = [
  "我在 K230 上完成了目标检测模型选型、量化和端侧部署。",
  "我参与了一个四人机器人项目，负责传感器同步与后端接口。",
  "我做了混合检索实验，并用固定问题集比较了检索结果。",
  "我完成了一个室内导航原型，但测试次数有限，仍有明显边界。",
] as const;

function requiredEvidenceIsExplicit(planId: string): boolean {
  const fixture = Object.values(GOLDEN_QUESTION_PLANS).find(
    ({ plan }) => plan.id === planId,
  );
  if (fixture === undefined) {
    return false;
  }
  const surfaceCues: Readonly<Record<string, readonly string[]>> =
    fixture.requiredEvidenceSurfaceCues;

  return fixture.plan.requiredEvidence.every(({ id }) => {
    const cues = surfaceCues[id];
    return (
      cues !== undefined &&
      cues.length > 0 &&
      cues.every((cue) => fixture.plan.surfaceQuestion.includes(cue))
    );
  });
}

function optionalEvidenceCannotGate(
  plan: ReturnType<ReturnType<typeof createQuestionPlanSchema>["parse"]>,
): boolean {
  const optional = plan.optionalEvidence[0];
  if (optional === undefined) {
    return true;
  }

  const invalidOptionalIssue = {
    questionId: plan.id,
    checkpointVersion: 1,
    confidence: 1,
    gateability: "GATE_ELIGIBLE",
    answerBoundary: "NONE",
    decision: "ISSUE_DETECTED",
    issueType: plan.allowedGateIssueTypes[0],
    triggeringCriterion: { kind: "REQUIRED_EVIDENCE", id: optional.id },
    issueExplanation: "Optional evidence is absent.",
    repairCue: "Add optional evidence.",
  } as const;

  return (
    arbitrateGate({
      questionPlan: plan,
      interviewState: { state: "IN_PROGRESS", activeQuestionId: plan.id },
      questionState: {
        questionId: plan.id,
        state: "ANSWERING",
        gateCount: 0,
        answerVersion: 1,
        checkpointVersion: 1,
      },
      transcriptSnapshot: "",
      semanticResult: invalidOptionalIssue as SemanticCheckResult,
      meetsConfidenceThreshold: true,
      surfaceQuestionSupport: "SUPPORTED",
      hasSufficientAnswerContext: true,
      issueIsPersistent: true,
    }) === "CONTINUE"
  );
}

describe("Qwen Planner Golden invariants (live, isolated from evaluator)", () => {
  it(
    "validates four Planner invariants against fixed scenario authority",
    async () => {
      const results = [];

      for (const [index, projectContext] of projectContexts.entries()) {
        const rawAttempts: CapturedQwenAttempt[] = [];
        const qwen = createCapturingQwenService(rawAttempts);
        const generated = await qwen.generateQuestionPlan({
          projectContext,
          scenario: phaseOneScenario,
        });

        if (!generated.ok) {
          results.push({
            run: index + 1,
            model: qwen.model,
            providerResult: generated,
            rawAttempts,
            invariants: null,
          });
          continue;
        }

        const plan = createQuestionPlanSchema(phaseOneScenario).parse(
          generated.value,
        );
        const store = new InMemoryInterviewSessionStore({
          ttlMs: 60_000,
          now: () => 1_000,
          idFactory: () => `planner-golden-${index + 1}`,
        });
        const stored = store.create({
          projectContext,
          scenario: {
            id: phaseOneScenario.id,
            version: phaseOneScenario.version,
          },
          questionPlans: [plan],
        });
        const frozenPlan = stored.questionPlans[0];
        const issueType = plan.allowedGateIssueTypes[0];
        if (issueType === undefined) {
          throw new Error("Generated plan must allow at least one issue type");
        }
        let runtime = startAnswer(stored.runtime, 1_000);
        runtime = updateTranscript(
          runtime,
          "这是一次用于验证回答开始后以及 Repair 阶段 QuestionPlan 冻结状态的完整回答。",
        );
        const checkpointed = createCheckpoint(runtime, 2_000);
        runtime = interruptForHardGate(checkpointed.runtime, {
          issueType,
          triggeringCriterion: {
            kind: "PRIMARY_TARGET",
            id: plan.primaryTarget.id,
          },
          checkpointVersion: checkpointed.checkpoint.checkpointVersion,
          triggeredAt: 3_000,
          whyPaused: "Planner Golden freeze check.",
          repairCue: "Preserve the frozen plan.",
        });
        runtime = prepareReanswer(runtime);
        store.updateRuntime(stored.sessionId, runtime);

        const family = phaseOneScenario.questionFamilies.find(
          ({ id }) => id === plan.id,
        );
        const requiredIds = new Set(
          family?.requiredEvidence.map(({ evidenceKindId }) => evidenceKindId),
        );
        const invariants = {
          exactlyOnePrimaryTarget:
            typeof plan.primaryTarget.id === "string" &&
            plan.primaryTarget.id.length > 0,
          requiredEvidenceExplicitlyAsked:
            family !== undefined &&
            plan.surfaceQuestion === family.surfaceQuestion &&
            requiredEvidenceIsExplicit(plan.id) &&
            plan.requiredEvidence.length === requiredIds.size &&
            plan.requiredEvidence.every(({ id }) => requiredIds.has(id)),
          optionalEvidenceCannotGate: optionalEvidenceCannotGate(plan),
          planFrozenAfterAnswerStarts:
            store.get(stored.sessionId)?.questionPlans[0] === frozenPlan &&
            Object.isFrozen(frozenPlan) &&
            Object.isFrozen(frozenPlan.requiredEvidence) &&
            Object.isFrozen(frozenPlan.optionalEvidence) &&
            store.get(stored.sessionId)?.runtime.questions[0]?.state ===
              "REPAIR" &&
            store.get(stored.sessionId)?.runtime.questions[0]?.repairStatus ===
              "REANSWER_PREPARED",
        };

        results.push({
          run: index + 1,
          model: qwen.model,
          questionPlan: plan,
          rawAttempts,
          invariants,
        });
      }

      await mkdir(reportDirectory, { recursive: true });
      const serializedReport = `${JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            suite: "Planner Golden invariants, separate from Semantic Evaluator",
            credentialSafety:
              "The serialized report was redacted and checked against the configured API key before writing.",
            results,
          },
          null,
          2,
        )}\n`;
      await writeFile(
        resolve(reportDirectory, "qwen-planner-v1.0.json"),
        redactConfiguredApiKey(serializedReport),
        "utf8",
      );

      expect(results).toHaveLength(projectContexts.length);
      for (const result of results) {
        expect("invariants" in result && result.invariants).not.toBeNull();
        if (!("invariants" in result) || result.invariants === null) {
          continue;
        }
        expect(Object.values(result.invariants).every(Boolean)).toBe(true);
      }
    },
    10 * 60_000,
  );
});
