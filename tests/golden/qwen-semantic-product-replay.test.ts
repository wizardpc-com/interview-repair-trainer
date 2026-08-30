import { describe, expect, it } from "vitest";
import type { QuestionPlan } from "../../src/domain/interview/contracts";
import type { SemanticCheckResult } from "../../src/domain/semantic/contracts";
import type { LlmResult } from "../../src/services/llm/llm-service";
import { GOLDEN_QUESTION_PLANS } from "../fixtures/golden-oracle";
import { replayCapturedSemanticResult } from "./qwen-semantic-product-replay";

function clearIssue(plan: QuestionPlan): LlmResult<SemanticCheckResult> {
  return {
    ok: true,
    value: {
      questionId: plan.id,
      checkpointVersion: 1,
      confidence: 0.99,
      gateability: "GATE_ELIGIBLE",
      answerBoundary: "NONE",
      decision: "ISSUE_DETECTED",
      issueType: "NOT_ANSWERING_QUESTION",
      triggeringCriterion: {
        kind: "PRIMARY_TARGET",
        id: plan.primaryTarget.id,
      },
      issueExplanation: "The answer does not address the question.",
      repairCue: "Answer the requested question directly.",
    },
  };
}

describe("Qwen Golden current-product replay", () => {
  const plan = GOLDEN_QUESTION_PLANS.QP1.plan;

  it("runs a long completed answer through FINAL after an unevaluated INTERIM checkpoint", async () => {
    const replay = await replayCapturedSemanticResult(
      {
        id: "G01",
        transcript: "只介绍实现细节，没有回应问题和重要性。".repeat(6),
        transcriptKind: "ANSWER",
      },
      "FIRST_PASS",
      1,
      plan,
      clearIssue(plan),
    );

    expect(replay.checkpointKind).toBe("FINAL");
    expect(replay.checkpointEligibility).toEqual({
      eligible: true,
      reason: "ELIGIBLE",
    });
    expect(replay.evaluatorCheckpoints).toEqual([
      { kind: "FINAL", checkpointVersion: 2 },
    ]);
    expect(replay.hasSufficientAnswerContext).toBe(true);
    expect(replay.persistenceSatisfied).toBe(true);
    expect(replay.persistenceBasis).toBe("FINAL_COMPLETION");
    expect(replay.arbiterDecision).toBe("GATE");
    expect(replay.finalProductDecision).toBe("GATE");
    expect(replay.finalRuntimeState).toBe("REPAIR");
  });

  it("evaluates a stable CHECKPOINT only as INTERIM and retains a candidate", async () => {
    const replay = await replayCapturedSemanticResult(
      {
        id: "G19",
        transcript: "只介绍实现细节，没有回应问题和重要性。".repeat(6),
        transcriptKind: "CHECKPOINT",
      },
      "FIRST_PASS",
      1,
      plan,
      clearIssue(plan),
    );

    expect(replay.checkpointKind).toBe("INTERIM");
    expect(replay.evaluatorCheckpoints).toEqual([
      { kind: "INTERIM", checkpointVersion: 1 },
    ]);
    expect(replay.hasSufficientAnswerContext).toBe(true);
    expect(replay.persistenceSatisfied).toBe(false);
    expect(replay.persistenceBasis).toBe(
      "INTERIM_REQUIRES_MATCHING_NEWER_CHECKPOINT",
    );
    expect(replay.arbiterDecision).toBe("GATE");
    expect(replay.finalProductDecision).toBe("CONTINUE");
    expect(replay.finalRuntimeState).toBe("ANSWERING");
  });

  it("completes a sub-minimum FINAL answer without invoking the evaluator", async () => {
    const replay = await replayCapturedSemanticResult(
      {
        id: "G07",
        transcript: "太短了",
        transcriptKind: "ANSWER",
      },
      "FIRST_PASS",
      1,
      plan,
      clearIssue(plan),
    );

    expect(replay.checkpointEligibility).toEqual({
      eligible: false,
      reason: "TRANSCRIPT_TOO_SHORT",
    });
    expect(replay.evaluatorCheckpoints).toEqual([]);
    expect(replay.hasSufficientAnswerContext).toBe(false);
    expect(replay.finalProductDecision).toBe("CONTINUE");
    expect(replay.finalRuntimeState).toBe("QUESTION_DONE");
  });
});
