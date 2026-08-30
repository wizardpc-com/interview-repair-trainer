export const INTERVIEW_STATES = ["NOT_STARTED", "IN_PROGRESS", "INTERVIEW_DONE"] as const;

export type InterviewState = (typeof INTERVIEW_STATES)[number];

export const QUESTION_STATES = [
  "QUESTION_READY",
  "ANSWERING",
  "WRAP_UP",
  "REPAIR",
  "REANSWER",
  "QUESTION_DONE",
] as const;

export type QuestionState = (typeof QUESTION_STATES)[number];

export type InterviewRuntimeState =
  | Readonly<{
      state: "NOT_STARTED" | "INTERVIEW_DONE";
      activeQuestionId: null;
    }>
  | Readonly<{
      state: "IN_PROGRESS";
      activeQuestionId: string;
    }>;

export type QuestionRuntimeState = Readonly<{
  questionId: string;
  state: QuestionState;
  gateCount: 0 | 1;
  answerVersion: number;
  checkpointVersion: number;
}>;
