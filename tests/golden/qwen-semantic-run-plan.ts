import {
  goldenSemanticCases,
  p0FalseGateCaseIds,
  p1ClearGateCaseIds,
  type GoldenCoreCase,
} from "../fixtures/golden-oracle";

export type GoldenQwenMode = "focus" | "full-once" | "full";

export type GoldenRunPhase =
  | "FIRST_PASS"
  | "FOCUS_STABILITY"
  | "P0_STABILITY"
  | "P1_STABILITY";

export type GoldenRunSpec = Readonly<{
  caseId: GoldenCoreCase["id"];
  phase: GoldenRunPhase;
  run: number;
}>;

export const focusedRegressionCaseIds = [
  "G07",
  "G08",
  "G11",
  "G12",
  "G19",
] as const satisfies readonly GoldenCoreCase["id"][];

export const minimumStabilityRunsPerCase = 3;

export function readGoldenQwenMode(value: string | undefined): GoldenQwenMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === undefined || normalized === "" || normalized === "full") {
    return "full";
  }
  if (normalized === "focus") {
    return "focus";
  }
  if (normalized === "full-once") {
    return "full-once";
  }
  throw new Error(`Unsupported GOLDEN_QWEN_MODE: ${value}`);
}

function repetitions(
  caseIds: readonly GoldenCoreCase["id"][],
  phase: GoldenRunPhase,
  runsPerCase: number,
): GoldenRunSpec[] {
  return caseIds.flatMap((caseId) =>
    Array.from({ length: runsPerCase }, (_, index) => ({
      caseId,
      phase,
      run: index + 1,
    })),
  );
}

export function buildSemanticGoldenRunPlan(
  mode: GoldenQwenMode,
  runsPerCase = minimumStabilityRunsPerCase,
): readonly GoldenRunSpec[] {
  if (
    !Number.isInteger(runsPerCase) ||
    runsPerCase < minimumStabilityRunsPerCase
  ) {
    throw new Error(
      `Golden stability requires at least ${minimumStabilityRunsPerCase} runs per case`,
    );
  }

  const firstPassCaseIds =
    mode === "focus"
      ? focusedRegressionCaseIds
      : goldenSemanticCases.map(({ id }) => id);
  const releaseCaseIds = new Set<GoldenCoreCase["id"]>([
    ...p0FalseGateCaseIds,
    ...p1ClearGateCaseIds,
  ]);
  const focusOnlyStabilityCaseIds =
    mode === "focus"
      ? focusedRegressionCaseIds.filter((caseId) => !releaseCaseIds.has(caseId))
      : [];
  const includesReleaseStability = mode !== "full-once";

  return [
    ...firstPassCaseIds.map((caseId) => ({
      caseId,
      phase: "FIRST_PASS" as const,
      run: 1,
    })),
    ...repetitions(
      focusOnlyStabilityCaseIds,
      "FOCUS_STABILITY",
      runsPerCase,
    ),
    ...(includesReleaseStability
      ? repetitions(p0FalseGateCaseIds, "P0_STABILITY", runsPerCase)
      : []),
    ...(includesReleaseStability
      ? repetitions(p1ClearGateCaseIds, "P1_STABILITY", runsPerCase)
      : []),
  ];
}
