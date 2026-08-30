import { describe, expect, it } from "vitest";
import type { QuestionPlan } from "../../src/domain/interview/contracts";
import {
  completeAnswer,
  completeRepair,
  createCheckpoint,
  createInterviewRuntime,
  interruptForHardGate,
  startAnswer,
  startReanswer,
  updateTranscript,
  type InterviewRuntime,
} from "../../src/domain/interview/runtime";
import { createTrainingReport } from "../../src/domain/interview/report";
import type { SemanticCheckResult } from "../../src/domain/semantic/contracts";

const plans = [
  {
    id: "personal-contribution",
    surfaceQuestion: "哪些工作是由你本人完成的？",
    primaryTarget: { id: "personal-ownership", description: "Personal ownership." },
    requiredEvidence: [{ id: "personal-action", description: "A personal action." }],
    optionalEvidence: [],
    allowedGateIssueTypes: ["OWNERSHIP_AMBIGUOUS"],
  },
  {
    id: "technical-choice",
    surfaceQuestion: "你为什么选择这项技术方案？",
    primaryTarget: { id: "technical-reasoning", description: "Technical reasoning." },
    requiredEvidence: [{ id: "decision-rationale", description: "A rationale." }],
    optionalEvidence: [],
    allowedGateIssueTypes: ["NOT_ANSWERING_QUESTION"],
  },
  {
    id: "results-and-validation",
    surfaceQuestion: "你观察到了什么结果，如何验证？",
    primaryTarget: { id: "evidence-based-result", description: "Validated result." },
    requiredEvidence: [{ id: "validation-method", description: "A validation method." }],
    optionalEvidence: [],
    allowedGateIssueTypes: ["VAGUE_WITHOUT_EVIDENCE"],
  },
] as const satisfies readonly QuestionPlan[];

function issueResult(
  questionId: string,
  checkpointVersion: number,
  criterionId: string,
): Extract<SemanticCheckResult, { decision: "ISSUE_DETECTED" }> {
  return {
    questionId,
    checkpointVersion,
    confidence: 0.96,
    gateability: "GATE_ELIGIBLE",
    answerBoundary: "NONE",
    decision: "ISSUE_DETECTED",
    issueType: "NOT_ANSWERING_QUESTION",
    triggeringCriterion: { kind: "PRIMARY_TARGET", id: criterionId },
    issueExplanation: "Internal issue explanation.",
    repairCue: "Internal repair cue.",
  };
}

function gateCurrentQuestion(
  runtime: InterviewRuntime,
  answer: string,
  now: number,
  whyPaused: string,
): InterviewRuntime {
  runtime = updateTranscript(startAnswer(runtime, now), answer);
  const checkpointed = createCheckpoint(runtime, now + 100, "FINAL");
  const question = checkpointed.runtime.questions[checkpointed.runtime.currentQuestionIndex];
  if (question === undefined) {
    throw new Error("Missing active question");
  }
  const plan = plans[checkpointed.runtime.currentQuestionIndex];
  if (plan === undefined) {
    throw new Error("Missing active plan");
  }
  const beforeEvaluation = issueResult(
    question.questionId,
    checkpointed.checkpoint.checkpointVersion,
    plan.primaryTarget.id,
  );

  return interruptForHardGate(checkpointed.runtime, {
    issueType: beforeEvaluation.issueType,
    triggeringCriterion: beforeEvaluation.triggeringCriterion,
    checkpointVersion: beforeEvaluation.checkpointVersion,
    triggeredAt: now + 200,
    whyPaused,
    repairCue: "请直接补充当前缺口。",
    beforeEvaluation,
  });
}

function completeCurrentRepair(
  runtime: InterviewRuntime,
  answer: string,
  now: number,
  outcome: "SUCCESSFUL" | "UNRESOLVED",
): InterviewRuntime {
  runtime = updateTranscript(startReanswer(runtime, now), answer);
  const checkpointed = createCheckpoint(runtime, now + 100, "FINAL");
  const question = checkpointed.runtime.questions[checkpointed.runtime.currentQuestionIndex];
  const plan = plans[checkpointed.runtime.currentQuestionIndex];
  if (question === undefined || plan === undefined) {
    throw new Error("Missing repair question");
  }
  const afterEvaluation: SemanticCheckResult =
    outcome === "SUCCESSFUL"
      ? {
          questionId: question.questionId,
          checkpointVersion: checkpointed.checkpoint.checkpointVersion,
          confidence: 0.91,
          gateability: "UNCERTAIN",
          answerBoundary: "NONE",
          decision: "CONTINUE",
          issueType: null,
          triggeringCriterion: null,
          issueExplanation: null,
          repairCue: null,
        }
      : issueResult(
          question.questionId,
          checkpointed.checkpoint.checkpointVersion,
          plan.primaryTarget.id,
        );

  return completeRepair(checkpointed.runtime, afterEvaluation, outcome);
}

describe("deterministic training report", () => {
  it("aggregates one direct pass, one successful repair, and one unresolved repair", () => {
    let runtime = createInterviewRuntime(
      "session-report",
      plans.map(({ id }) => id),
    );

    runtime = completeAnswer(
      updateTranscript(startAnswer(runtime, 1_000), "我本人实现了数据处理模块。"),
    );
    runtime = gateCurrentQuestion(
      runtime,
      "我选择了这个方案，但没有解释原因。",
      2_000,
      "当前回答没有说明技术选择的原因。",
    );
    runtime = completeCurrentRepair(
      runtime,
      "因为设备内存有限，我选择了占用更小的方案。",
      3_000,
      "SUCCESSFUL",
    );
    runtime = gateCurrentQuestion(
      runtime,
      "结果很好。",
      4_000,
      "当前回答没有说明结果如何验证。",
    );
    runtime = completeCurrentRepair(
      runtime,
      "结果还是很好。",
      5_000,
      "UNRESOLVED",
    );

    expect(runtime.interviewState.state).toBe("INTERVIEW_DONE");
    const report = createTrainingReport(runtime, plans);

    expect(report).toMatchObject({
      completedQuestions: 3,
      firstPassQuestions: 1,
      hardGateCount: 2,
      repairCount: 2,
      repairSuccessfulCount: 1,
      unresolvedCount: 1,
    });
    expect(report.questions[0]).toMatchObject({
      question: plans[0].surfaceQuestion,
      finalAnswer: "我本人实现了数据处理模块。",
      hardGate: null,
    });
    expect(report.questions[1]).toMatchObject({
      finalAnswer: "因为设备内存有限，我选择了占用更小的方案。",
      hardGate: {
        whyPaused: "当前回答没有说明技术选择的原因。",
        originalAnswer: "我选择了这个方案，但没有解释原因。",
        repairAnswer: "因为设备内存有限，我选择了占用更小的方案。",
        repairResult: "修复成功",
        overridden: false,
      },
    });
    expect(report.questions[2].hardGate?.repairResult).toBe("仍未解决");
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.questions)).toBe(true);

    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(
      /confidence|issueType|triggeringCriterion|NOT_ANSWERING_QUESTION|VAGUE_WITHOUT_EVIDENCE|OWNERSHIP_AMBIGUOUS|score|rank|probability/i,
    );
  });

  it("refuses to report an incomplete interview", () => {
    expect(() =>
      createTrainingReport(
        createInterviewRuntime("incomplete", plans.map(({ id }) => id)),
        plans,
      ),
    ).toThrow("requires one completed runtime question per plan");
  });
});
