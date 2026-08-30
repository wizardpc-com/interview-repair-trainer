import { InterviewRuntimeService } from "./interview-runtime-service";
import { InterviewSessionService } from "./interview-session-service";
import { createConfiguredLlmService } from "./llm-config";
import { InMemoryInterviewSessionStore } from "./session-store";

const SESSION_TTL_MS = 60 * 60 * 1_000;

export type InterviewApplication = Readonly<{
  sessionService: InterviewSessionService;
  runtimeService: InterviewRuntimeService;
}>;

function createApplication(): InterviewApplication {
  const sessionStore = new InMemoryInterviewSessionStore({
    ttlMs: SESSION_TTL_MS,
  });

  return Object.freeze({
    sessionService: new InterviewSessionService(
      createConfiguredLlmService(),
      sessionStore,
    ),
    runtimeService: new InterviewRuntimeService(sessionStore),
  });
}

const applicationGlobal = globalThis as typeof globalThis & {
  interviewRepairApplication?: InterviewApplication;
};

export function getInterviewApplication(): InterviewApplication {
  applicationGlobal.interviewRepairApplication ??= createApplication();
  return applicationGlobal.interviewRepairApplication;
}
