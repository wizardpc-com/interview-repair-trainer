import { z } from "zod";
import type { InterviewScenarioPack } from "../../domain/interview/scenario";
import { GATE_ISSUE_TYPES } from "../../domain/semantic/contracts";

const nonEmptyString = z.string().trim().min(1);
const gateIssueTypeSchema = z.enum(GATE_ISSUE_TYPES);

const trainingTargetSchema = z
  .object({
    id: nonEmptyString,
    description: nonEmptyString,
  })
  .strict();

const evidenceRequirementSchema = z
  .object({
    id: nonEmptyString,
    description: nonEmptyString,
  })
  .strict();

export const questionPlanSchema = z
  .object({
    id: nonEmptyString,
    surfaceQuestion: nonEmptyString,
    primaryTarget: trainingTargetSchema,
    requiredEvidence: z.array(evidenceRequirementSchema),
    optionalEvidence: z.array(evidenceRequirementSchema),
    allowedGateIssueTypes: z.array(gateIssueTypeSchema),
  })
  .strict()
  .superRefine((plan, context) => {
    const requiredIds = plan.requiredEvidence.map(({ id }) => id);
    const optionalIds = plan.optionalEvidence.map(({ id }) => id);
    const issueTypes = plan.allowedGateIssueTypes;

    if (new Set(requiredIds).size !== requiredIds.length) {
      context.addIssue({
        code: "custom",
        message: "requiredEvidence must not contain duplicate ids",
        path: ["requiredEvidence"],
      });
    }

    if (new Set(optionalIds).size !== optionalIds.length) {
      context.addIssue({
        code: "custom",
        message: "optionalEvidence must not contain duplicate ids",
        path: ["optionalEvidence"],
      });
    }

    const requiredIdSet = new Set(requiredIds);
    if (optionalIds.some((id) => requiredIdSet.has(id))) {
      context.addIssue({
        code: "custom",
        message: "requiredEvidence and optionalEvidence must not overlap",
        path: ["optionalEvidence"],
      });
    }

    if (new Set(issueTypes).size !== issueTypes.length) {
      context.addIssue({
        code: "custom",
        message: "allowedGateIssueTypes must not contain duplicates",
        path: ["allowedGateIssueTypes"],
      });
    }
  });

export function createQuestionPlanSchema(scenario: InterviewScenarioPack) {
  const targetsById = new Map(
    scenario.trainingTargets.map((target) => [target.id, target]),
  );
  const evidenceKindsById = new Map(
    scenario.evidenceKinds.map((evidenceKind) => [evidenceKind.id, evidenceKind]),
  );
  const scenarioIssueTypes = new Set(scenario.gateIssueTypes);

  return questionPlanSchema.superRefine((plan, context) => {
    const target = targetsById.get(plan.primaryTarget.id);
    if (target === undefined) {
      context.addIssue({
        code: "custom",
        message: "primaryTarget is not supported by the scenario",
        path: ["primaryTarget", "id"],
      });
    } else if (target.description !== plan.primaryTarget.description) {
      context.addIssue({
        code: "custom",
        message: "primaryTarget does not match the scenario definition",
        path: ["primaryTarget", "description"],
      });
    }

    for (const [field, requirements] of [
      ["requiredEvidence", plan.requiredEvidence],
      ["optionalEvidence", plan.optionalEvidence],
    ] as const) {
      requirements.forEach((requirement, index) => {
        const evidenceKind = evidenceKindsById.get(requirement.id);
        if (evidenceKind === undefined) {
          context.addIssue({
            code: "custom",
            message: `${field} contains evidence not supported by the scenario`,
            path: [field, index, "id"],
          });
        } else if (evidenceKind.description !== requirement.description) {
          context.addIssue({
            code: "custom",
            message: `${field} does not match the scenario definition`,
            path: [field, index, "description"],
          });
        }
      });
    }

    plan.allowedGateIssueTypes.forEach((issueType, index) => {
      if (!scenarioIssueTypes.has(issueType)) {
        context.addIssue({
          code: "custom",
          message: "Gate issue type is not enabled by the scenario",
          path: ["allowedGateIssueTypes", index],
        });
      }
    });

    const family = scenario.questionFamilies.find(
      ({ primaryTargetId }) => primaryTargetId === plan.primaryTarget.id,
    );
    if (family === undefined) {
      return;
    }

    if (plan.id !== family.id) {
      context.addIssue({
        code: "custom",
        message: "QuestionPlan id must match the selected question family",
        path: ["id"],
      });
    }

    const familyRequiredEvidence = new Set(
      family.requiredEvidence.map(({ evidenceKindId }) => evidenceKindId),
    );
    const familyOptionalEvidence = new Set(family.optionalEvidenceKindIds);
    plan.requiredEvidence.forEach(({ id }, index) => {
      if (!familyRequiredEvidence.has(id)) {
        context.addIssue({
          code: "custom",
          message: "requiredEvidence is not allowed for the selected question family",
          path: ["requiredEvidence", index, "id"],
        });
      }
    });
    if (plan.requiredEvidence.length !== familyRequiredEvidence.size) {
      context.addIssue({
        code: "custom",
        message: "requiredEvidence must include every requirement for the selected question family",
        path: ["requiredEvidence"],
      });
    }
    plan.optionalEvidence.forEach(({ id }, index) => {
      if (!familyOptionalEvidence.has(id)) {
        context.addIssue({
          code: "custom",
          message: "optionalEvidence is not allowed for the selected question family",
          path: ["optionalEvidence", index, "id"],
        });
      }
    });
    if (plan.optionalEvidence.length !== familyOptionalEvidence.size) {
      context.addIssue({
        code: "custom",
        message: "optionalEvidence must match the selected question family",
        path: ["optionalEvidence"],
      });
    }
    plan.allowedGateIssueTypes.forEach((issueType, index) => {
      if (!family.allowedGateIssueTypes.includes(issueType)) {
        context.addIssue({
          code: "custom",
          message: "Gate issue type is not allowed for the selected question family",
          path: ["allowedGateIssueTypes", index],
        });
      }
    });
    if (
      plan.allowedGateIssueTypes.length !== family.allowedGateIssueTypes.length
    ) {
      context.addIssue({
        code: "custom",
        message: "allowedGateIssueTypes must match the selected question family",
        path: ["allowedGateIssueTypes"],
      });
    }
  });
}

const semanticMetadata = {
  questionId: nonEmptyString,
  checkpointVersion: z.number().int().nonnegative(),
  confidence: z.number().finite(),
};

export const semanticCheckResultSchema = z.discriminatedUnion("decision", [
  z
    .object({
      ...semanticMetadata,
      decision: z.literal("CONTINUE"),
      issueType: z.null(),
    })
    .strict(),
  z
    .object({
      ...semanticMetadata,
      decision: z.literal("ISSUE_DETECTED"),
      issueType: gateIssueTypeSchema,
    })
    .strict(),
]);

export function createSemanticCheckResultSchema(
  questionId: string,
  checkpointVersion: number,
) {
  return semanticCheckResultSchema.superRefine((result, context) => {
    if (result.questionId !== questionId) {
      context.addIssue({
        code: "custom",
        message: "Semantic result questionId does not match the request",
        path: ["questionId"],
      });
    }

    if (result.checkpointVersion !== checkpointVersion) {
      context.addIssue({
        code: "custom",
        message: "Semantic result checkpointVersion does not match the request",
        path: ["checkpointVersion"],
      });
    }
  });
}
