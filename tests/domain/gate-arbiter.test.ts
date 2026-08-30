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

const semanticResult = {
  questionId: questionPlan.id,
  checkpointVersion: 2,
  decision: "ISSUE_DETECTED",
  issueType: "OWNERSHIP_AMBIGUOUS",
  confidence: 0.99,
  gateability: "GATE_ELIGIBLE",
  answerBoundary: "NONE",
  triggeringCriterion: {
    kind: "REQUIRED_EVIDENCE",
    id: "personal-action",
  },
  issueExplanation: "The answer only describes team activity.",
  repairCue: "State one personal action.",
} satisfies SemanticCheckResult;

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
    transcriptSnapshot: "We worked on the project together.",
    meetsConfidenceThreshold: true,
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
          semanticResult: {
            ...semanticResult,
            triggeringCriterion: {
              kind: "PRIMARY_TARGET",
              id: "ownership",
            },
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

  it.each([
    "我主要负责后端。",
    "这个项目是四个人一起做的，但我个人负责模型选型、量化和端侧推理接口。",
    "I was personally responsible for the backend API.",
  ])(
    "continues for an ownership issue after explicit personal responsibility: %s",
    (transcriptSnapshot) => {
      expect(arbitrateGate(gateInput({ transcriptSnapshot }))).toBe(
        "CONTINUE",
      );
    },
  );

  it.each([
    "我们一起负责模型、部署和测试。",
    "我是项目负责人，整体上的事情基本都是我负责。",
    "我负责。",
    "后端不是我负责的。",
    "我不负责后端。",
    "I was not responsible for the backend API.",
    "I was responsible for everything.",
  ])(
    "does not suppress an ownership gate without a named personal responsibility: %s",
    (transcriptSnapshot) => {
      expect(arbitrateGate(gateInput({ transcriptSnapshot }))).toBe("GATE");
    },
  );

  it.each([
    "NOT_ANSWERING_QUESTION",
    "VAGUE_WITHOUT_EVIDENCE",
  ] as const)(
    "does not suppress %s when personal responsibility is explicit",
    (issueType) => {
      expect(
        arbitrateGate(
          gateInput({
            questionPlan: {
              ...questionPlan,
              allowedGateIssueTypes: [
                "NOT_ANSWERING_QUESTION",
                "VAGUE_WITHOUT_EVIDENCE",
                "OWNERSHIP_AMBIGUOUS",
              ],
            },
            transcriptSnapshot: "我主要负责后端。",
            semanticResult: { ...semanticResult, issueType },
          }),
        ),
      ).toBe("GATE");
    },
  );

  it("does not apply the ownership guard outside a personal-contribution plan", () => {
    expect(
      arbitrateGate(
        gateInput({
          questionPlan: {
            ...questionPlan,
            surfaceQuestion: "Why did this architecture fit the constraints?",
            primaryTarget: {
              ...questionPlan.primaryTarget,
              description: "Explain the architecture choice and its tradeoffs.",
            },
            requiredEvidence: [
              {
                id: "personal-action",
                description: "A constraint supporting the architecture choice.",
              },
            ],
          },
          transcriptSnapshot: "我主要负责后端。",
        }),
      ),
    ).toBe("GATE");
  });

  it("uses the frozen checkpoint transcript rather than newer question text", () => {
    const questionWithNewerTranscript = {
      ...questionState,
      transcript: "我主要负责后端。",
    };

    expect(
      arbitrateGate(
        gateInput({
          questionState: questionWithNewerTranscript,
          transcriptSnapshot: "我们一起负责模型、部署和测试。",
        }),
      ),
    ).toBe("GATE");
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
      arbitrateGate(
        gateInput({
          semanticResult: {
            ...semanticResult,
            gateability: "UNCERTAIN",
          },
        }),
      ),
    ).toBe("CONTINUE");
    expect(arbitrateGate(gateInput({ semanticResult: null }))).toBe("CONTINUE");
    expect(
      arbitrateGate(
        gateInput({
          semanticResult: {
            questionId: questionPlan.id,
            checkpointVersion: 2,
            confidence: 0.99,
            gateability: "UNCERTAIN",
            answerBoundary: "NONE",
            decision: "CONTINUE",
            issueType: null,
            triggeringCriterion: null,
            issueExplanation: null,
            repairCue: null,
          },
        }),
      ),
    ).toBe("CONTINUE");
  });

  it("continues for any issue type at an honest or uncertain answer boundary", () => {
    for (const answerBoundary of [
      "HONEST_NO_MEASUREMENT",
      "UNCERTAIN",
      "ANSWER_COMPLETE_BUT_RAMBLING",
    ] as const) {
      expect(
        arbitrateGate(
          gateInput({
            semanticResult: {
              ...semanticResult,
              issueType: "OWNERSHIP_AMBIGUOUS",
              answerBoundary,
            },
          }),
        ),
      ).toBe("CONTINUE");
    }
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
          semanticResult: {
            ...semanticResult,
            triggeringCriterion: {
              kind: "REQUIRED_EVIDENCE",
              id: "team-context",
            },
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
