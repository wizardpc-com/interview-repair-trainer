export const GATE_ISSUE_TYPES = [
  "NOT_ANSWERING_QUESTION",
  "VAGUE_WITHOUT_EVIDENCE",
  "OWNERSHIP_AMBIGUOUS",
] as const;

export type GateIssueType = (typeof GATE_ISSUE_TYPES)[number];

type SemanticCheckMetadata = Readonly<{
  questionId: string;
  checkpointVersion: number;
  /** Uncalibrated evaluator signal; it is neither a probability nor a gate decision. */
  confidence: number;
}>;

export type SemanticCheckResult = SemanticCheckMetadata &
  (
    | Readonly<{
        decision: "CONTINUE";
        issueType: null;
      }>
    | Readonly<{
        decision: "ISSUE_DETECTED";
        issueType: GateIssueType;
      }>
  );
