import { z } from "zod";
import type { LlmService } from "../services/llm/llm-service";
import { QwenLlmService } from "../services/llm/qwen-llm-service";

export const DEFAULT_QWEN_MODEL = "qwen-plus";
export const DEFAULT_QWEN_BASE_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1";

const llmEnvironmentSchema = z.object({
  QWEN_API_KEY: z.string().trim().min(1),
  QWEN_MODEL: z.string().trim().min(1).default(DEFAULT_QWEN_MODEL),
  QWEN_BASE_URL: z
    .string()
    .url()
    .default(DEFAULT_QWEN_BASE_URL),
});

export function createConfiguredLlmService(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): LlmService {
  const config = llmEnvironmentSchema.parse(environment);

  return new QwenLlmService({
    apiKey: config.QWEN_API_KEY,
    model: config.QWEN_MODEL,
    baseUrl: config.QWEN_BASE_URL,
  });
}
