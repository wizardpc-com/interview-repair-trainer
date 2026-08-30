import type { InterviewScenarioPack } from "../domain/interview/scenario";
import type {
  LlmService,
  LlmServiceError,
} from "../services/llm/llm-service";
import {
  toPublicInterviewSession,
  type InMemoryInterviewSessionStore,
  type PublicInterviewSessionDto,
} from "./session-store";

export type CreateInterviewSessionInput = Readonly<{
  projectContext: string;
  scenario: InterviewScenarioPack;
}>;

export type CreateInterviewSessionResult =
  | Readonly<{
      ok: true;
      session: PublicInterviewSessionDto;
    }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: "PLANNING_FAILED";
        cause: LlmServiceError;
      }>;
    }>;

export class InterviewSessionService {
  constructor(
    private readonly llmService: LlmService,
    private readonly sessionStore: InMemoryInterviewSessionStore,
  ) {}

  async create(
    input: CreateInterviewSessionInput,
  ): Promise<CreateInterviewSessionResult> {
    const planningResult = await this.llmService.generateQuestionPlan({
      projectContext: input.projectContext,
      scenario: input.scenario,
    });

    if (!planningResult.ok) {
      return {
        ok: false,
        error: {
          code: "PLANNING_FAILED",
          cause: planningResult.error,
        },
      };
    }

    const session = this.sessionStore.create({
      projectContext: input.projectContext,
      scenario: {
        id: input.scenario.id,
        version: input.scenario.version,
      },
      questionPlans: [planningResult.value],
    });

    return {
      ok: true,
      session: toPublicInterviewSession(session),
    };
  }

  getPublic(sessionId: string): PublicInterviewSessionDto | null {
    const session = this.sessionStore.get(sessionId);
    return session === null ? null : toPublicInterviewSession(session);
  }
}
