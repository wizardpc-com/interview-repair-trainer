import { describe, expect, it } from "vitest";
import { ownershipGuardRunPlan } from "./qwen-ownership-guard-run-plan";

describe("Qwen ownership guard focused run plan", () => {
  it("contains exactly the authorized 14 semantic evaluator calls", () => {
    expect(ownershipGuardRunPlan).toEqual([
      ...Array.from({ length: 5 }, (_, index) => ({
        caseId: "G07",
        phase: "P0_STABILITY",
        run: index + 1,
      })),
      ...Array.from({ length: 3 }, (_, index) => ({
        caseId: "G05",
        phase: "P0_STABILITY",
        run: index + 1,
      })),
      ...Array.from({ length: 3 }, (_, index) => ({
        caseId: "G06",
        phase: "P1_STABILITY",
        run: index + 1,
      })),
      ...Array.from({ length: 3 }, (_, index) => ({
        caseId: "G08",
        phase: "P1_STABILITY",
        run: index + 1,
      })),
    ]);
    expect(ownershipGuardRunPlan).toHaveLength(14);
  });
});
