import type { QuestionPlan } from "./contracts";
import type { InterviewRuntime } from "./runtime";

export type TrainingQuestionReport = Readonly<{
  index: number;
  question: string;
  finalAnswer: string;
  hardGate: Readonly<{
    whyPaused: string;
    originalAnswer: string;
    repairAnswer: string | null;
    repairResult: "修复成功" | "仍未解决" | null;
    overridden: boolean;
  }> | null;
}>;

export type TrainingReport = Readonly<{
  completedQuestions: number;
  firstPassQuestions: number;
  hardGateCount: number;
  repairCount: number;
  repairSuccessfulCount: number;
  unresolvedCount: number;
  questions: readonly TrainingQuestionReport[];
}>;

export function createTrainingReport(
  runtime: InterviewRuntime,
  questionPlans: readonly QuestionPlan[],
): TrainingReport {
  if (
    runtime.interviewState.state !== "INTERVIEW_DONE" ||
    runtime.questions.length !== questionPlans.length ||
    runtime.questions.some(
      (question, index) =>
        question.state !== "QUESTION_DONE" ||
        question.questionId !== questionPlans[index]?.id,
    )
  ) {
    throw new Error("Training report requires one completed runtime question per plan");
  }

  const questions = runtime.questions.map((question, index) => {
    const plan = questionPlans[index];
    if (plan === undefined) {
      throw new Error("Training report is missing a QuestionPlan");
    }

    const hardGate =
      question.hardGate === null
        ? null
        : Object.freeze({
            whyPaused: question.hardGate.whyPaused,
            originalAnswer: question.originalAnswer ?? question.transcript,
            repairAnswer: question.repairedAnswer,
            repairResult:
              question.repairOutcome === null
                ? null
                : question.repairOutcome === "SUCCESSFUL"
                  ? ("修复成功" as const)
                  : ("仍未解决" as const),
            overridden: question.gateOverride !== null,
          });

    return Object.freeze({
      index: index + 1,
      question: plan.surfaceQuestion,
      finalAnswer: question.repairedAnswer ?? question.transcript,
      hardGate,
    });
  });

  return Object.freeze({
    completedQuestions: runtime.questions.length,
    firstPassQuestions: runtime.questions.filter(({ gateCount }) => gateCount === 0)
      .length,
    hardGateCount: runtime.questions.reduce(
      (total, { gateCount }) => total + gateCount,
      0,
    ),
    repairCount: runtime.questions.filter(
      ({ repairOutcome }) => repairOutcome !== null,
    ).length,
    repairSuccessfulCount: runtime.questions.filter(
      ({ repairOutcome }) => repairOutcome === "SUCCESSFUL",
    ).length,
    unresolvedCount: runtime.questions.filter(
      ({ repairOutcome }) => repairOutcome === "UNRESOLVED",
    ).length,
    questions: Object.freeze(questions),
  });
}
