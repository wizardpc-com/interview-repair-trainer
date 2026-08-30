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

    expect(source).toContain('QUESTION_READY: "待开始"');
    expect(source).toContain('ANSWERING: "正在回答"');
    expect(source).toContain('QUESTION_DONE: "已完成"');
    expect(source).not.toContain("Interview prompt");
    expect(source).not.toContain("Your answer");
    expect(source).not.toContain("Transcript 已自动同步");
  });

  it("keeps voice input behind the start action and interim text local", () => {
    const source = readFileSync(
      resolve("src/components/training-console.tsx"),
      "utf8",
    );

    const startAction = source.indexOf('action: "START"');
    const microphoneStart = source.indexOf("await startVoiceCapture()", startAction);
    expect(startAction).toBeGreaterThan(-1);
    expect(microphoneStart).toBeGreaterThan(startAction);
    expect(source).toContain("onInterim: setInterimTranscript");
    expect(source).toMatch(/onFinal:[\s\S]*persistTranscript\(next\)/);
    expect(source).toContain('aria-label="实时转写"');
    expect(source).toContain("void sttAdapterRef.current?.stop()");
  });
});
