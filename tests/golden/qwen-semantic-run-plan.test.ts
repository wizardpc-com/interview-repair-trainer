import { describe, expect, it } from "vitest";
import {
  goldenSemanticCases,
  p0FalseGateCaseIds,
  p1ClearGateCaseIds,
} from "../fixtures/golden-oracle";
import {
  buildSemanticGoldenRunPlan,
  focusedRegressionCaseIds,
  minimumStabilityRunsPerCase,
  readGoldenQwenMode,
  type GoldenRunSpec,
} from "./qwen-semantic-run-plan";

function countRuns(
  plan: readonly GoldenRunSpec[],
  caseId: GoldenRunSpec["caseId"],
  phase?: GoldenRunSpec["phase"],
): number {
  return plan.filter(
    (run) => run.caseId === caseId && (phase === undefined || run.phase === phase),
  ).length;
}

describe("Qwen Semantic Golden run plan", () => {
  it("focuses first pass on the five regression sentinels", () => {
    const plan = buildSemanticGoldenRunPlan("focus");
    const firstPassIds = plan
      .filter(({ phase }) => phase === "FIRST_PASS")
      .map(({ caseId }) => caseId);

    expect(firstPassIds).toEqual(focusedRegressionCaseIds);
  });

  it("gives every focus, P0, and P1 case at least three stability runs", () => {
    const plan = buildSemanticGoldenRunPlan("focus");
    const stabilityPlan = plan.filter(({ phase }) => phase !== "FIRST_PASS");

    for (const caseId of focusedRegressionCaseIds) {
      expect(countRuns(stabilityPlan, caseId)).toBeGreaterThanOrEqual(
        minimumStabilityRunsPerCase,
      );
    }
    for (const caseId of p0FalseGateCaseIds) {
      expect(countRuns(plan, caseId, "P0_STABILITY")).toBe(
        minimumStabilityRunsPerCase,
      );
    }
    for (const caseId of p1ClearGateCaseIds) {
      expect(countRuns(plan, caseId, "P1_STABILITY")).toBe(
        minimumStabilityRunsPerCase,
      );
    }
  });

  it("supports a full G01-G20 first pass with the same release groups", () => {
    const plan = buildSemanticGoldenRunPlan("full");
    const firstPassIds = plan
      .filter(({ phase }) => phase === "FIRST_PASS")
      .map(({ caseId }) => caseId);

    expect(firstPassIds).toEqual(goldenSemanticCases.map(({ id }) => id));
    expect(plan.some(({ phase }) => phase === "FOCUS_STABILITY")).toBe(false);
    expect(
      plan.filter(({ phase }) => phase === "P0_STABILITY"),
    ).toHaveLength(p0FalseGateCaseIds.length * minimumStabilityRunsPerCase);
    expect(
      plan.filter(({ phase }) => phase === "P1_STABILITY"),
    ).toHaveLength(p1ClearGateCaseIds.length * minimumStabilityRunsPerCase);
  });

  it("supports a gated G01-G20 full-once pass without stability repeats", () => {
    const plan = buildSemanticGoldenRunPlan("full-once");

    expect(plan).toHaveLength(goldenSemanticCases.length);
    expect(plan.map(({ caseId }) => caseId)).toEqual(
      goldenSemanticCases.map(({ id }) => id),
    );
    expect(plan.every(({ phase, run }) => phase === "FIRST_PASS" && run === 1)).toBe(
      true,
    );
  });

  it("rejects weakened stability and unknown modes", () => {
    expect(() => buildSemanticGoldenRunPlan("focus", 2)).toThrow(
      "at least 3 runs",
    );
    expect(readGoldenQwenMode(undefined)).toBe("full");
    expect(readGoldenQwenMode("focus")).toBe("focus");
    expect(readGoldenQwenMode("full-once")).toBe("full-once");
    expect(() => readGoldenQwenMode("sample")).toThrow(
      "Unsupported GOLDEN_QWEN_MODE",
    );
  });

  it("does not duplicate a phase/case/run identity", () => {
    for (const mode of ["focus", "full-once", "full"] as const) {
      const plan = buildSemanticGoldenRunPlan(mode);
      const identities = plan.map(
        ({ phase, caseId, run }) => `${phase}/${caseId}/${run}`,
      );
      expect(new Set(identities).size).toBe(identities.length);
    }
  });
});
