import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import scenarioData from "../../protocols/scenarios/science-engineering-project-deep-dive.json";
import type { QuestionPlan } from "../../src/domain/interview/contracts";
import { parseScenarioPack } from "../../src/domain/interview/scenario";
import {
  answerActionRequestSchema,
  publicInterviewRuntimeSchema,
} from "../../src/lib/interview-api-contracts";
import { InterviewRuntimeService } from "../../src/server/interview-runtime-service";
import { InterviewSessionService } from "../../src/server/interview-session-service";
import { InMemoryInterviewSessionStore } from "../../src/server/session-store";
import type { LlmService } from "../../src/services/llm/llm-service";

const scenario = parseScenarioPack(scenarioData);
const plan: QuestionPlan = {
  id: "question-1",
  surfaceQuestion: "What did you personally contribute to this project?",
  primaryTarget: {
    id: "personal-ownership",
    description: "Separate the candidate's own contribution from team activity.",
  },
  requiredEvidence: [
    {
      id: "personal-action",
      description:
        "A specific action, decision, implementation, or analysis performed by the candidate.",
    },
  ],
  optionalEvidence: [
    {
      id: "team-context",
      description: "Context about collaborators or team responsibilities.",
    },
  ],
  allowedGateIssueTypes: [
    "NOT_ANSWERING_QUESTION",
    "OWNERSHIP_AMBIGUOUS",
  ],
};

function planningService(): LlmService {
  return {
    model: "fake-single-model",
    async generateQuestionPlan() {
      return { ok: true, value: plan };
    },
    async evaluateSemanticCheckpoint(input) {
      return {
        ok: true,
        value: {
          questionId: input.questionPlan.id,
          checkpointVersion: input.checkpointVersion,
          confidence: 0.95,
          gateability: "GATE_ELIGIBLE",
          answerBoundary: "NONE",
          decision: "CONTINUE",
          issueType: null,
          triggeringCriterion: null,
          issueExplanation: null,
          repairCue: null,
        },
      };
    },
  };
}

function TypeScriptFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return TypeScriptFiles(path);
    }
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("interview runtime service", () => {
  it("supports the public create, answer, checkpoint, and complete flow", async () => {
    let now = 1_000;
    const store = new InMemoryInterviewSessionStore({
      ttlMs: 60_000,
      now: () => now,
      idFactory: () => "session-1",
    });
    const sessionService = new InterviewSessionService(planningService(), store);
    const runtimeService = new InterviewRuntimeService(store, planningService(), {
      now: () => now,
      checkpointHeuristic: {
        minTranscriptCharacters: 10,
        minAnswerDurationMs: 1_000,
        minCheckpointIntervalMs: 2_000,
      },
    });

    const created = await sessionService.create({
      projectContext: "I built the experiment harness and analyzed its results.",
      scenario,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    expect(runtimeService.getPublic(created.session.sessionId)).toMatchObject({
      state: "QUESTION_READY",
      answerVersion: 0,
      checkpointVersion: 0,
      transcript: "",
    });
    expect(runtimeService.start(created.session.sessionId).state).toBe("ANSWERING");

    now = 2_100;
    const updated = runtimeService.updateTranscript(
      created.session.sessionId,
      "I personally designed and implemented the experiment harness.",
    );
    expect(updated).toMatchObject({
      state: "ANSWERING",
      answerVersion: 1,
      checkpointVersion: 1,
    });
    expect(updated.checkpoint?.freshness).toBe("CURRENT");
    expect(updated.checkpoint?.kind).toBe("INTERIM");

    const done = await runtimeService.complete(created.session.sessionId);
    expect(done).toMatchObject({
      state: "QUESTION_DONE",
      transcript: "I personally designed and implemented the experiment harness.",
      answerVersion: 1,
      checkpointVersion: 2,
    });
    expect(done.checkpoint?.freshness).toBe("STALE");
    expect(done.checkpoint?.kind).toBe("FINAL");
  });

  it("keeps FINAL out of the transcript update contract", () => {
    expect(
      answerActionRequestSchema.parse({
        action: "UPDATE_TRANSCRIPT",
        transcript: "stable speech snapshot",
      }),
    ).toEqual({
      action: "UPDATE_TRANSCRIPT",
      transcript: "stable speech snapshot",
    });
    expect(
      answerActionRequestSchema.safeParse({
        action: "UPDATE_TRANSCRIPT",
        transcript: "completed answer snapshot",
        checkpointKind: "FINAL",
      }).success,
    ).toBe(false);
  });

  it("never changes the frozen server-side QuestionPlan during runtime updates", async () => {
    const store = new InMemoryInterviewSessionStore({
      ttlMs: 60_000,
      idFactory: () => "session-frozen-plan",
    });
    const sessionService = new InterviewSessionService(planningService(), store);
    const runtimeService = new InterviewRuntimeService(store, planningService(), {
      now: () => 2_000,
    });
    await sessionService.create({
      projectContext: "A research context with enough detail.",
      scenario,
    });

    const storedPlan = store.get("session-frozen-plan")?.questionPlans[0];
    runtimeService.start("session-frozen-plan");
    runtimeService.updateTranscript("session-frozen-plan", "My answer.");
    await runtimeService.complete("session-frozen-plan");

    expect(store.get("session-frozen-plan")?.questionPlans[0]).toBe(storedPlan);
    expect(storedPlan).toEqual(plan);
    expect(Object.isFrozen(storedPlan)).toBe(true);
  });

  it("does not expose private planning fields through the public runtime DTO", async () => {
    const store = new InMemoryInterviewSessionStore({
      ttlMs: 60_000,
      idFactory: () => "session-public-runtime",
    });
    const sessionService = new InterviewSessionService(planningService(), store);
    const runtimeService = new InterviewRuntimeService(store, planningService());
    await sessionService.create({
      projectContext: "A private project context.",
      scenario,
    });

    const publicRuntime = runtimeService.getPublic("session-public-runtime");
    const serialized = JSON.stringify(publicRuntime);

    expect(Object.keys(publicRuntime)).toEqual([
      "sessionId",
      "runtimeRevision",
      "question",
      "state",
      "transcript",
      "answerVersion",
      "checkpointVersion",
      "checkpoint",
      "hardGate",
    ]);
    expect(serialized).not.toContain("primaryTarget");
    expect(serialized).not.toContain("requiredEvidence");
    expect(serialized).not.toContain("optionalEvidence");
    expect(serialized).not.toContain("allowedGateIssueTypes");
    expect(serialized).not.toContain("A private project context.");
    expect(
      publicInterviewRuntimeSchema.safeParse({
        ...publicRuntime,
        primaryTarget: plan.primaryTarget,
      }).success,
    ).toBe(false);
  });

  it("keeps runtime domain source independent from providers, services, and UI", () => {
    const domainSource = TypeScriptFiles(resolve("src/domain"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(domainSource).not.toMatch(/services[\\/]/i);
    expect(domainSource).not.toMatch(/components[\\/]/i);
    expect(domainSource).not.toMatch(/from\s+["'](?:react|next|openai|qwen)/i);
  });
});
