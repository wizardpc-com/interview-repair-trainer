import { describe, it } from "vitest";
import {
  GOLDEN_REPAIR_CASES,
  GOLDEN_SYSTEM_CASES,
} from "../fixtures/golden-oracle";

describe("Stage 9 repair Golden cases", () => {
  for (const fixture of GOLDEN_REPAIR_CASES) {
    it.todo(`${fixture.id} — ${fixture.title}`);
  }

  const frozenPlanRepairCase = GOLDEN_SYSTEM_CASES.find(
    ({ id }) => id === "S06",
  );
  if (frozenPlanRepairCase !== undefined) {
    it.todo(`${frozenPlanRepairCase.id} — ${frozenPlanRepairCase.condition}`);
  }
});
