import { describe, expect, it } from "vitest";
import { createHealthResponse } from "../src/server/health";

describe("createHealthResponse", () => {
  it("returns the stable health payload", () => {
    expect(createHealthResponse()).toEqual({
      status: "ok",
      service: "interview-repair-trainer",
    });
  });
});
