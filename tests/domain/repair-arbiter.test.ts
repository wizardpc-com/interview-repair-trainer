import { describe, expect, it } from "vitest";
import type { QuestionPlan } from "../../src/domain/interview/contracts";
import type {
  InterviewRuntimeState,
  QuestionRuntimeState,
} from "../../src/domain/interview/state";
import type { SemanticCheckResult } from "../../src/domain/semantic/contracts";
import {
  arbitrateRepair,
  type RepairArbiterInput,
} from "../../src/domain/semantic/repair-arbiter";

const questionPlan: QuestionPlan = {
  id: "question-1",
  surfaceQuestion: "Explain the choice, your contribution, and the result.",
  primaryTarget: {
    id: "reason",
    description: "Explain the reason for the technical choice.",
  },
  requiredEvidence: [
    { id: "personal-action", description: "State one personal action." },
    { id: "validation", description: "Give a supported validation boundary." },
  ],
  optionalEvidence: [
    { id: "team-context", description: "Describe surrounding team context." },
  ],
  allowedGateIssueTypes: [
    "NOT_ANSWERING_QUESTION",
    "OWNERSHIP_AMBIGUOUS",
    "VAGUE_WITHOUT_EVIDENCE",
  ],
};

type IssueDetectedResult = Extract<
  SemanticCheckResult,
  { decision: "ISSUE_DETECTED" }
>;

const unresolvedResult = {
  questionId: questionPlan.id,
  checkpointVersion: 2,
  decision: "ISSUE_DETECTED",
  issueType: "NOT_ANSWERING_QUESTION",
  confidence: 0.98,
  gateability: "GATE_ELIGIBLE",
  answerBoundary: "NONE",
  triggeringCriterion: { kind: "PRIMARY_TARGET", id: "reason" },
  issueExplanation: "The reason is still missing.",
  repairCue: "State the reason.",
} satisfies IssueDetectedResult;

const interviewState: InterviewRuntimeState = {
  state: "IN_PROGRESS",
  activeQuestionId: questionPlan.id,
};

const questionState: QuestionRuntimeState = {
  questionId: questionPlan.id,
  state: "REANSWER",
  gateCount: 1,
  answerVersion: 3,
  checkpointVersion: unresolvedResult.checkpointVersion,
};

function repairInput(
  overrides: Partial<RepairArbiterInput> = {},
): RepairArbiterInput {
  return {
    questionPlan,
    interviewState,
    questionState,
    originalIssueType: unresolvedResult.issueType,
    originalTriggeringCriterion: unresolvedResult.triggeringCriterion,
    honestNoMeasurementSatisfiesOriginalCriterion: false,
    semanticResult: unresolvedResult,
    meetsConfidenceThreshold: true,
    surfaceQuestionSupport: "SUPPORTED",
    ...overrides,
  };
}

function continueResult(): SemanticCheckResult {
  return {
    questionId: questionPlan.id,
    checkpointVersion: unresolvedResult.checkpointVersion,
    decision: "CONTINUE",
    issueType: null,
    confidence: 0.9,
    gateability: "UNCERTAIN",
    answerBoundary: "NONE",
    triggeringCriterion: null,
    issueExplanation: null,
    repairCue: null,
  };
}

