import { InterviewRuntimeError } from "../../../../../domain/interview/runtime";
import { answerActionRequestSchema } from "../../../../../lib/interview-api-contracts";
import { getInterviewApplication } from "../../../../../server/application";
import { InterviewSessionNotFoundError } from "../../../../../server/interview-runtime-service";

type AnswerRouteContext = Readonly<{
  params: Promise<Readonly<{ sessionId: string }>>;
}>;

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(
  request: Request,
  context: AnswerRouteContext,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "Request body must be valid JSON", 400);
  }

  const parsed = answerActionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("INVALID_REQUEST", "Answer action is invalid", 400);
  }

  const { sessionId } = await context.params;

  try {
    const runtimeService = getInterviewApplication().runtimeService;
    const runtime =
      parsed.data.action === "START"
        ? runtimeService.start(sessionId)
        : parsed.data.action === "UPDATE_TRANSCRIPT"
          ? runtimeService.updateTranscript(sessionId, parsed.data.transcript)
          : runtimeService.complete(sessionId);

    return Response.json({ runtime });
  } catch (error) {
    if (error instanceof InterviewSessionNotFoundError) {
      return errorResponse("SESSION_NOT_FOUND", error.message, 404);
    }
    if (error instanceof InterviewRuntimeError) {
      return errorResponse(error.code, error.message, 409);
    }
    return errorResponse(
      "RUNTIME_FAILED",
      "The answer action could not be completed.",
      500,
    );
  }
}
