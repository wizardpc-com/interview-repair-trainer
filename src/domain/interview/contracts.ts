import type { GateIssueType } from "../semantic/contracts";

export type TrainingTarget = Readonly<{
  id: string;
  description: string;
}>;

export type EvidenceRequirement = Readonly<{
  id: string;
  description: string;
}>;

export type QuestionPlan = Readonly<{
  id: string;
  surfaceQuestion: string;
  primaryTarget: TrainingTarget;
  requiredEvidence: readonly EvidenceRequirement[];
  optionalEvidence: readonly EvidenceRequirement[];
  allowedGateIssueTypes: readonly GateIssueType[];
}>;

function assertUniqueIds(items: readonly { id: string }[], label: string): void {
  if (new Set(items.map(({ id }) => id)).size !== items.length) {
    throw new Error(`${label} must not contain duplicate ids`);
  }
}

export function assertQuestionPlanInvariants(plan: QuestionPlan): void {
  assertUniqueIds(plan.requiredEvidence, "requiredEvidence");
  assertUniqueIds(plan.optionalEvidence, "optionalEvidence");

  const requiredIds = new Set(plan.requiredEvidence.map(({ id }) => id));
  if (plan.optionalEvidence.some(({ id }) => requiredIds.has(id))) {
    throw new Error("requiredEvidence and optionalEvidence must not overlap");
  }

  if (new Set(plan.allowedGateIssueTypes).size !== plan.allowedGateIssueTypes.length) {
    throw new Error("allowedGateIssueTypes must not contain duplicates");
  }
}

export function getGateEvidenceRequirements(
  plan: QuestionPlan,
): readonly EvidenceRequirement[] {
  return plan.requiredEvidence;
}
