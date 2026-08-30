import { describe, expect, expectTypeOf, it } from "vitest";
import {
  assertQuestionPlanInvariants,
  getGateEvidenceRequirements,
  type EvidenceRequirement,
  type QuestionPlan,
  type TrainingTarget,
} from "../../src/domain/interview/contracts";
import {
  INTERVIEW_STATES,
  QUESTION_STATES,
  type InterviewRuntimeState,
  type QuestionRuntimeState,
} from "../../src/domain/interview/state";
import {
  GATE_ISSUE_TYPES,
  type SemanticCheckResult,
} from "../../src/domain/semantic/contracts";

const primaryTarget: TrainingTarget = {
  id: "ownership",
  description: "State the candidate's personal contribution.",
};

const requiredEvidence: EvidenceRequirement = {
  id: "personal-action",
  description: "A concrete action performed by the candidate.",
};

const optionalEvidence: EvidenceRequirement = {
  id: "team-context",
  description: "Additional context about the surrounding team.",
};

function questionPlan(overrides: Partial<QuestionPlan> = {}): QuestionPlan {
  return {
    id: "question-1",
    surfaceQuestion: "What did you personally contribute to the project?",
    primaryTarget,
    requiredEvidence: [requiredEvidence],
    optionalEvidence: [optionalEvidence],
    allowedGateIssueTypes: ["OWNERSHIP_AMBIGUOUS"],
    ...overrides,
  };
}

describe("QuestionPlan", () => {
  it("has one primary target and separates gate evidence from optional evidence", () => {
    const plan = questionPlan();

    expect(() => assertQuestionPlanInvariants(plan)).not.toThrow();
    expect(getGateEvidenceRequirements(plan)).toEqual([requiredEvidence]);
    expect(getGateEvidenceRequirements(plan)).not.toContain(optionalEvidence);
    expectTypeOf(plan.primaryTarget).toEqualTypeOf<TrainingTarget>();
    expectTypeOf(plan.requiredEvidence).toEqualTypeOf<readonly EvidenceRequirement[]>();
    expectTypeOf(plan.optionalEvidence).toEqualTypeOf<readonly EvidenceRequirement[]>();
  });

  it("rejects evidence that is both required and optional", () => {
    const plan = questionPlan({ optionalEvidence: [requiredEvidence] });

    expect(() => assertQuestionPlanInvariants(plan)).toThrow(
      "requiredEvidence and optionalEvidence must not overlap",
    );
  });

  it("rejects duplicate evidence and allowed gate issue types", () => {
    expect(() =>
      assertQuestionPlanInvariants(
        questionPlan({ requiredEvidence: [requiredEvidence, requiredEvidence] }),
      ),
    ).toThrow("requiredEvidence must not contain duplicate ids");

    expect(() =>
      assertQuestionPlanInvariants(
        questionPlan({
          allowedGateIssueTypes: ["OWNERSHIP_AMBIGUOUS", "OWNERSHIP_AMBIGUOUS"],
        }),
      ),
    ).toThrow("allowedGateIssueTypes must not contain duplicates");
  });
});

describe("semantic and runtime contracts", () => {
  it("limits semantic issues to the three MVP gate types", () => {
    expect(GATE_ISSUE_TYPES).toEqual([
      "NOT_ANSWERING_QUESTION",
      "VAGUE_WITHOUT_EVIDENCE",
      "OWNERSHIP_AMBIGUOUS",
    ]);
  });

  it("keeps evaluator confidence separate from a Hard Gate decision", () => {
    const result: SemanticCheckResult = {
      questionId: "question-1",
      checkpointVersion: 2,
      decision: "ISSUE_DETECTED",
      issueType: "OWNERSHIP_AMBIGUOUS",
      confidence: 0.95,
      gateability: "GATE_ELIGIBLE",
      answerBoundary: "NONE",
      triggeringCriterion: {
        kind: "REQUIRED_EVIDENCE",
        id: "personal-action",
      },
      issueExplanation: "The answer only describes team activity.",
      repairCue: "State one personal action.",
    };

    expect(result.confidence).toBe(0.95);
    expect(result).not.toHaveProperty("hardGate");
  });

  it("defines minimal interview and question runtime states", () => {
    const interview: InterviewRuntimeState = {
      state: "IN_PROGRESS",
      activeQuestionId: "question-1",
    };
    const question: QuestionRuntimeState = {
      questionId: "question-1",
      state: "ANSWERING",
      gateCount: 0,
      answerVersion: 1,
      checkpointVersion: 0,
    };

    expect(INTERVIEW_STATES).toEqual(["NOT_STARTED", "IN_PROGRESS", "INTERVIEW_DONE"]);
    expect(QUESTION_STATES).toEqual([
      "QUESTION_READY",
      "ANSWERING",
      "REPAIR",
      "REANSWER",
      "QUESTION_DONE",
    ]);
    expect(interview.activeQuestionId).toBe(question.questionId);
  });
});
