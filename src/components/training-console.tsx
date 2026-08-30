"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  answerActionResponseSchema,
  apiErrorResponseSchema,
  createSessionResponseSchema,
  type AnswerActionRequest,
  type PublicInterviewRuntimeDto,
} from "../lib/interview-api-contracts";

const STATE_LABELS: Record<PublicInterviewRuntimeDto["state"], string> = {
  QUESTION_READY: "READY",
  ANSWERING: "ANSWERING",
  REPAIR: "REPAIR",
  REANSWER: "REANSWER",
  QUESTION_DONE: "COMPLETED",
};

async function readApiResponse(response: Response): Promise<unknown> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("服务返回了无法读取的响应，请稍后重试。");
  }

  if (!response.ok) {
    const error = apiErrorResponseSchema.safeParse(body);
    throw new Error(
      error.success ? error.data.error.message : "请求未能完成，请稍后重试。",
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

export function TrainingConsole() {
  const [projectContext, setProjectContext] = useState("");
  const [runtime, setRuntime] = useState<PublicInterviewRuntimeDto | null>(null);
  const [draft, setDraft] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const runtimeRef = useRef<PublicInterviewRuntimeDto | null>(null);

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

  useEffect(() => {
    if (runtime?.state !== "ANSWERING" || isPending) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void persistTranscript(draft).catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "回答保存失败。");
      });
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [draft, isPending, persistTranscript, runtime?.state]);

  useEffect(() => {
    if (runtime?.state !== "ANSWERING" || isPending) {
      return;
    }

    const interval = window.setInterval(() => {
      const currentRuntime = runtimeRef.current;
      if (
        currentRuntime?.checkpoint?.freshness === "CURRENT" &&
        draft === currentRuntime.transcript
      ) {
        return;
      }
      void persistTranscript(draft).catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "回答保存失败。");
      });
    }, 2_000);

    return () => window.clearInterval(interval);
  }, [draft, isPending, persistTranscript, runtime?.state]);

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
      setDraft(result.runtime.transcript);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "训练 Session 创建失败。",
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
    try {
      applyRuntime(
        await postAnswerAction(runtime.sessionId, { action: "START" }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法开始回答。");
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
      await persistTranscript(draft);
      const completed = await postAnswerAction(runtime.sessionId, {
        action: "COMPLETE",
      });
      applyRuntime(completed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法完成回答。");
    } finally {
      setIsPending(false);
    }
  }

  function reset() {
    setRuntime(null);
    runtimeRef.current = null;
    setProjectContext("");
    setDraft("");
    setError(null);
  }

  if (runtime === null) {
    return (
      <main className="min-h-screen bg-[#f3f0e9] text-[#15201d]">
        <header className="border-b border-[#15201d]/10 px-6 py-5 sm:px-10">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <p className="text-sm font-semibold tracking-[-0.01em]">
              Interview Repair Trainer
            </p>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#66716c]">
              Text-first console
            </p>
          </div>
        </header>

        <section className="mx-auto grid min-h-[calc(100vh-69px)] max-w-6xl items-center gap-12 px-6 py-14 lg:grid-cols-[0.82fr_1.18fr] lg:px-10">
          <div>
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-[#bf5b3d]">
              Project deep-dive practice
            </p>
            <h1 className="max-w-xl text-4xl font-semibold leading-[1.08] tracking-[-0.04em] sm:text-6xl">
              把项目经历，练成一段清楚的回答。
            </h1>
            <p className="mt-7 max-w-lg text-base leading-7 text-[#5e6964] sm:text-lg">
              输入一段真实的项目或科研背景。系统会为本次训练准备一个问题，回答过程中保持专注，不提前展示评分。
            </p>
          </div>

          <div className="rounded-[28px] border border-[#15201d]/10 bg-[#fffdf8] p-6 shadow-[0_24px_70px_rgba(28,38,33,0.08)] sm:p-9">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7b8580]">
                  Setup
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">
                  创建训练 Session
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
              {isPending ? "正在准备问题…" : "创建训练 Session"}
            </button>
          </div>
        </section>
      </main>
    );
  }

  const isAnswering = runtime.state === "ANSWERING";
  const isDone = runtime.state === "QUESTION_DONE";

  return (
    <main className="min-h-screen bg-[#eef0ec] text-[#13201b]">
      <header className="border-b border-[#13201b]/10 bg-[#f7f7f3]/90 px-5 py-4 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6">
          <div>
            <p className="text-sm font-semibold">Interview Training Console</p>
            <p className="mt-0.5 text-xs text-[#728079]">
              Question {runtime.question.index} of {runtime.question.total}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`size-2 rounded-full ${
                isAnswering ? "bg-[#3d8765]" : isDone ? "bg-[#718079]" : "bg-[#d38a51]"
              }`}
            />
            <span className="text-xs font-semibold tracking-[0.14em] text-[#53615b]">
              {STATE_LABELS[runtime.state]}
            </span>
          </div>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-73px)] max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8 lg:py-8">
        <aside className="flex flex-col rounded-[26px] bg-[#17382c] p-6 text-white sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#a9c3b7]">
            Interview prompt
          </p>
          <h1 className="mt-8 text-3xl font-medium leading-[1.22] tracking-[-0.035em] sm:text-4xl lg:text-[2.7rem]">
            {runtime.question.surfaceQuestion}
          </h1>
          <div className="mt-auto pt-12">
            <div className="h-px bg-white/15" />
            <p className="mt-5 max-w-sm text-sm leading-6 text-[#bdd0c7]">
              {isAnswering
                ? "回答期间不会出现评分或打断。完成后，本题即被封存。"
                : isDone
                  ? "回答已完成，本题内容已封存。"
                  : "准备好后开始回答，计时与文本快照会从此刻启动。"}
            </p>
          </div>
        </aside>

        <section className="flex min-h-[620px] flex-col rounded-[26px] border border-[#13201b]/10 bg-[#fffefa] p-5 shadow-[0_18px_55px_rgba(31,45,38,0.06)] sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7b8781]">
                Your answer
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em]">
                文本回答区
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#78847e]" aria-live="polite">
              <span className="rounded-full bg-[#edf1ed] px-3 py-1.5">
                Answer v{runtime.answerVersion}
              </span>
              <span className="rounded-full bg-[#edf1ed] px-3 py-1.5">
                Checkpoint v{runtime.checkpointVersion}
              </span>
            </div>
          </div>

          <textarea
            className="mt-7 min-h-[360px] flex-1 resize-none rounded-2xl border border-[#13201b]/12 bg-[#fbfcf9] px-5 py-5 text-base leading-8 outline-none transition placeholder:text-[#a0aaa5] focus:border-[#315c49] focus:bg-white focus:ring-4 focus:ring-[#315c49]/10 disabled:cursor-not-allowed disabled:bg-[#f4f5f1] sm:text-lg"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              isAnswering
                ? "从问题本身开始，像真实面试一样组织你的回答……"
                : "点击“开始回答”后在这里输入。"
            }
            disabled={!isAnswering || isPending}
            maxLength={20_000}
            aria-label="文本回答"
          />

          <div className="mt-4 flex min-h-6 items-center justify-between text-xs text-[#7b8781]">
            <span aria-live="polite">
              {isSaving ? "正在同步 transcript…" : isAnswering ? "Transcript 已自动同步" : ""}
            </span>
            <span>{draft.length} / 20,000</span>
          </div>

          {error !== null && (
            <p
              className="mt-4 rounded-xl border border-[#c96b51]/25 bg-[#fff3ef] px-4 py-3 text-sm text-[#9f422c]"
              role="alert"
            >
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[#13201b]/10 pt-6">
            <p className="text-xs leading-5 text-[#7b8781]">
              {runtime.checkpoint === null
                ? "尚未生成 checkpoint"
                : `最近快照：v${runtime.checkpoint.checkpointVersion} · ${
                    runtime.checkpoint.freshness === "CURRENT" ? "当前" : "已封存"
                  }`}
            </p>

            {runtime.state === "QUESTION_READY" && (
              <button
                className="rounded-xl bg-[#1e3c30] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#152f25] disabled:cursor-not-allowed disabled:opacity-45"
                type="button"
                onClick={() => void start()}
                disabled={isPending}
              >
                {isPending ? "正在开始…" : "开始回答"}
              </button>
            )}

            {isAnswering && (
              <button
                className="rounded-xl bg-[#bf5b3d] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#a94b31] disabled:cursor-not-allowed disabled:opacity-45"
                type="button"
                onClick={() => void complete()}
                disabled={isPending || draft.trim().length === 0}
              >
                {isPending ? "正在完成…" : "完成回答"}
              </button>
            )}

            {isDone && (
              <button
                className="rounded-xl border border-[#1e3c30]/20 bg-white px-6 py-3 text-sm font-semibold text-[#1e3c30] transition hover:bg-[#f3f5f1]"
                type="button"
                onClick={reset}
              >
                新建训练
              </button>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
