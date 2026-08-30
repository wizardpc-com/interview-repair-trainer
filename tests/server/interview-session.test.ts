import { describe, expect, it } from "vitest";
import scenarioData from "../../protocols/scenarios/science-engineering-project-deep-dive.json";
import type { QuestionPlan } from "../../src/domain/interview/contracts";
import { parseScenarioPack } from "../../src/domain/interview/scenario";
import { InterviewSessionService } from "../../src/server/interview-session-service";
import { InMemoryInterviewSessionStore } from "../../src/server/session-store";
import type {
  LlmResult,
  LlmService,
} from "../../src/services/llm/llm-service";

const scenario = parseScenarioPack(scenarioData);
const projectContext =
  "Built and evaluated a small autonomous navigation prototype.";

function makeQuestionPlan(
  id = "question-1",
  surfaceQuestion = "What problem were you trying to solve, and why did it matter?",
): QuestionPlan {
  return {
    id,
    surfaceQuestion,
    primaryTarget: {
      id: "problem-framing",
      description: "Explain the concrete problem, motivation, and scope.",
    },
    requiredEvidence: [
      {
        id: "problem-context",
        description: "A concrete description of the problem or research question.",
      },
      {
        id: "motivation-or-stakes",
        description: "Why the problem mattered within the stated project scope.",
      },
    ],
    optionalEvidence: [
      {
        id: "technical-detail",
        description: "A technical detail that clarifies the work.",
      },
    ],
    allowedGateIssueTypes: [
      "NOT_ANSWERING_QUESTION",
      "VAGUE_WITHOUT_EVIDENCE",
    ],
  };
}

function fakeLlmService(
  planningResults: readonly LlmResult<readonly QuestionPlan[]>[],
): LlmService {
  const queuedResults = [...planningResults];

  return {
    model: "fake-single-model",
    async generateInterviewPlan() {
      const result = queuedResults.shift();
      if (result === undefined) {
        throw new Error("No fake planning result queued");
      }
      return result;
    },
    async generateQuestionPlan() {
      throw new Error("Session creation must generate the complete interview plan");
    },
    async evaluateSemanticCheckpoint() {
      throw new Error("Session creation must not evaluate checkpoints");
    },
  };
}

function makeInterviewPlan(prefix = ""): readonly QuestionPlan[] {
  return [
    makeQuestionPlan(`${prefix}question-1`, "Question one?"),
    makeQuestionPlan(`${prefix}question-2`, "Question two?"),
    makeQuestionPlan(`${prefix}question-3`, "Question three?"),
  ];
}

function sequentialIdFactory(...ids: readonly string[]): () => string {
  const queuedIds = [...ids];
  return () => {
    const id = queuedIds.shift();
    if (id === undefined) {
      throw new Error("No fake session id queued");
    }
    return id;
  };
}

