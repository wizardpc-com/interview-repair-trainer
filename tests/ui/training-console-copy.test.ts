import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TrainingConsole } from "../../src/components/training-console";

describe("training console copy", () => {
  it("explains the setup flow in Chinese", () => {
    const markup = renderToStaticMarkup(createElement(TrainingConsole));

    expect(markup).toContain("再使用麦克风作答");
    expect(markup).toContain("第一步：提供项目背景");
    expect(markup).toContain("生成面试问题");
    expect(markup).not.toContain("Text-first console");
    expect(markup).not.toContain("Setup");
  });

  it("keeps runtime labels and guidance in Chinese", () => {
    const source = readFileSync(
      resolve("src/components/training-console.tsx"),
      "utf8",
    );

    expect(source).toContain('QUESTION_READY: "待回答"');
    expect(source).toContain('ANSWERING: "回答中"');
    expect(source).toContain('WRAP_UP: "可以收住了"');
    expect(source).toContain('REPAIR: "回答已暂停"');
    expect(source).toContain('REANSWER: "重新回答中"');
    expect(source).toContain('QUESTION_DONE: "本题完成"');
    expect(source).toContain("同一问题 · 重新回答");
    expect(source).not.toContain("Interview prompt");
    expect(source).not.toContain("Your answer");
    expect(source).not.toContain("Transcript 已自动同步");
    expect(source).not.toContain("回答版本");
    expect(source).not.toContain("快照版本");
    expect(source).not.toContain("最终快照");
    expect(source).not.toContain('REPAIR: "修复中"');
  });

  it("keeps voice input behind the start action and interim text local", () => {
    const source = readFileSync(
      resolve("src/components/training-console.tsx"),
      "utf8",
    );

    const startAction = source.indexOf('action: "START"');
    const microphoneStart = source.indexOf("void startVoiceCapture()", startAction);
    expect(startAction).toBeGreaterThan(-1);
    expect(microphoneStart).toBeGreaterThan(startAction);
    expect(source).toMatch(/onInterim:[\s\S]*captureIsCurrent\(\)/);
    expect(source).toMatch(/onFinal:[\s\S]*persistTranscript\(next\)/);
    expect(source).toContain('aria-label="实时转写"');
    expect(source).toContain("void sttAdapterRef.current?.stop()");
    expect(source).toContain('action: "EVALUATE_CHECKPOINT"');
    expect(source).toContain("captureEpochRef.current += 1");
    expect(source).toMatch(
      /evaluated\.state === "REPAIR" \|\| evaluated\.state === "WRAP_UP"[\s\S]*await stopVoiceCapture\(\)/,
    );
    expect(source).toMatch(
      /action: "CONTINUE_AFTER_WRAP_UP"[\s\S]*resumed\.state !== "ANSWERING"[\s\S]*void startVoiceCapture\(\)/,
    );
    expect(source).toMatch(
      /action: "OVERRIDE_GATE"[\s\S]*void startVoiceCapture\(\)/,
    );
    expect(source).toContain("!isAnswerCaptureState(latestRuntime.state)");
    expect(source).toMatch(
      /const answerAttempt = currentRuntime\.answerAttempt[\s\S]*action: "UPDATE_TRANSCRIPT"[\s\S]*answerAttempt[\s\S]*runtimeRef\.current\?\.answerAttempt !== answerAttempt/,
    );

    const reanswerAction = source.indexOf('action: "START_REANSWER"');
    const reanswerGuard = source.indexOf(
      'reanswer.state !== "REANSWER"',
      reanswerAction,
    );
    const freshMicrophone = source.indexOf(
      "void startVoiceCapture()",
      reanswerGuard,
    );
    expect(reanswerAction).toBeGreaterThan(-1);
    expect(reanswerGuard).toBeGreaterThan(reanswerAction);
    expect(freshMicrophone).toBeGreaterThan(reanswerGuard);
    expect(source).toMatch(
      /checkpointRuntime\.state !== "ANSWERING"[\s\S]*attemptedCheckpointKeysRef/,
    );
    expect(source).not.toContain('action: "PREPARE_REANSWER"');
  });
});
