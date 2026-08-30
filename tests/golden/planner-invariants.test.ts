import { describe, expect, it } from "vitest";
import {
  assertQuestionPlanInvariants,
  getGateEvidenceRequirements,
} from "../../src/domain/interview/contracts";
import {
  createCheckpoint,
  interruptForHardGate,
  prepareReanswer,
  startAnswer,
  updateTranscript,
} from "../../src/domain/interview/runtime";
import { phaseOneScenario } from "../../src/server/phase-one-scenario";
import { InMemoryInterviewSessionStore } from "../../src/server/session-store";
import {
  GOLDEN_PLANNER_INVARIANTS,
  GOLDEN_QUESTION_PLANS,
} from "../fixtures/golden-oracle";

const fixtures = Object.values(GOLDEN_QUESTION_PLANS);

describe("Golden QuestionPlan invariants", () => {
  it("encodes all four Oracle invariants", () => {
    expect(GOLDEN_PLANNER_INVARIANTS.map(({ id }) => id)).toEqual([
      "PI1",
      "PI2",
      "PI3",
      "PI4",
    ]);
  });

  it.each(fixtures)(
    "$oracleId has one canonical primary target and exact family contracts",
    ({ plan }) => {
      const family = phaseOneScenario.questionFamilies.find(
        ({ id }) => id === plan.id,
      );
      const target = phaseOneScenario.trainingTargets.find(
        ({ id }) => id === family?.primaryTargetId,
      );

      expect(family).toBeDefined();
      expect(target).toBeDefined();
      expect(() => assertQuestionPlanInvariants(plan)).not.toThrow();
      expect(plan).not.toHaveProperty("primaryTargets");
      expect(plan.primaryTarget).toEqual(target);
      expect(plan.surfaceQuestion).toBe(family?.surfaceQuestion);
      expect(plan.requiredEvidence.map(({ id }) => id)).toEqual(
        family?.requiredEvidence.map(({ evidenceKindId }) => evidenceKindId),
      );
      expect(plan.optionalEvidence.map(({ id }) => id)).toEqual(
        family?.optionalEvidenceKindIds,
      );
      expect(plan.allowedGateIssueTypes).toEqual(family?.allowedGateIssueTypes);
    },
  );

  it.each(fixtures)(
    "$oracleId explicitly asks for every required evidence item",
    ({ plan, requiredEvidenceSurfaceCues }) => {
      const surfaceCues: Readonly<Record<string, readonly string[]>> =
        requiredEvidenceSurfaceCues;
      expect(Object.keys(requiredEvidenceSurfaceCues)).toEqual(
        plan.requiredEvidence.map(({ id }) => id),
      );

      for (const evidence of plan.requiredEvidence) {
        const cues = surfaceCues[evidence.id];
        expect(cues).toBeDefined();
        for (const cue of cues ?? []) {
          expect(plan.surfaceQuestion).toContain(cue);
        }
      }
    },
  );

  it.each(fixtures)(
    "$oracleId keeps optional evidence outside the Hard Gate evidence set",
    ({ plan }) => {
      const gatingEvidenceIds = getGateEvidenceRequirements(plan).map(
        ({ id }) => id,
      );

      expect(gatingEvidenceIds).toEqual(
        plan.requiredEvidence.map(({ id }) => id),
      );
      for (const optionalEvidence of plan.optionalEvidence) {
        expect(gatingEvidenceIds).not.toContain(optionalEvidence.id);
      }
    },
  );

  it.each(fixtures)(
    "$oracleId remains frozen through answering and repair preparation",
    ({ oracleId, plan }) => {
      const store = new InMemoryInterviewSessionStore({
        ttlMs: 60_000,
        idFactory: () => `session-${oracleId}`,
      });
      const session = store.create({
        projectContext: "Golden planner invariant fixture.",
        scenario: {
          id: phaseOneScenario.id,
          version: phaseOneScenario.version,
        },
        questionPlans: [plan],
      });
      const storedPlan = session.questionPlans[0];
      if (storedPlan === undefined) {
        throw new Error("Golden session did not store its QuestionPlan");
      }
      const issueType = plan.allowedGateIssueTypes[0];
      if (issueType === undefined) {
        throw new Error("Golden QuestionPlan must allow at least one Gate issue");
      }

      let runtime = startAnswer(session.runtime, 1_000);
      runtime = updateTranscript(runtime, "这是用于验证冻结状态的一次完整回答。");
      const checkpointed = createCheckpoint(runtime, 2_000);
      runtime = interruptForHardGate(checkpointed.runtime, {
        issueType,
        triggeringCriterion: {
          kind: "PRIMARY_TARGET",
          id: plan.primaryTarget.id,
        },
        checkpointVersion: checkpointed.checkpoint.checkpointVersion,
        triggeredAt: 3_000,
        whyPaused: "Golden fixture interruption.",
        repairCue: "Golden fixture repair cue.",
      });
      runtime = prepareReanswer(runtime);
      const updated = store.updateRuntime(session.sessionId, runtime);

      expect(updated?.questionPlans[0]).toBe(storedPlan);
      expect(Object.isFrozen(storedPlan)).toBe(true);
      expect(Object.isFrozen(storedPlan.primaryTarget)).toBe(true);
      expect(Object.isFrozen(storedPlan.requiredEvidence)).toBe(true);
      expect(Object.isFrozen(storedPlan.optionalEvidence)).toBe(true);
      expect(updated?.runtime.questions[0]).toMatchObject({
        state: "REPAIR",
        repairStatus: "REANSWER_PREPARED",
      });
    },
  );
});
