import { describe, expect, it } from "vitest";
import type { QuestionPlan } from "../../src/domain/interview/contracts";
import type {
  InterviewRuntimeState,
  QuestionRuntimeState,
} from "../../src/domain/interview/state";
import type { SemanticCheckResult } from "../../src/domain/semantic/contracts";
import {
  arbitrateGate,
  type GateArbiterInput,
} from "../../src/domain/semantic/gate-arbiter";

const questionPlan: QuestionPlan = {
  id: "question-1",
  surfaceQuestion: "What did you personally contribute to the project?",
  primaryTarget: {
    id: "ownership",
    description: "State the candidate's personal contribution.",
  },
  requiredEvidence: [
    {
      id: "personal-action",
      description: "A concrete action performed by the candidate.",
    },
  ],
  optionalEvidence: [
    {
      id: "team-context",
      description: "Additional context about the surrounding team.",
    },
  ],
  allowedGateIssueTypes: ["OWNERSHIP_AMBIGUOUS"],
};

const semanticResult: SemanticCheckResult = {
  questionId: questionPlan.id,
  checkpointVersion: 2,
  decision: "ISSUE_DETECTED",
  issueType: "OWNERSHIP_AMBIGUOUS",
  confidence: 0.99,
};

const interviewState: InterviewRuntimeState = {
  state: "IN_PROGRESS",
  activeQuestionId: questionPlan.id,
};

const questionState: QuestionRuntimeState = {
  questionId: questionPlan.id,
  state: "ANSWERING",
  gateCount: 0,
  answerVersion: 2,
  checkpointVersion: semanticResult.checkpointVersion,
};

function gateInput(overrides: Partial<GateArbiterInput> = {}): GateArbiterInput {
  return {
    questionPlan,
    semanticResult,
    interviewState,
    questionState,
    evaluatorGateability: "GATE_ELIGIBLE",
    triggeringCriterion: {
      kind: "REQUIRED_EVIDENCE",
      id: "personal-action",
    },
    surfaceQuestionSupport: "SUPPORTED",
    hasSufficientAnswerContext: true,
    issueIsPersistent: true,
    ...overrides,
  };
}

describe("Gate Arbiter", () => {
  it("gates when every required condition is satisfied", () => {
    expect(arbitrateGate(gateInput())).toBe("GATE");
  });

  it("accepts the frozen primary target as a gate criterion", () => {
    expect(
      arbitrateGate(
        gateInput({
          triggeringCriterion: {
            kind: "PRIMARY_TARGET",
            id: "ownership",
          },
        }),
      ),
    ).toBe("GATE");
  });

  it("continues when confidence is high but answer context is insufficient", () => {
    expect(
      arbitrateGate(
        gateInput({
          hasSufficientAnswerContext: false,
          semanticResult: { ...semanticResult, confidence: 1 },
        }),
      ),
    ).toBe("CONTINUE");
  });

  it("continues for a stale checkpoint result", () => {
    expect(
      arbitrateGate(
        gateInput({
          semanticResult: { ...semanticResult, checkpointVersion: 1 },
        }),
      ),
    ).toBe("CONTINUE");
  });

  it("continues when the interview or question state does not allow a gate", () => {
    expect(
      arbitrateGate(
        gateInput({
          questionState: { ...questionState, state: "REPAIR" },
        }),
      ),
    ).toBe("CONTINUE");

    expect(
      arbitrateGate(
        gateInput({
          interviewState: { state: "INTERVIEW_DONE", activeQuestionId: null },
        }),
      ),
    ).toBe("CONTINUE");
  });

  it("continues after the question has already gated once", () => {
    expect(
      arbitrateGate(
        gateInput({
          questionState: { ...questionState, gateCount: 1 },
        }),
      ),
    ).toBe("CONTINUE");
  });

  it("continues when the issue type is not allowed for the question", () => {
    expect(
      arbitrateGate(
        gateInput({
          semanticResult: {
            ...semanticResult,
            issueType: "NOT_ANSWERING_QUESTION",
          },
        }),
      ),
    ).toBe("CONTINUE");
  });

  it("continues for upstream uncertainty or a non-issue decision", () => {
    expect(
      arbitrateGate(gateInput({ evaluatorGateability: "UNCERTAIN" })),
    ).toBe("CONTINUE");
    expect(arbitrateGate(gateInput({ semanticResult: null }))).toBe("CONTINUE");
    expect(
      arbitrateGate(
        gateInput({
          semanticResult: {
            ...semanticResult,
            decision: "CONTINUE",
            issueType: null,
          },
        }),
      ),
    ).toBe("CONTINUE");
  });

  it("continues when the issue is transient or answer context is incomplete", () => {
    expect(arbitrateGate(gateInput({ issueIsPersistent: false }))).toBe("CONTINUE");
    expect(
      arbitrateGate(gateInput({ hasSufficientAnswerContext: false })),
    ).toBe("CONTINUE");
  });

  it("continues unless the triggering criterion is gating and surface-supported", () => {
    expect(
      arbitrateGate(
        gateInput({
          triggeringCriterion: {
            kind: "REQUIRED_EVIDENCE",
            id: "team-context",
          },
        }),
      ),
    ).toBe("CONTINUE");
    expect(
      arbitrateGate(gateInput({ surfaceQuestionSupport: "UNCERTAIN" })),
    ).toBe("CONTINUE");
    expect(
      arbitrateGate(gateInput({ surfaceQuestionSupport: "NOT_SUPPORTED" })),
    ).toBe("CONTINUE");
  });

  it("continues when the result belongs to another question", () => {
    expect(
      arbitrateGate(
        gateInput({
          semanticResult: { ...semanticResult, questionId: "question-2" },
        }),
      ),
    ).toBe("CONTINUE");
  });
});
