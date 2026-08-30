import type { TrainingTarget } from "./contracts";
import {
  GATE_ISSUE_TYPES,
  type GateIssueType,
} from "../semantic/contracts";

export type ScenarioEvidenceKind = Readonly<{
  id: string;
  description: string;
  honestNoMeasurementSatisfies: boolean;
}>;

export type ScenarioRequiredEvidence = Readonly<{
  evidenceKindId: string;
  surfaceQuestionBasis: string;
}>;

export type ScenarioQuestionFamily = Readonly<{
  id: string;
  surfaceQuestion: string;
  primaryTargetId: string;
  requiredEvidence: readonly ScenarioRequiredEvidence[];
  optionalEvidenceKindIds: readonly string[];
  allowedGateIssueTypes: readonly GateIssueType[];
}>;

export type InterviewScenarioPack = Readonly<{
  id: string;
  version: number;
  title: string;
  description: string;
  trainingTargets: readonly TrainingTarget[];
  evidenceKinds: readonly ScenarioEvidenceKind[];
  gateIssueTypes: readonly GateIssueType[];
  questionFamilies: readonly ScenarioQuestionFamily[];
  hints: Readonly<{
    planner: readonly string[];
    evaluator: readonly string[];
  }>;
}>;

type UnknownRecord = Record<string, unknown>;

function readRecord(value: unknown, label: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as UnknownRecord;
}

function readString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value;
}

function readBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }

  return value;
}

function readArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }

  return value;
}

