import { describe, expect, it, vi } from "vitest";
import {
  BrowserSttAdapter,
  type BrowserSttDependencies,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionLike,
} from "../../../src/services/stt/browser-stt";

class StopRaceRecognition implements SpeechRecognitionLike {
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: SpeechRecognitionLike["onresult"] = null;
  onerror: SpeechRecognitionLike["onerror"] = null;
  onend: SpeechRecognitionLike["onend"] = null;
  readonly start = vi.fn();
  readonly stop = vi.fn(() => {
    const event = {
      resultIndex: 0,
      results: Object.assign(
        [Object.assign([{ transcript: "停止后才到达的稳定文本" }], {
          isFinal: true,
        })],
        { length: 1 },
      ),
    } as unknown as SpeechRecognitionEventLike;
    this.onresult?.(event);
  });
}

describe("browser STT stop race", () => {
  it("discards a synchronous late final result and releases every capture resource", async () => {
    const recognition = new StopRaceRecognition();
    const track = { stop: vi.fn() };
    const stream = {
      getTracks: () => [track],
    } as unknown as MediaStream;
    const analyser = {
      fftSize: 4,
      smoothingTimeConstant: 0,
      getByteTimeDomainData: vi.fn((samples: Uint8Array) => samples.fill(128)),
    };
    const source = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const audioContext = {
      state: "running",
      createMediaStreamSource: vi.fn(() => source),
      createAnalyser: vi.fn(() => analyser),
      resume: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    } as unknown as AudioContext;
    const dependencies: BrowserSttDependencies = {
      getUserMedia: vi.fn(async () => stream),
      createRecognition: () => recognition,
      createAudioContext: () => audioContext,
      requestAnimationFrame: vi.fn(() => 17),
      cancelAnimationFrame: vi.fn(),
      setTimeout: vi.fn(() => 23),
      clearTimeout: vi.fn(),
    };
    const onInterim = vi.fn();
    const onFinal = vi.fn();
    const onAmplitude = vi.fn();
    const adapter = new BrowserSttAdapter(
      {
        onInterim,
        onFinal,
        onAmplitude,
        onError: vi.fn(),
      },
      dependencies,
    );

    await adapter.start();
    recognition.onend?.();
    expect(dependencies.setTimeout).toHaveBeenCalledWith(
      expect.any(Function),
      250,
    );

    await adapter.stop();

    expect(recognition.stop).toHaveBeenCalledOnce();
    expect(onFinal).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(audioContext.close).toHaveBeenCalledOnce();
    expect(dependencies.cancelAnimationFrame).toHaveBeenCalledWith(17);
    expect(dependencies.clearTimeout).toHaveBeenCalledWith(23);
    expect(onInterim).toHaveBeenLastCalledWith("");
    expect(onAmplitude).toHaveBeenLastCalledWith(0);
    expect(recognition.onresult).toBeNull();
    expect(recognition.onerror).toBeNull();
    expect(recognition.onend).toBeNull();
  });
});