describe("hidden in-memory interview sessions", () => {
  it("creates a session through LlmService and reads public and server records", async () => {
    const store = new InMemoryInterviewSessionStore({
      ttlMs: 60_000,
      now: () => 1_000,
      idFactory: () => "session-1",
    });
    const service = new InterviewSessionService(
      fakeLlmService([{ ok: true, value: makeInterviewPlan() }]),
      store,
    );

    const result = await service.create({ projectContext, scenario });

    expect(result).toEqual({
      ok: true,
      session: {
        sessionId: "session-1",
        questions: [
          {
            questionId: "question-1",
            surfaceQuestion: "Question one?",
          },
          {
            questionId: "question-2",
            surfaceQuestion: "Question two?",
          },
          {
            questionId: "question-3",
            surfaceQuestion: "Question three?",
          },
        ],
      },
    });
    expect(service.getPublic("session-1")).toEqual(
      result.ok ? result.session : null,
    );

    const serverSession = store.get("session-1");
    expect(serverSession?.projectContext).toBe(projectContext);
    expect(serverSession?.questionPlans[0]?.primaryTarget.id).toBe(
      "problem-framing",
    );
  });

  it("copies and deeply freezes a QuestionPlan when the session is created", () => {
    const sourcePlans = makeInterviewPlan();
    const store = new InMemoryInterviewSessionStore({
      ttlMs: 60_000,
      idFactory: () => "session-frozen",
    });

    const session = store.create({
      projectContext,
      scenario: { id: scenario.id, version: scenario.version },
      questionPlans: sourcePlans,
    });
    const mutableSource = sourcePlans[0] as unknown as {
      primaryTarget: { description: string };
      requiredEvidence: Array<{ id: string; description: string }>;
    };
    mutableSource.primaryTarget.description = "changed after storage";
    mutableSource.requiredEvidence.push({
      id: "late-evidence",
      description: "Must not enter the frozen plan.",
    });

    const storedPlan = session.questionPlans[0];
    expect(storedPlan.primaryTarget.description).toBe(
      "Explain the concrete problem, motivation, and scope.",
    );
    expect(storedPlan.requiredEvidence).toHaveLength(2);
    expect(Object.isFrozen(session)).toBe(true);
    expect(Object.isFrozen(session.questionPlans)).toBe(true);
    expect(session.questionPlans).toHaveLength(3);
    expect(new Set(session.questionPlans.map(({ id }) => id)).size).toBe(3);
    expect(Object.isFrozen(storedPlan)).toBe(true);
    expect(Object.isFrozen(storedPlan.primaryTarget)).toBe(true);
    expect(Object.isFrozen(storedPlan.requiredEvidence)).toBe(true);
    expect(Object.isFrozen(storedPlan.requiredEvidence[0])).toBe(true);
  });

  it("exposes only the public question fields and no hidden plan content", async () => {
    const store = new InMemoryInterviewSessionStore({
      ttlMs: 60_000,
      idFactory: () => "session-public",
    });
    const service = new InterviewSessionService(
      fakeLlmService([{ ok: true, value: makeInterviewPlan() }]),
      store,
    );

    const result = await service.create({ projectContext, scenario });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.session.questions).toHaveLength(3);
    result.session.questions.forEach((question) => {
      expect(Object.keys(question)).toEqual(["questionId", "surfaceQuestion"]);
    });
    const serialized = JSON.stringify(result.session);
    expect(serialized).not.toContain("primaryTarget");
    expect(serialized).not.toContain("requiredEvidence");
    expect(serialized).not.toContain("optionalEvidence");
    expect(serialized).not.toContain("allowedGateIssueTypes");
    expect(serialized).not.toContain("planner");
    expect(serialized).not.toContain("evaluator");
    expect(serialized).not.toContain(projectContext);
  });

  it("rejects expired sessions and removes them lazily", () => {
    let now = 5_000;
    const store = new InMemoryInterviewSessionStore({
      ttlMs: 1_000,
      now: () => now,
      idFactory: () => "session-expiring",
    });
    store.create({
      projectContext,
      scenario: { id: scenario.id, version: scenario.version },
      questionPlans: [makeQuestionPlan()],
    });

    now = 5_999;
    expect(store.get("session-expiring")).not.toBeNull();
    now = 6_000;
    expect(store.get("session-expiring")).toBeNull();
    expect(store.size).toBe(0);
    expect(store.get("missing-session")).toBeNull();
  });

  it("returns a planning failure without writing a partial session", async () => {
    let allocatedIds = 0;
    const store = new InMemoryInterviewSessionStore({
      ttlMs: 60_000,
      idFactory: () => {
        allocatedIds += 1;
        return "must-not-be-created";
      },
    });
    const service = new InterviewSessionService(
      fakeLlmService([
        {
          ok: false,
          error: {
            code: "INVALID_STRUCTURED_OUTPUT",
            message: "Planning output remained invalid after retry",
            attempts: 2,
          },
        },
      ]),
      store,
    );

    await expect(service.create({ projectContext, scenario })).resolves.toEqual({
      ok: false,
      error: {
        code: "PLANNING_FAILED",
        cause: {
          code: "INVALID_STRUCTURED_OUTPUT",
          message: "Planning output remained invalid after retry",
          attempts: 2,
        },
      },
    });
    expect(store.size).toBe(0);
    expect(allocatedIds).toBe(0);
  });

  it("rejects a repeated question family before creating a session", async () => {
    const store = new InMemoryInterviewSessionStore({
      ttlMs: 60_000,
      idFactory: () => "must-not-be-created",
    });
    const repeated = makeQuestionPlan("repeated-family", "Repeated question?");
    const service = new InterviewSessionService(
      fakeLlmService([
        {
          ok: true,
          value: [
            repeated,
            repeated,
            makeQuestionPlan("third-family", "Third question?"),
          ],
        },
      ]),
      store,
    );

    await expect(service.create({ projectContext, scenario })).resolves.toMatchObject({
      ok: false,
      error: {
        code: "PLANNING_FAILED",
        cause: { code: "INVALID_STRUCTURED_OUTPUT" },
      },
    });
    expect(store.size).toBe(0);
  });

  it("keeps multiple sessions isolated", async () => {
    const firstPlan = makeInterviewPlan("a-");
    const secondPlan = makeInterviewPlan("b-");
    const store = new InMemoryInterviewSessionStore({
      ttlMs: 60_000,
      idFactory: sequentialIdFactory("session-a", "session-b"),
    });
    const service = new InterviewSessionService(
      fakeLlmService([
        { ok: true, value: firstPlan },
        { ok: true, value: secondPlan },
      ]),
      store,
    );

    const first = await service.create({
      projectContext: "Project A context",
      scenario,
    });
    const second = await service.create({
      projectContext: "Project B context",
      scenario,
    });

    expect(first.ok && first.session.sessionId).toBe("session-a");
    expect(second.ok && second.session.sessionId).toBe("session-b");
    expect(store.get("session-a")?.projectContext).toBe("Project A context");
    expect(store.get("session-b")?.projectContext).toBe("Project B context");
    expect(store.get("session-a")?.questionPlans[0]?.id).toBe("a-question-1");
    expect(store.get("session-b")?.questionPlans[0]?.id).toBe("b-question-1");
    expect(store.size).toBe(2);
  });
});
