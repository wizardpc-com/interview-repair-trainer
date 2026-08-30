import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import scenarioData from "../../protocols/scenarios/science-engineering-project-deep-dive.json";
import { parseScenarioPack } from "../../src/domain/interview/scenario";
import { GATE_ISSUE_TYPES } from "../../src/domain/semantic/contracts";

const scenario = parseScenarioPack(scenarioData);

describe("science and engineering project deep-dive scenario", () => {
  it("loads the only MVP scenario with its required fields", () => {
    const scenarioFiles = readdirSync(resolve("protocols/scenarios")).filter(
      (file) => file.endsWith(".json"),
    );

    expect(scenarioFiles).toEqual([
      "science-engineering-project-deep-dive.json",
    ]);
    expect(scenario.id).toBe("science-engineering-project-deep-dive");
    expect(scenario.title).not.toBe("");
    expect(scenario.description).not.toBe("");
    expect(scenario.questionFamilies.map(({ id }) => id)).toEqual([
      "problem-and-motivation",
      "personal-contribution",
      "technical-choice",
      "results-and-validation",
      "challenge-and-iteration",
      "limitations-and-boundaries",
    ]);
    expect(scenario.hints.planner.length).toBeGreaterThan(0);
    expect(scenario.hints.evaluator.length).toBeGreaterThan(0);
  });

  it("uses exactly the three supported MVP gate issue types", () => {
    expect(scenario.gateIssueTypes).toEqual(GATE_ISSUE_TYPES);

    for (const family of scenario.questionFamilies) {
      for (const issueType of family.allowedGateIssueTypes) {
        expect(GATE_ISSUE_TYPES).toContain(issueType);
      }
    }
  });

  it("gives every question family one supported target and traceable required evidence", () => {
    const targetIds = new Set(scenario.trainingTargets.map(({ id }) => id));
    const evidenceKindIds = new Set(scenario.evidenceKinds.map(({ id }) => id));

    for (const family of scenario.questionFamilies) {
      expect(family.surfaceQuestion).not.toBe("");
      expect(targetIds.has(family.primaryTargetId)).toBe(true);
      expect(family).not.toHaveProperty("primaryTargetIds");
      expect(family.requiredEvidence.length).toBeGreaterThan(0);

      const requiredIds = new Set(
        family.requiredEvidence.map(({ evidenceKindId, surfaceQuestionBasis }) => {
          expect(evidenceKindIds.has(evidenceKindId)).toBe(true);
          expect(surfaceQuestionBasis).not.toBe("");
          return evidenceKindId;
        }),
      );

      for (const optionalEvidenceKindId of family.optionalEvidenceKindIds) {
        expect(evidenceKindIds.has(optionalEvidenceKindId)).toBe(true);
        expect(requiredIds.has(optionalEvidenceKindId)).toBe(false);
      }
    }
  });

  it("rejects an unsupported training target", () => {
    const firstFamily = scenarioData.questionFamilies[0];
    const invalidScenario = {
      ...scenarioData,
      questionFamilies: [
        { ...firstFamily, primaryTargetId: "unsupported-target" },
        ...scenarioData.questionFamilies.slice(1),
      ],
    };

    expect(() => parseScenarioPack(invalidScenario)).toThrow(
      "references unsupported target",
    );
  });

  it("rejects an unsupported Gate issue type", () => {
    const invalidScenario = {
      ...scenarioData,
      gateIssueTypes: [...scenarioData.gateIssueTypes, "FACTUALLY_INCORRECT"],
    };

    expect(() => parseScenarioPack(invalidScenario)).toThrow(
      "contains unsupported issue type",
    );
  });

  it("rejects required evidence without a surface-question basis", () => {
    const firstFamily = scenarioData.questionFamilies[0];
    const invalidScenario = {
      ...scenarioData,
      questionFamilies: [
        {
          ...firstFamily,
          requiredEvidence: [
            {
              ...firstFamily.requiredEvidence[0],
              surfaceQuestionBasis: "",
            },
            ...firstFamily.requiredEvidence.slice(1),
          ],
        },
        ...scenarioData.questionFamilies.slice(1),
      ],
    };

    expect(() => parseScenarioPack(invalidScenario)).toThrow(
      "surfaceQuestionBasis must be a non-empty string",
    );
  });

  it("rejects evidence classified as both required and optional", () => {
    const firstFamily = scenarioData.questionFamilies[0];
    const invalidScenario = {
      ...scenarioData,
      questionFamilies: [
        {
          ...firstFamily,
          optionalEvidenceKindIds: [
            firstFamily.requiredEvidence[0].evidenceKindId,
          ],
        },
        ...scenarioData.questionFamilies.slice(1),
      ],
    };

    expect(() => parseScenarioPack(invalidScenario)).toThrow(
      "must separate required and optional evidence",
    );
  });
});

describe("core interview protocol", () => {
  it("contains the six MVP rule sections", () => {
    const protocol = readFileSync(
      resolve("protocols/core/interview-rules.md"),
      "utf8",
    );

    for (const heading of [
      "## Question alignment",
      "## Evidence requirement",
      "## Personal ownership",
      "## Uncertainty and boundary awareness",
      "## Repair policy",
      "## When not to interrupt",
    ]) {
      expect(protocol).toContain(heading);
    }
  });
});
