export function createHealthResponse() {
  return {
    status: "ok",
    service: "interview-repair-trainer",
  } as const;
}
