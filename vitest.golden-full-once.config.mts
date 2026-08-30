import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    env: {
      GOLDEN_QWEN_MODE: "full-once",
    },
    include: ["tests/golden/qwen-semantic-golden.live.ts"],
  },
});
