import {
  DEFAULT_QWEN_BASE_URL,
  DEFAULT_QWEN_MODEL,
} from "../../src/server/llm-config";
import { QwenLlmService } from "../../src/services/llm/qwen-llm-service";

export type CapturedQwenAttempt = Readonly<{
  attempt: number;
  httpStatus: number | null;
  rawResponseBody: string | null;
  structuredOutput: string | null;
  transportErrorName: string | null;
}>;

type QwenEnvironment = Readonly<{
  apiKey: string;
  baseUrl: string;
  model: string;
}>;

function requireEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for the live Qwen Golden test`);
  }
  return value;
}

export function readQwenEnvironment(): QwenEnvironment {
  return {
    apiKey: requireEnvironmentValue("QWEN_API_KEY"),
    baseUrl: process.env.QWEN_BASE_URL?.trim() || DEFAULT_QWEN_BASE_URL,
    model: process.env.QWEN_MODEL?.trim() || DEFAULT_QWEN_MODEL,
  };
}

export function redactConfiguredApiKey(serializedReport: string): string {
  const apiKey = requireEnvironmentValue("QWEN_API_KEY");
  const redacted = serializedReport.replaceAll(apiKey, "[REDACTED_API_KEY]");
  if (redacted.includes(apiKey)) {
    throw new Error("Configured API key remained in a serialized Golden report");
  }
  return redacted;
}

function readStructuredOutput(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }

  const first = choices[0];
  if (typeof first !== "object" || first === null) {
    return null;
  }

  const message = (first as { message?: unknown }).message;
  if (typeof message !== "object" || message === null) {
    return null;
  }

  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : null;
}

export function createCapturingQwenService(
  attempts: CapturedQwenAttempt[],
): QwenLlmService {
  const environment = readQwenEnvironment();
  const fetcher: typeof fetch = async (input, init) => {
    let response: Response;
    try {
      response = await fetch(input, init);
    } catch (error) {
      attempts.push({
        attempt: attempts.length + 1,
        httpStatus: null,
        rawResponseBody: null,
        structuredOutput: null,
        transportErrorName:
          error instanceof Error ? error.name : "UnknownTransportError",
      });
      throw error;
    }

    let rawResponseBody: string | null = null;
    let structuredOutput: string | null = null;
    try {
      rawResponseBody = await response.clone().text();
      structuredOutput = readStructuredOutput(JSON.parse(rawResponseBody));
    } catch {
      // The provider response itself is validated by QwenLlmService.
    }
    attempts.push({
      attempt: attempts.length + 1,
      httpStatus: response.status,
      rawResponseBody,
      structuredOutput,
      transportErrorName: null,
    });
    return response;
  };

  return new QwenLlmService({
    ...environment,
    fetcher,
  });
}