function requireItems<T>(items: readonly T[], label: string): readonly T[] {
  if (items.length === 0) {
    throw new Error(`${label} must not be empty`);
  }

  return items;
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must not contain duplicates`);
  }
}

function readDefinition(value: unknown, label: string): TrainingTarget {
  const record = readRecord(value, label);

  return {
    id: readString(record.id, `${label}.id`),
    description: readString(record.description, `${label}.description`),
  };
}

function readEvidenceKind(
  value: unknown,
  label: string,
): ScenarioEvidenceKind {
  const record = readRecord(value, label);

  return {
    id: readString(record.id, `${label}.id`),
    description: readString(record.description, `${label}.description`),
    honestNoMeasurementSatisfies: readBoolean(
      record.honestNoMeasurementSatisfies,
      `${label}.honestNoMeasurementSatisfies`,
    ),
  };
}

function readStringArray(value: unknown, label: string): readonly string[] {
  const values = readArray(value, label).map((item, index) =>
    readString(item, `${label}[${index}]`),
  );
  assertUnique(values, label);
  return values;
}

function isGateIssueType(value: string): value is GateIssueType {
  return GATE_ISSUE_TYPES.some((issueType) => issueType === value);
}

function readGateIssueTypes(
  value: unknown,
  label: string,
): readonly GateIssueType[] {
  const values = readStringArray(value, label);
  const issueTypes: GateIssueType[] = [];

  for (const issueType of values) {
    if (!isGateIssueType(issueType)) {
      throw new Error(`${label} contains unsupported issue type: ${issueType}`);
    }

    issueTypes.push(issueType);
  }

  return issueTypes;
}

function readRequiredEvidence(
  value: unknown,
  label: string,
): ScenarioRequiredEvidence {
  const record = readRecord(value, label);

  return {
    evidenceKindId: readString(
      record.evidenceKindId,
      `${label}.evidenceKindId`,
    ),
    surfaceQuestionBasis: readString(
      record.surfaceQuestionBasis,
      `${label}.surfaceQuestionBasis`,
    ),
  };
}

function readQuestionFamily(
  value: unknown,
  label: string,
): ScenarioQuestionFamily {
  const record = readRecord(value, label);
  const requiredEvidence = requireItems(
    readArray(record.requiredEvidence, `${label}.requiredEvidence`).map(
      (item, index) =>
        readRequiredEvidence(item, `${label}.requiredEvidence[${index}]`),
    ),
    `${label}.requiredEvidence`,
  );

  return {
    id: readString(record.id, `${label}.id`),
    surfaceQuestion: readString(
      record.surfaceQuestion,
      `${label}.surfaceQuestion`,
    ),
    primaryTargetId: readString(
      record.primaryTargetId,
      `${label}.primaryTargetId`,
    ),
    requiredEvidence,
    optionalEvidenceKindIds: readStringArray(
      record.optionalEvidenceKindIds,
      `${label}.optionalEvidenceKindIds`,
    ),
    allowedGateIssueTypes: requireItems(
      readGateIssueTypes(
        record.allowedGateIssueTypes,
        `${label}.allowedGateIssueTypes`,
      ),
      `${label}.allowedGateIssueTypes`,
    ),
  };
}

function assertFamilyReferences(
  family: ScenarioQuestionFamily,
  targetIds: ReadonlySet<string>,
  evidenceKindIds: ReadonlySet<string>,
  scenarioIssueTypes: ReadonlySet<GateIssueType>,
): void {
  const label = `questionFamilies.${family.id}`;

  if (!targetIds.has(family.primaryTargetId)) {
    throw new Error(
      `${label}.primaryTargetId references unsupported target: ${family.primaryTargetId}`,
    );
  }

  const requiredIds = family.requiredEvidence.map(
    ({ evidenceKindId }) => evidenceKindId,
  );
  assertUnique(requiredIds, `${label}.requiredEvidence`);

  for (const evidenceKindId of [
    ...requiredIds,
    ...family.optionalEvidenceKindIds,
  ]) {
    if (!evidenceKindIds.has(evidenceKindId)) {
      throw new Error(
        `${label} references unsupported evidence kind: ${evidenceKindId}`,
      );
    }
  }

  const requiredIdSet = new Set(requiredIds);
  if (
    family.optionalEvidenceKindIds.some((evidenceKindId) =>
      requiredIdSet.has(evidenceKindId),
    )
  ) {
    throw new Error(`${label} must separate required and optional evidence`);
  }

  for (const issueType of family.allowedGateIssueTypes) {
    if (!scenarioIssueTypes.has(issueType)) {
      throw new Error(`${label} uses issue type not enabled by the scenario`);
    }
  }
}

export function parseScenarioPack(input: unknown): InterviewScenarioPack {
  const record = readRecord(input, "scenario");
  const version = record.version;
  if (
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    throw new Error("scenario.version must be a positive integer");
  }

  const trainingTargets = requireItems(
    readArray(record.trainingTargets, "scenario.trainingTargets").map(
      (item, index) =>
        readDefinition(item, `scenario.trainingTargets[${index}]`),
    ),
    "scenario.trainingTargets",
  );
  const evidenceKinds = requireItems(
    readArray(record.evidenceKinds, "scenario.evidenceKinds").map((item, index) =>
      readEvidenceKind(item, `scenario.evidenceKinds[${index}]`),
    ),
    "scenario.evidenceKinds",
  );
  const gateIssueTypes = readGateIssueTypes(
    record.gateIssueTypes,
    "scenario.gateIssueTypes",
  );
  const questionFamilies = requireItems(
    readArray(record.questionFamilies, "scenario.questionFamilies").map(
      (item, index) =>
        readQuestionFamily(item, `scenario.questionFamilies[${index}]`),
    ),
    "scenario.questionFamilies",
  );
  const hintsRecord = readRecord(record.hints, "scenario.hints");
  const hints = {
    planner: requireItems(
      readStringArray(hintsRecord.planner, "scenario.hints.planner"),
      "scenario.hints.planner",
    ),
    evaluator: requireItems(
      readStringArray(hintsRecord.evaluator, "scenario.hints.evaluator"),
      "scenario.hints.evaluator",
    ),
  };

  assertUnique(
    trainingTargets.map(({ id }) => id),
    "scenario.trainingTargets",
  );
  assertUnique(
    evidenceKinds.map(({ id }) => id),
    "scenario.evidenceKinds",
  );
  assertUnique(
    questionFamilies.map(({ id }) => id),
    "scenario.questionFamilies",
  );

  if (
    gateIssueTypes.length !== GATE_ISSUE_TYPES.length ||
    GATE_ISSUE_TYPES.some((issueType) => !gateIssueTypes.includes(issueType))
  ) {
    throw new Error("scenario.gateIssueTypes must contain exactly the MVP issue types");
  }

  const targetIds = new Set(trainingTargets.map(({ id }) => id));
  const evidenceKindIds = new Set(evidenceKinds.map(({ id }) => id));
  const scenarioIssueTypes = new Set(gateIssueTypes);
  for (const family of questionFamilies) {
    assertFamilyReferences(
      family,
      targetIds,
      evidenceKindIds,
      scenarioIssueTypes,
    );
  }

  return {
    id: readString(record.id, "scenario.id"),
    version,
    title: readString(record.title, "scenario.title"),
    description: readString(record.description, "scenario.description"),
    trainingTargets,
    evidenceKinds,
    gateIssueTypes,
    questionFamilies,
    hints,
  };
}
