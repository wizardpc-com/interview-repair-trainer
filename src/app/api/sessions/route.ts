import scenarioData from "../../../../protocols/scenarios/science-engineering-project-deep-dive.json";
import { parseScenarioPack } from "../../../domain/interview/scenario";
import { createSessionRequestSchema } from "../../../lib/interview-api-contracts";
import { getInterviewApplication } from "../../../server/application";

const scenario = parseScenarioPack(scenarioData);

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "Request body must be valid JSON", 400);
  }

  const parsed = createSessionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "INVALID_REQUEST",
      "Project or research context is required and must be at most 10,000 characters",
      400,
    );
  }

  try {
    const application = getInterviewApplication();
    const result = await application.sessionService.create({
      projectContext: parsed.data.projectContext,
      scenario,
    });

    if (!result.ok) {
      console.error("Interview question planning failed", result.error.cause);
      return errorResponse(
        "PLANNING_FAILED",
        "The interview question could not be prepared. Please try again.",
        502,
      );
    }

    return Response.json(
      {
        session: result.session,
        runtime: application.runtimeService.getPublic(result.session.sessionId),
      },
      { status: 201 },
    );
  } catch {
    return errorResponse(
      "SERVICE_UNAVAILABLE",
      "The interview service is not configured or temporarily unavailable.",
      503,
    );
  }
}
