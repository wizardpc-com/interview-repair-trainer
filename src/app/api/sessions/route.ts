import { createSessionRequestSchema } from "../../../lib/interview-api-contracts";
import { getInterviewApplication } from "../../../server/application";
import { phaseOneScenario } from "../../../server/phase-one-scenario";

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "请求内容必须是有效的 JSON。", 400);
  }

  const parsed = createSessionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "INVALID_REQUEST",
      "项目或科研经历不能为空，且不能超过 10,000 个字符。",
      400,
    );
  }

  try {
    const application = getInterviewApplication();
    const result = await application.sessionService.create({
      projectContext: parsed.data.projectContext,
      scenario: phaseOneScenario,
    });

    if (!result.ok) {
      console.error("Interview question planning failed", result.error.cause);
      return errorResponse(
        "PLANNING_FAILED",
        "暂时无法生成面试问题，请重试。",
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
      "训练服务尚未配置或暂时不可用。",
      503,
    );
  }
}
