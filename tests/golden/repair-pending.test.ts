import { describe, expect, it } from "vitest";
import {
  GOLDEN_REPAIR_CASE_IDS,
  GOLDEN_REPAIR_CASES,
  GOLDEN_SYSTEM_CASES,
} from "../fixtures/golden-oracle";

describe("Stage 9 Golden coverage registry", () => {
  it("keeps R01-R06 registered for the executable repair loop suite", () => {
    expect(GOLDEN_REPAIR_CASES.map(({ id }) => id)).toEqual(
      GOLDEN_REPAIR_CASE_IDS,
    );
  });

  it("keeps S06 registered as the frozen-plan Repair safety case", () => {
    expect(GOLDEN_SYSTEM_CASES.find(({ id }) => id === "S06")).toMatchObject({
      expectedDisposition: "PRESERVE_FROZEN_QUESTION_PLAN",
    });
  });
});
