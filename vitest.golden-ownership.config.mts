import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["tests/golden/qwen-ownership-guard.live.ts"],
  },
});
