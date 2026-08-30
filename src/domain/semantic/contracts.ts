export const GATE_ISSUE_TYPES = [
  "NOT_ANSWERING_QUESTION",
  "VAGUE_WITHOUT_EVIDENCE",
  "OWNERSHIP_AMBIGUOUS",
] as const;

export type GateIssueType = (typeof GATE_ISSUE_TYPES)[number];

export const EVALUATOR_GATEABILITIES = [
  "GATE_ELIGIBLE",
  "UNCERTAIN",
] as const;

export type EvaluatorGateability =
  (typeof EVALUATOR_GATEABILITIES)[number];

export const ANSWER_BOUNDARIES = [
  "NONE",
  "HONEST_NO_MEASUREMENT",
  "UNCERTAIN",
  "ANSWER_COMPLETE_BUT_RAMBLING",
] as const;

export type AnswerBoundary = (typeof ANSWER_BOUNDARIES)[number];

export type GateCriterion =
  | Readonly<{
      kind: "PRIMARY_TARGET";
      id: string;
    }>
  | Readonly<{
      kind: "REQUIRED_EVIDENCE";
      id: string;
    }>;

type SemanticCheckMetadata = Readonly<{
  questionId: string;
  checkpointVersion: number;
  /** Uncalibrated evaluator signal; it is neither a probability nor a gate decision. */
  confidence: number;
  gateability: EvaluatorGateability;
  answerBoundary: AnswerBoundary;
}>;

export type SemanticCheckResult = SemanticCheckMetadata &
  (
    | Readonly<{
        decision: "CONTINUE";
        issueType: null;
        triggeringCriterion: null;
        issueExplanation: null;
        repairCue: null;
      }>
    | Readonly<{
        decision: "ISSUE_DETECTED";
        issueType: GateIssueType;
        triggeringCriterion: GateCriterion;
        /** Internal evaluator rationale. It is never rendered directly to the user. */
        issueExplanation: string;
        /** Internal advisory cue. User copy remains deterministic application copy. */
        repairCue: string;
      }>
  );