describe("Repair Arbiter", () => {
  it("marks a repaired reason answer successful without a perfection threshold", () => {
    expect(
      arbitrateRepair(repairInput({ semanticResult: continueResult() })),
    ).toBe("SUCCESSFUL");
  });

  it("marks recovered ownership successful", () => {
    expect(
      arbitrateRepair(repairInput({ semanticResult: continueResult() })),
    ).toBe("SUCCESSFUL");
  });

  it("accepts an honest no-measurement boundary as a successful repair", () => {
    expect(
      arbitrateRepair(
        repairInput({
          originalIssueType: "VAGUE_WITHOUT_EVIDENCE",
          originalTriggeringCriterion: {
            kind: "REQUIRED_EVIDENCE",
            id: "validation",
          },
          honestNoMeasurementSatisfiesOriginalCriterion: true,
          semanticResult: {
            ...unresolvedResult,
            issueType: "VAGUE_WITHOUT_EVIDENCE",
            triggeringCriterion: {
              kind: "REQUIRED_EVIDENCE",
              id: "validation",
            },
            answerBoundary: "HONEST_NO_MEASUREMENT",
          },
        }),
      ),
    ).toBe("SUCCESSFUL");
  });

  it("accepts a precommitted honest boundary after issue reclassification", () => {
    expect(
      arbitrateRepair(
        repairInput({
          originalIssueType: "NOT_ANSWERING_QUESTION",
          originalTriggeringCriterion: {
            kind: "REQUIRED_EVIDENCE",
            id: "validation",
          },
          honestNoMeasurementSatisfiesOriginalCriterion: true,
          semanticResult: {
            ...unresolvedResult,
            issueType: "VAGUE_WITHOUT_EVIDENCE",
            triggeringCriterion: {
              kind: "REQUIRED_EVIDENCE",
              id: "validation",
            },
            answerBoundary: "HONEST_NO_MEASUREMENT",
          },
        }),
      ),
    ).toBe("SUCCESSFUL");
  });

  it("keeps a reason repair unresolved when the supported primary issue remains", () => {
    expect(arbitrateRepair(repairInput())).toBe("UNRESOLVED");
  });

  it("keeps ownership unresolved when required personal action is still missing", () => {
    expect(
      arbitrateRepair(
        repairInput({
          originalIssueType: "OWNERSHIP_AMBIGUOUS",
          originalTriggeringCriterion: {
            kind: "REQUIRED_EVIDENCE",
            id: "personal-action",
          },
          semanticResult: {
            ...unresolvedResult,
            issueType: "OWNERSHIP_AMBIGUOUS",
            triggeringCriterion: {
              kind: "REQUIRED_EVIDENCE",
              id: "personal-action",
            },
          },
        }),
      ),
    ).toBe("UNRESOLVED");
  });

  it("keeps validation unresolved when required support is still missing", () => {
    expect(
      arbitrateRepair(
        repairInput({
          originalIssueType: "VAGUE_WITHOUT_EVIDENCE",
          originalTriggeringCriterion: {
            kind: "REQUIRED_EVIDENCE",
            id: "validation",
          },
          semanticResult: {
            ...unresolvedResult,
            issueType: "VAGUE_WITHOUT_EVIDENCE",
            triggeringCriterion: {
              kind: "REQUIRED_EVIDENCE",
              id: "validation",
            },
          },
        }),
      ),
    ).toBe("UNRESOLVED");
  });

  it("keeps the original criterion unresolved even when issue classification changes", () => {
    expect(
      arbitrateRepair(
        repairInput({
          semanticResult: {
            ...unresolvedResult,
            issueType: "VAGUE_WITHOUT_EVIDENCE",
          },
        }),
      ),
    ).toBe("UNRESOLVED");
  });

  it("keeps the original issue unresolved when its required criterion is reclassified", () => {
    expect(
      arbitrateRepair(
        repairInput({
          originalIssueType: "VAGUE_WITHOUT_EVIDENCE",
          originalTriggeringCriterion: {
            kind: "REQUIRED_EVIDENCE",
            id: "validation",
          },
          semanticResult: {
            ...unresolvedResult,
            issueType: "VAGUE_WITHOUT_EVIDENCE",
            triggeringCriterion: {
              kind: "REQUIRED_EVIDENCE",
              id: "personal-action",
            },
          },
        }),
      ),
    ).toBe("UNRESOLVED");
  });

  it("does not require a perfect answer after the original criterion is fixed", () => {
    expect(
      arbitrateRepair(
        repairInput({
          semanticResult: {
            ...unresolvedResult,
            issueType: "OWNERSHIP_AMBIGUOUS",
            triggeringCriterion: {
              kind: "REQUIRED_EVIDENCE",
              id: "personal-action",
            },
          },
        }),
      ),
    ).toBe("SUCCESSFUL");
  });

  it("does not let a measurement boundary hide an ownership issue", () => {
    expect(
      arbitrateRepair(
        repairInput({
          originalIssueType: "OWNERSHIP_AMBIGUOUS",
          originalTriggeringCriterion: {
            kind: "REQUIRED_EVIDENCE",
            id: "personal-action",
          },
          semanticResult: {
            ...unresolvedResult,
            issueType: "OWNERSHIP_AMBIGUOUS",
            answerBoundary: "HONEST_NO_MEASUREMENT",
            triggeringCriterion: {
              kind: "REQUIRED_EVIDENCE",
              id: "personal-action",
            },
          },
        }),
      ),
    ).toBe("UNRESOLVED");
  });

  it("does not let a measurement boundary erase a vague primary-target gap", () => {
    expect(
      arbitrateRepair(
        repairInput({
          originalIssueType: "VAGUE_WITHOUT_EVIDENCE",
          semanticResult: {
            ...unresolvedResult,
            issueType: "VAGUE_WITHOUT_EVIDENCE",
            answerBoundary: "HONEST_NO_MEASUREMENT",
          },
        }),
      ),
    ).toBe("UNRESOLVED");
  });

  it("does not let a measurement boundary satisfy unrelated required evidence", () => {
    expect(
      arbitrateRepair(
        repairInput({
          originalIssueType: "VAGUE_WITHOUT_EVIDENCE",
          originalTriggeringCriterion: {
            kind: "REQUIRED_EVIDENCE",
            id: "personal-action",
          },
          semanticResult: {
            ...unresolvedResult,
            issueType: "VAGUE_WITHOUT_EVIDENCE",
            answerBoundary: "HONEST_NO_MEASUREMENT",
            triggeringCriterion: {
              kind: "REQUIRED_EVIDENCE",
              id: "personal-action",
            },
          },
        }),
      ),
    ).toBe("UNRESOLVED");
  });

  it("never treats missing optional or foreign evidence as unresolved", () => {
    for (const id of ["team-context", "unknown-criterion"]) {
      expect(
        arbitrateRepair(
          repairInput({
            semanticResult: {
              ...unresolvedResult,
              issueType: "VAGUE_WITHOUT_EVIDENCE",
              triggeringCriterion: { kind: "REQUIRED_EVIDENCE", id },
            },
          }),
        ),
      ).toBe("SUCCESSFUL");
    }
  });

  it("fails open for uncertainty, low confidence, or unsupported surface criteria", () => {
    expect(
      arbitrateRepair(repairInput({ meetsConfidenceThreshold: false })),
    ).toBe("SUCCESSFUL");
    expect(
      arbitrateRepair(
        repairInput({
          semanticResult: { ...unresolvedResult, gateability: "UNCERTAIN" },
        }),
      ),
    ).toBe("SUCCESSFUL");
    expect(
      arbitrateRepair(
        repairInput({ surfaceQuestionSupport: "NOT_SUPPORTED" }),
      ),
    ).toBe("SUCCESSFUL");
    expect(
      arbitrateRepair(repairInput({ surfaceQuestionSupport: "UNCERTAIN" })),
    ).toBe("SUCCESSFUL");
  });

  it("does not carry first-answer length or persistence heuristics into repair", () => {
    expect(repairInput()).not.toHaveProperty("hasSufficientAnswerContext");
    expect(repairInput()).not.toHaveProperty("issueIsPersistent");
    expect(arbitrateRepair(repairInput())).toBe("UNRESOLVED");
  });

  it("requires a current re-answer result before declaring unresolved", () => {
    expect(
      arbitrateRepair(
        repairInput({
          semanticResult: { ...unresolvedResult, checkpointVersion: 1 },
        }),
      ),
    ).toBe("SUCCESSFUL");
    expect(
      arbitrateRepair(
        repairInput({
          questionState: { ...questionState, state: "REPAIR" },
        }),
      ),
    ).toBe("SUCCESSFUL");
    expect(
      arbitrateRepair(
        repairInput({
          interviewState: { state: "INTERVIEW_DONE", activeQuestionId: null },
        }),
      ),
    ).toBe("SUCCESSFUL");
  });

  it("does not mutate or replace the frozen QuestionPlan", () => {
    const serializedPlan = JSON.stringify(questionPlan);

    expect(arbitrateRepair(repairInput())).toBe("UNRESOLVED");
    expect(repairInput().questionPlan).toBe(questionPlan);
    expect(JSON.stringify(questionPlan)).toBe(serializedPlan);
  });
});
