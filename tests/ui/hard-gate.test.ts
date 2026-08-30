import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  HardGateView,
  RepairResultView,
  WrapUpView,
  runtimeIsAtLeastAsCurrent,
} from "../../src/components/training-console";
import type { PublicInterviewRuntimeDto } from "../../src/lib/interview-api-contracts";

function hardGateRuntime(): PublicInterviewRuntimeDto {
  return {
    sessionId: "session-hard-gate",
    runtimeRevision: 7,
    question: {
      questionId: "technical-choice",
      surfaceQuestion: "你选择了哪项重要的技术方案？为什么这样选择？",
      index: 1,
      total: 1,
    },
    state: "REPAIR",
    transcript:
      "我们最后使用了这个方案。这个方法先建立索引，再根据索引找到候选路径。",
    answerAttempt: 1,
    answerVersion: 3,
    checkpointVersion: 2,
    checkpoint: null,
    wrapUpPrompt: null,
    hardGate: {
      status: "GATE_PENDING",
      title: "回答已暂停",
      whyPaused:
        "你一直在介绍这个方法是什么，但当前问题问的是为什么选择它。",
      repairCue: "先说明真实项目约束，再解释你的选择理由。",
      originalAnswer:
        "我们最后使用了这个方案。这个方法先建立索引，再根据索引找到候选路径。",
    },
    repairResult: null,
  };
}

function repairResultRuntime(
  status: "SUCCESSFUL" | "UNRESOLVED",
): PublicInterviewRuntimeDto {
  return {
    ...hardGateRuntime(),
    runtimeRevision: 11,
    state: "QUESTION_DONE",
    transcript: "这是独立保存的重新回答。",
    answerAttempt: 2,
    hardGate: null,
    repairResult: {
      status,
      title: status === "SUCCESSFUL" ? "修复成功" : "仍未解决",
    },
  };
}

describe("Hard Gate view", () => {
  it("accepts newer state transitions and rejects stale client responses", () => {
    const repair = hardGateRuntime();
    const resumed = {
      ...repair,
      runtimeRevision: repair.runtimeRevision + 1,
      state: "ANSWERING" as const,
      hardGate: null,
    };

    expect(runtimeIsAtLeastAsCurrent(repair, { ...repair, runtimeRevision: 6 })).toBe(
      true,
    );
    expect(runtimeIsAtLeastAsCurrent(resumed, repair)).toBe(true);
    expect(runtimeIsAtLeastAsCurrent({ ...repair, runtimeRevision: 6 }, repair)).toBe(
      false,
    );
  });

  it("shows one near-full-screen repair decision without exposing internal terms", () => {
    const markup = renderToStaticMarkup(
      createElement(HardGateView, {
        runtime: hardGateRuntime(),
        isPending: false,
        onPrepareReanswer: vi.fn(),
        onOverride: vi.fn(),
      }),
    );

    expect(markup).toContain("回答已暂停");
    expect(markup).toContain("当前问题");
    expect(markup).toContain(
      "你选择了哪项重要的技术方案？为什么这样选择？",
    );
    expect(markup).toContain("为什么暂停");
    expect(markup).toContain(
      "你一直在介绍这个方法是什么，但当前问题问的是为什么选择它。",
    );
    expect(markup).toContain("修复要求");
    expect(markup).toContain("先说明真实项目约束，再解释你的选择理由。");
    expect(markup).toContain(
      "我们最后使用了这个方案。这个方法先建立索引，再根据索引找到候选路径。",
    );
    expect(markup).toContain(">重新回答</button>");
    expect(markup).toContain("我认为判断不合理，继续回答");

    expect(markup).not.toMatch(
      /NOT_ANSWERING_QUESTION|VAGUE_WITHOUT_EVIDENCE|OWNERSHIP_AMBIGUOUS/,
    );
    expect(markup).not.toMatch(
      /confidence|Hidden Target|primaryTarget|requiredEvidence|optionalEvidence/i,
    );
  });

  it.each([
    ["SUCCESSFUL", "修复成功"],
    ["UNRESOLVED", "仍未解决"],
  ] as const)("renders the concise %s repair result", (status, title) => {
    const markup = renderToStaticMarkup(
      createElement(RepairResultView, {
        runtime: repairResultRuntime(status),
        onReset: vi.fn(),
      }),
    );

    expect(markup).toContain(title);
    expect(markup).toContain("重新回答结果");
    expect(markup).not.toMatch(
      /NOT_ANSWERING_QUESTION|VAGUE_WITHOUT_EVIDENCE|OWNERSHIP_AMBIGUOUS/,
    );
    expect(markup).not.toMatch(
      /confidence|Hidden Target|primaryTarget|requiredEvidence|optionalEvidence/i,
    );
  });

  it("shows a non-Gate wrap-up choice with the frozen transcript", () => {
    const runtime: PublicInterviewRuntimeDto = {
      ...hardGateRuntime(),
      runtimeRevision: 9,
      state: "WRAP_UP",
      hardGate: null,
      wrapUpPrompt: {
        title: "核心已经回答",
        message: "你已经回应了问题核心，后面的内容开始偏离当前问题。",
      },
    };
    const markup = renderToStaticMarkup(
      createElement(WrapUpView, {
        runtime,
        isPending: false,
        onFinish: vi.fn(),
        onContinue: vi.fn(),
      }),
    );

    expect(markup).toContain("核心已经回答");
    expect(markup).toContain("结束本题");
    expect(markup).toContain("继续回答");
    expect(markup).toContain(runtime.transcript);
    expect(markup).not.toContain("回答已暂停");
    expect(markup).not.toMatch(/NOT_ANSWERING_QUESTION|confidence|Hidden Target/i);
  });
});
