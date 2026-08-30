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
    return errorResponse("INVALID_REQUEST", "请求内容必须是有效的 JSON。", 400);
  }

  const parsed = answerActionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("INVALID_REQUEST", "回答操作无效。", 400);
  }

  const { sessionId } = await context.params;

  try {
    const runtimeService = getInterviewApplication().runtimeService;
    let runtime;
    switch (parsed.data.action) {
      case "START":
        runtime = runtimeService.start(sessionId);
        break;
      case "UPDATE_TRANSCRIPT":
        runtime = runtimeService.updateTranscript(
          sessionId,
          parsed.data.transcript,
        );
        break;
      case "EVALUATE_CHECKPOINT":
        runtime = await runtimeService.evaluateCheckpoint(sessionId, {
          questionId: parsed.data.questionId,
          answerVersion: parsed.data.answerVersion,
          checkpointVersion: parsed.data.checkpointVersion,
        });
        break;
      case "OVERRIDE_GATE":
        runtime = runtimeService.overrideGate(sessionId);
        break;
      case "PREPARE_REANSWER":
        runtime = runtimeService.prepareReanswer(sessionId);
        break;
      case "COMPLETE":
        runtime = runtimeService.complete(sessionId);
        break;
    }

    return Response.json({ runtime });
  } catch (error) {
    if (error instanceof InterviewSessionNotFoundError) {
      return errorResponse("SESSION_NOT_FOUND", "训练不存在或已过期。", 404);
    }
    if (error instanceof InterviewRuntimeError) {
      const message =
        error.code === "EMPTY_ANSWER"
          ? "回答不能为空。"
          : error.code === "INVALID_RUNTIME"
            ? "训练状态无效，请重新创建训练。"
            : "当前状态下不能执行此操作。";
      return errorResponse(error.code, message, 409);
    }
    return errorResponse(
      "RUNTIME_FAILED",
      "暂时无法完成回答操作。",
      500,
    );
  }
}
