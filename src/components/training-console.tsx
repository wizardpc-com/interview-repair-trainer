"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  answerActionResponseSchema,
  apiErrorResponseSchema,
  createSessionResponseSchema,
  type AnswerActionRequest,
  type PublicInterviewRuntimeDto,
} from "../lib/interview-api-contracts";
import {
  appendStableTranscript,
  BrowserSttAdapter,
  type BrowserSttError,
} from "../services/stt/browser-stt";

const STATE_LABELS: Record<PublicInterviewRuntimeDto["state"], string> = {
  QUESTION_READY: "待回答",
  ANSWERING: "回答中",
  REPAIR: "需要重答",
  REANSWER: "重答中",
  QUESTION_DONE: "本题完成",
};

type InputMode = "voice" | "text";
type MicrophoneStatus = "idle" | "requesting" | "listening" | "fallback";

async function readApiResponse(response: Response): Promise<unknown> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("这次请求没有完成，请重试。");
  }

  if (!response.ok) {
    const error = apiErrorResponseSchema.safeParse(body);
    throw new Error(
      error.success ? error.data.error.message : "这次请求没有完成，请重试。",
    );
  }

  return body;
}

async function postAnswerAction(
  sessionId: string,
  action: AnswerActionRequest,
): Promise<PublicInterviewRuntimeDto> {
  const response = await fetch(`/api/sessions/${sessionId}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
  const parsed = answerActionResponseSchema.parse(await readApiResponse(response));
  return parsed.runtime;
}

function runtimeIsAtLeastAsCurrent(
  candidate: PublicInterviewRuntimeDto,
  current: PublicInterviewRuntimeDto,
): boolean {
  const stateRank: Record<PublicInterviewRuntimeDto["state"], number> = {
    QUESTION_READY: 0,
    ANSWERING: 1,
    REPAIR: 2,
    REANSWER: 3,
    QUESTION_DONE: 4,
  };

  if (candidate.question.index !== current.question.index) {
    return candidate.question.index > current.question.index;
  }

  return (
    candidate.answerVersion > current.answerVersion ||
    (candidate.answerVersion === current.answerVersion &&
      (candidate.checkpointVersion > current.checkpointVersion ||
        (candidate.checkpointVersion === current.checkpointVersion &&
          stateRank[candidate.state] >= stateRank[current.state])))
  );
}

function MicrophoneGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="size-10"
      fill="none"
      viewBox="0 0 48 48"
    >
      <rect
        height="24"
        rx="9"
        stroke="currentColor"
        strokeWidth="2.4"
        width="14"
        x="17"
        y="7"
      />
      <path
        d="M11.5 24.5C11.5 31.4 17.1 37 24 37s12.5-5.6 12.5-12.5M24 37v6m-7 0h14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}

function VoiceVisualizer({
  amplitude,
  status,
}: Readonly<{
  amplitude: number;
  status: MicrophoneStatus;
}>) {
  const activeAmplitude = status === "listening" ? amplitude : 0;
  const ringStyle = (strength: number): CSSProperties => ({
    opacity: 0.1 + activeAmplitude * 0.28 * strength,
    transform: `scale(${1 + activeAmplitude * 0.34 * strength})`,
  });

  return (
    <div
      aria-label={
        status === "requesting" ? "正在请求麦克风权限" : "麦克风正在收音"
      }
      className="relative grid size-48 place-items-center sm:size-56"
      data-amplitude={activeAmplitude.toFixed(3)}
      data-testid="microphone-visualizer"
      role="img"
    >
      <div
        className="absolute inset-3 rounded-full border border-[#8ebaa5]/35 bg-[#8ebaa5]/5 transition-[transform,opacity] duration-100 ease-linear"
        style={ringStyle(1)}
      />
      <div
        className="absolute inset-8 rounded-full border border-[#9fd0b9]/40 bg-[#9fd0b9]/5 transition-[transform,opacity] duration-100 ease-linear"
        style={ringStyle(0.72)}
      />
      <div
        className="relative grid size-28 place-items-center rounded-full border border-white/12 bg-[#f3f0e9] text-[#17382c] shadow-[0_18px_55px_rgba(0,0,0,0.22)] transition-transform duration-100 ease-linear sm:size-32"
        style={{ transform: `scale(${1 + activeAmplitude * 0.08})` }}
      >
        <MicrophoneGlyph />
      </div>
      <div className="absolute bottom-1 flex h-8 items-end gap-1.5" aria-hidden="true">
        {[0.58, 0.82, 1, 0.76, 0.5].map((weight, index) => (
          <span
            className="w-1 rounded-full bg-[#a8d7c0] transition-[height,opacity] duration-75 ease-linear"
            key={weight}
            style={{
              height: `${5 + activeAmplitude * 22 * weight}px`,
              opacity: 0.35 + activeAmplitude * (0.55 - index * 0.035),
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function TrainingConsole() {
  const [projectContext, setProjectContext] = useState("");
  const [runtime, setRuntime] = useState<PublicInterviewRuntimeDto | null>(null);
  const [stableTranscript, setStableTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("voice");
  const [microphoneStatus, setMicrophoneStatus] =
    useState<MicrophoneStatus>("idle");
  const [amplitude, setAmplitude] = useState(0);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const runtimeRef = useRef<PublicInterviewRuntimeDto | null>(null);
  const stableTranscriptRef = useRef("");
  const sttAdapterRef = useRef<BrowserSttAdapter | null>(null);
  const transcriptEndRef = useRef<HTMLSpanElement | null>(null);
  const textFallbackRef = useRef<HTMLTextAreaElement | null>(null);

  const applyRuntime = useCallback((candidate: PublicInterviewRuntimeDto) => {
    setRuntime((current) => {
      const next =
        current === null || runtimeIsAtLeastAsCurrent(candidate, current)
          ? candidate
          : current;
      runtimeRef.current = next;
      return next;
    });
  }, []);

  const persistTranscript = useCallback(
    async (transcript: string) => {
      const currentRuntime = runtimeRef.current;
      if (currentRuntime === null || currentRuntime.state !== "ANSWERING") {
        return;
      }

      const sessionId = currentRuntime.sessionId;
      const pendingSave = saveChainRef.current.then(async () => {
        setIsSaving(true);
        try {
          const nextRuntime = await postAnswerAction(sessionId, {
            action: "UPDATE_TRANSCRIPT",
            transcript,
          });
          applyRuntime(nextRuntime);
        } finally {
          setIsSaving(false);
        }
      });
      saveChainRef.current = pendingSave.catch(() => undefined);
      return pendingSave;
    },
    [applyRuntime],
  );

  const stopVoiceCapture = useCallback(async () => {
    const adapter = sttAdapterRef.current;
    sttAdapterRef.current = null;
    if (adapter !== null) {
      await adapter.stop();
    }
    setAmplitude(0);
    setInterimTranscript("");
    setMicrophoneStatus("idle");
  }, []);

  const switchToTextFallback = useCallback(
    async (message = "已切换到文本输入，回答仍会自动保存。") => {
      await stopVoiceCapture();
      setInputMode("text");
      setMicrophoneStatus("fallback");
      setVoiceNotice(message);
    },
    [stopVoiceCapture],
  );

  const startVoiceCapture = useCallback(async () => {
    setInputMode("voice");
    setMicrophoneStatus("requesting");
    setVoiceNotice("请在浏览器提示中允许麦克风权限。");

    const adapter = new BrowserSttAdapter({
      onInterim: setInterimTranscript,
      onFinal: (segment) => {
        const next = appendStableTranscript(stableTranscriptRef.current, segment);
        if (next === stableTranscriptRef.current) {
          return;
        }
        stableTranscriptRef.current = next;
        setStableTranscript(next);
        setInterimTranscript("");
        void persistTranscript(next).catch((cause: unknown) => {
          setError(
            cause instanceof Error
              ? cause.message
              : "暂时没能保存回答。你的内容还在，请重试。",
          );
        });
      },
      onAmplitude: setAmplitude,
      onError: (sttError: BrowserSttError) => {
        void switchToTextFallback(sttError.message);
      },
    });
    sttAdapterRef.current = adapter;

    try {
      await adapter.start();
      if (sttAdapterRef.current !== adapter) {
        await adapter.stop();
        return;
      }
      setMicrophoneStatus("listening");
      setVoiceNotice(null);
    } catch (cause) {
      if (sttAdapterRef.current === adapter) {
        sttAdapterRef.current = null;
      }
      await adapter.stop();
      const message =
        cause instanceof Error
          ? cause.message
          : "无法启动语音输入，请切换到文本输入。";
      setInputMode("text");
      setMicrophoneStatus("fallback");
      setVoiceNotice(message);
    }
  }, [persistTranscript, switchToTextFallback]);

  useEffect(() => {
    if (
      runtime?.state !== "ANSWERING" ||
      inputMode !== "text" ||
      isPending
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void persistTranscript(stableTranscript).catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "暂时没能保存回答。你的内容还在，请重试。",
        );
      });
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [inputMode, isPending, persistTranscript, runtime?.state, stableTranscript]);

  useEffect(() => {
    if (runtime?.state !== "ANSWERING" || isPending) {
      return;
    }

    const interval = window.setInterval(() => {
      const currentRuntime = runtimeRef.current;
      const transcript = stableTranscriptRef.current;
      if (transcript.trim().length === 0) {
        return;
      }
      if (
        currentRuntime?.checkpoint?.freshness === "CURRENT" &&
        transcript === currentRuntime.transcript
      ) {
        return;
      }
      void persistTranscript(transcript).catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "暂时没能保存回答。你的内容还在，请重试。",
        );
      });
    }, 2_000);

    return () => window.clearInterval(interval);
  }, [isPending, persistTranscript, runtime?.state]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [interimTranscript, stableTranscript]);

  useEffect(() => {
    if (runtime?.state === "ANSWERING" && inputMode === "text") {
      textFallbackRef.current?.focus();
    }
  }, [inputMode, runtime?.state]);

  useEffect(() => {
    if (runtime?.state !== "ANSWERING") {
      void stopVoiceCapture();
    }
  }, [runtime?.state, stopVoiceCapture]);

  useEffect(
    () => () => {
      void sttAdapterRef.current?.stop();
      sttAdapterRef.current = null;
    },
    [],
  );

  async function createSession() {
    setIsPending(true);
    setError(null);

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectContext }),
      });
      const result = createSessionResponseSchema.parse(
        await readApiResponse(response),
      );
      applyRuntime(result.runtime);
      stableTranscriptRef.current = result.runtime.transcript;
      setStableTranscript(result.runtime.transcript);
      setInterimTranscript("");
      setInputMode("voice");
      setMicrophoneStatus("idle");
      setVoiceNotice(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "暂时无法准备面试问题，请重试。",
      );
    } finally {
      setIsPending(false);
    }
  }

  async function start() {
    if (runtime === null) {
      return;
    }
    setIsPending(true);
    setError(null);
    setVoiceNotice(null);
    try {
      const started = await postAnswerAction(runtime.sessionId, {
        action: "START",
      });
      applyRuntime(started);
      stableTranscriptRef.current = started.transcript;
      setStableTranscript(started.transcript);
      await startVoiceCapture();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "这次请求没有完成，请重试。",
      );
    } finally {
      setIsPending(false);
    }
  }

  async function complete() {
    if (runtime === null) {
      return;
    }
    setIsPending(true);
    setError(null);
    try {
      await stopVoiceCapture();
      await persistTranscript(stableTranscriptRef.current);
      await saveChainRef.current;
      const completed = await postAnswerAction(runtime.sessionId, {
        action: "COMPLETE",
      });
      applyRuntime(completed);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "这次请求没有完成，请重试。",
      );
    } finally {
      setIsPending(false);
    }
  }

  function updateFallbackTranscript(transcript: string) {
    stableTranscriptRef.current = transcript;
    setStableTranscript(transcript);
  }

  function reset() {
    void stopVoiceCapture();
    setRuntime(null);
    runtimeRef.current = null;
    setProjectContext("");
    stableTranscriptRef.current = "";
    setStableTranscript("");
    setInterimTranscript("");
    setInputMode("voice");
    setMicrophoneStatus("idle");
    setVoiceNotice(null);
    setError(null);
  }

  if (runtime === null) {
    return (
      <main className="min-h-screen bg-[#f3f0e9] text-[#15201d]">
        <header className="border-b border-[#15201d]/10 px-6 py-5 sm:px-10">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <p className="text-sm font-semibold tracking-[-0.01em]">
              面试修复训练器
            </p>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#66716c]">
              语音训练台
            </p>
          </div>
        </header>

        <section className="mx-auto grid min-h-[calc(100vh-69px)] max-w-6xl items-center gap-12 px-6 py-14 lg:grid-cols-[0.82fr_1.18fr] lg:px-10">
          <div>
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-[#bf5b3d]">
              项目经历深挖训练
            </p>
            <h1 className="max-w-xl text-4xl font-semibold leading-[1.08] tracking-[-0.04em] sm:text-6xl">
              把项目经历，练成一段清楚的回答。
            </h1>
            <p className="mt-7 max-w-lg text-base leading-7 text-[#5e6964] sm:text-lg">
              输入项目经历，生成一道面试问题，再使用麦克风作答。回答内容会实时转写并自动保存。
            </p>
          </div>

          <div className="rounded-[28px] border border-[#15201d]/10 bg-[#fffdf8] p-6 shadow-[0_24px_70px_rgba(28,38,33,0.08)] sm:p-9">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7b8580]">
                  训练设置
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">
                  第一步：提供项目背景
                </h2>
              </div>
              <span className="grid size-9 place-items-center rounded-full bg-[#dce6df] text-sm font-semibold text-[#274537]">
                01
              </span>
            </div>

            <label
              className="text-sm font-semibold text-[#33413b]"
              htmlFor="project-context"
            >
              项目 / 科研经历
            </label>
            <textarea
              id="project-context"
              className="mt-3 min-h-48 w-full resize-y rounded-2xl border border-[#15201d]/15 bg-white px-4 py-4 text-[15px] leading-7 outline-none transition placeholder:text-[#9da5a1] focus:border-[#315c49] focus:ring-4 focus:ring-[#315c49]/10"
              value={projectContext}
              onChange={(event) => setProjectContext(event.target.value)}
              placeholder="例如：我在课程项目中负责一个室内导航原型，重点处理传感器噪声与路径规划……"
              maxLength={10_000}
              disabled={isPending}
            />
            <div className="mt-3 flex items-center justify-between text-xs text-[#7b8580]">
              <span>只需提供足以展开追问的背景</span>
              <span>{projectContext.length} / 10,000</span>
            </div>

            {error !== null && (
              <p
                className="mt-5 rounded-xl border border-[#c96b51]/25 bg-[#fff3ef] px-4 py-3 text-sm text-[#9f422c]"
                role="alert"
              >
                {error}
              </p>
            )}

            <button
              className="mt-7 flex w-full items-center justify-center rounded-xl bg-[#1e3c30] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#152f25] disabled:cursor-not-allowed disabled:opacity-45"
              type="button"
              onClick={() => void createSession()}
              disabled={projectContext.trim().length === 0 || isPending}
            >
              {isPending ? "正在生成问题…" : "生成面试问题"}
            </button>
          </div>
        </section>
      </main>
    );
  }

  const isReady = runtime.state === "QUESTION_READY";
  const isAnswering = runtime.state === "ANSWERING";
  const isDone = runtime.state === "QUESTION_DONE";
  const displayedTranscript = stableTranscript.trim();

  return (
    <main
      className="relative min-h-dvh overflow-x-hidden bg-[#0d251e] text-[#f8f5ed]"
      data-runtime-state={runtime.state}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(77,132,105,0.18),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.025),transparent_30%)]"
      />

      <header className="relative z-10 border-b border-white/8 px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6">
          <div>
            <p className="text-sm font-semibold tracking-[-0.01em]">
              面试训练
            </p>
            <p className="mt-0.5 text-xs text-[#9eb1a8]">
              第 {runtime.question.index} 题 / 共 {runtime.question.total} 题
            </p>
          </div>
          <div className="flex items-center gap-2.5 text-xs text-[#b5c4bd]">
            <span
              className={`size-1.5 rounded-full ${
                isAnswering ? "bg-[#8ed0ae]" : "bg-[#d2a177]"
              }`}
            />
            <span>{STATE_LABELS[runtime.state]}</span>
          </div>
        </div>
      </header>

      <section className="relative z-10 mx-auto flex min-h-[calc(100dvh-69px)] max-w-7xl flex-col items-center px-5 pb-6 pt-8 sm:px-8 sm:pb-8 lg:pt-10">
        <div
          className={`question-enter flex w-full flex-col items-center text-center transition-all duration-500 ${
            isReady ? "my-auto max-w-5xl" : "max-w-4xl"
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#9ab9aa]">
            本题问题
          </p>
          <h1
            className={`mt-5 text-balance font-medium leading-[1.16] tracking-[-0.04em] transition-all duration-500 ${
              isReady
                ? "text-4xl sm:text-6xl lg:text-7xl"
                : "text-2xl sm:text-3xl lg:text-4xl"
            }`}
          >
            {runtime.question.surfaceQuestion}
          </h1>
        </div>

        {isReady && (
          <div className="mb-auto mt-12 flex flex-col items-center">
            <button
              className="rounded-full bg-[#f2eee4] px-10 py-4 text-base font-semibold text-[#16382b] shadow-[0_18px_55px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-[#b9ddca] disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              onClick={() => void start()}
              disabled={isPending}
            >
              {isPending ? "正在进入回答…" : "开始回答"}
            </button>
            <p className="mt-5 text-sm text-[#9eb1a8]">
              点击后才会请求麦克风权限，建议使用最新版 Chrome
            </p>
            {error !== null && (
              <p
                className="mt-5 rounded-xl border border-[#d58b73]/25 bg-[#48271f]/50 px-4 py-3 text-sm text-[#f1b9a7]"
                role="alert"
              >
                {error}
              </p>
            )}
          </div>
        )}

        {isAnswering && (
          <div className="mt-5 flex w-full max-w-5xl flex-1 flex-col items-center">
            <div className="flex min-h-64 flex-col items-center justify-center sm:min-h-72">
              {inputMode === "voice" ? (
                <>
                  <VoiceVisualizer amplitude={amplitude} status={microphoneStatus} />
                  <p className="mt-4 text-sm text-[#b5c6bd]" aria-live="polite">
                    {microphoneStatus === "requesting"
                      ? "正在等待麦克风权限…"
                      : "麦克风已连接，请自然作答"}
                  </p>
                  <button
                    className="mt-3 text-xs text-[#8fa69a] underline decoration-white/20 underline-offset-4 transition hover:text-white"
                    type="button"
                    onClick={() => void switchToTextFallback()}
                  >
                    切换到文本输入
                  </button>
                </>
              ) : (
                <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-white/[0.055] p-5 sm:p-7">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold">文本备用模式</p>
                      <p className="mt-1 text-xs leading-5 text-[#9eb1a8]">
                        {voiceNotice ?? "语音输入不可用，回答仍会自动保存。"}
                      </p>
                    </div>
                    <button
                      className="rounded-full border border-white/12 px-4 py-2 text-xs text-[#c3d0ca] transition hover:bg-white/8 hover:text-white"
                      type="button"
                      onClick={() => void startVoiceCapture()}
                    >
                      重新尝试麦克风
                    </button>
                  </div>
                  <label className="sr-only" htmlFor="text-fallback-answer">
                    文本回答
                  </label>
                  <textarea
                    id="text-fallback-answer"
                    ref={textFallbackRef}
                    className="mt-5 min-h-36 w-full resize-y rounded-2xl border border-white/10 bg-[#091c16]/65 px-4 py-4 text-base leading-7 text-white outline-none placeholder:text-[#71877c] focus:border-[#8dbba5] focus:ring-4 focus:ring-[#8dbba5]/10"
                    value={stableTranscript}
                    onChange={(event) =>
                      updateFallbackTranscript(event.target.value)
                    }
                    placeholder="在这里输入你的回答……"
                    maxLength={20_000}
                    disabled={isPending}
                  />
                </div>
              )}
            </div>

            <section
              aria-label="实时转写"
              className="mt-2 w-full max-w-4xl rounded-3xl border border-white/8 bg-black/10 px-5 py-5 sm:px-7"
            >
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs font-semibold tracking-[0.14em] text-[#a8bbb1]">
                  实时转写
                </p>
                <p className="text-[11px] text-[#7f958a]" aria-live="polite">
                  {isSaving ? "正在保存…" : "稳定内容已自动保存"}
                </p>
              </div>
              <div
                className="mt-3 max-h-36 min-h-20 overflow-y-auto pr-2 text-sm leading-7 text-[#d7e0db] sm:text-base"
                role="log"
                aria-live="polite"
              >
                {displayedTranscript.length === 0 && interimTranscript.length === 0 ? (
                  <span className="text-[#70867b]">开始说话后，转写内容会显示在这里。</span>
                ) : (
                  <>
                    <span>{stableTranscript}</span>
                    {interimTranscript.length > 0 && (
                      <span className="text-[#8ba096]">{interimTranscript}</span>
                    )}
                  </>
                )}
                <span ref={transcriptEndRef} />
              </div>
            </section>

            {error !== null && (
              <p
                className="mt-4 rounded-xl border border-[#d58b73]/25 bg-[#48271f]/50 px-4 py-3 text-sm text-[#f1b9a7]"
                role="alert"
              >
                {error}
              </p>
            )}

            <div className="mt-auto flex w-full max-w-4xl justify-end pt-6">
              <button
                className="rounded-full border border-white/15 px-6 py-2.5 text-sm text-[#c7d4ce] transition hover:border-white/30 hover:bg-white/7 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                type="button"
                onClick={() => void complete()}
                disabled={isPending || stableTranscript.trim().length === 0}
              >
                {isPending && microphoneStatus !== "requesting"
                  ? "正在结束…"
                  : "结束回答"}
              </button>
            </div>
          </div>
        )}

        {isDone && (
          <div className="my-auto flex w-full max-w-4xl flex-col items-center text-center">
            <div className="grid size-16 place-items-center rounded-full border border-[#a7ceb9]/35 bg-[#a7ceb9]/10 text-2xl text-[#b8ddca]">
              ✓
            </div>
            <h2 className="mt-6 text-3xl font-medium tracking-[-0.03em]">
              本题回答已完成
            </h2>
            <p className="mt-3 text-sm text-[#9eb1a8]">
              本题回答已保存。
            </p>
            <section className="mt-8 max-h-52 w-full overflow-y-auto rounded-3xl border border-white/8 bg-black/10 px-6 py-5 text-left text-sm leading-7 text-[#cbd7d1]">
              {stableTranscript}
            </section>
            <button
              className="mt-8 rounded-full bg-[#f2eee4] px-8 py-3 text-sm font-semibold text-[#16382b] transition hover:bg-white"
              type="button"
              onClick={reset}
            >
              开始新的训练
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
