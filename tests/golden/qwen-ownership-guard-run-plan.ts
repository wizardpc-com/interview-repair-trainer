import type { GoldenCoreCaseId } from "../fixtures/golden-oracle";
import type { GoldenRunPhase } from "./qwen-semantic-run-plan";

export type OwnershipGuardRunSpec = Readonly<{
  caseId: GoldenCoreCaseId;
  phase: GoldenRunPhase;
  run: number;
}>;

const runCounts = [
  { caseId: "G07", phase: "P0_STABILITY", runs: 5 },
  { caseId: "G05", phase: "P0_STABILITY", runs: 3 },
  { caseId: "G06", phase: "P1_STABILITY", runs: 3 },
  { caseId: "G08", phase: "P1_STABILITY", runs: 3 },
] as const satisfies readonly Readonly<{
  caseId: GoldenCoreCaseId;
  phase: GoldenRunPhase;
  runs: number;
}>[];

export const ownershipGuardRunPlan = runCounts.flatMap(
  ({ caseId, phase, runs }) =>
    Array.from({ length: runs }, (_, index) => ({
      caseId,
      phase,
      run: index + 1,
    })),
) satisfies readonly OwnershipGuardRunSpec[];
