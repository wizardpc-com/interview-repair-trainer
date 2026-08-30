import { createHealthResponse } from "@/server/health";

export function GET() {
  return Response.json(createHealthResponse());
}
