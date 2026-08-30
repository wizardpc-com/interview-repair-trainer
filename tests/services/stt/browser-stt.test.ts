import { describe, expect, it, vi } from "vitest";
import {
  appendStableTranscript,
  BrowserSttAdapter,
  BrowserSttError,
  calculateAmplitude,
  isBrowserSttSupported,
  type BrowserSttDependencies,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionLike,
} from "../../../src/services/stt/browser-stt";

class FakeRecognition implements SpeechRecognitionLike {
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: SpeechRecognitionLike["onresult"] = null;
  onerror: SpeechRecognitionLike["onerror"] = null;
  onend: SpeechRecognitionLike["onend"] = null;
  readonly start = vi.fn();
  readonly stop = vi.fn();

  emit(
    results: readonly Readonly<{ transcript: string; isFinal: boolean }>[]
  ): void {
    const event = {
      resultIndex: 0,
      results: Object.assign(
        results.map(({ transcript, isFinal }) =>
          Object.assign([{ transcript }], { isFinal }),
        ),
        { length: results.length },
      ),
    } as unknown as SpeechRecognitionEventLike;
    this.onresult?.(event);
  }
}

function testDependencies(options: Readonly<{ denied?: boolean }> = {}) {
  const recognition = new FakeRecognition();
  const track = { stop: vi.fn() };
  const stream = {
    getTracks: () => [track],
  } as unknown as MediaStream;
  const analyser = {
    fftSize: 4,
    smoothingTimeConstant: 0,
    getByteTimeDomainData: vi.fn((samples: Uint8Array) => {
      samples.fill(128);
    }),
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
  let frame: FrameRequestCallback | null = null;
  const getUserMedia = vi.fn(async () => {
    if (options.denied) {
      throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
    }
    return stream;
  });

  const dependencies: BrowserSttDependencies = {
    getUserMedia,
    createRecognition: () => recognition,
    createAudioContext: () => audioContext,
    requestAnimationFrame: (callback) => {
      frame = callback;
      return 1;
    },
    cancelAnimationFrame: vi.fn(),
    setTimeout: vi.fn(() => 1),
    clearTimeout: vi.fn(),
  };

  return {
    analyser,
    audioContext,
    dependencies,
    getFrame: () => frame,
    getUserMedia,
    recognition,
    source,
    track,
  };
}

describe("browser STT adapter", () => {
  it("requests microphone access only when start is called", async () => {
    const fixture = testDependencies();
    const adapter = new BrowserSttAdapter(
      {
        onInterim: vi.fn(),
        onFinal: vi.fn(),
        onAmplitude: vi.fn(),
        onError: vi.fn(),
      },
      fixture.dependencies,
    );

    expect(fixture.getUserMedia).not.toHaveBeenCalled();
    await adapter.start();

    expect(fixture.getUserMedia).toHaveBeenCalledOnce();
    expect(fixture.recognition.start).toHaveBeenCalledOnce();
    expect(fixture.recognition).toMatchObject({
      continuous: true,
      interimResults: true,
      lang: "zh-CN",
    });
    await adapter.stop();
  });

  it("keeps interim text separate and emits only final stable segments", async () => {
    const fixture = testDependencies();
    const onInterim = vi.fn();
    const onFinal = vi.fn();
    const adapter = new BrowserSttAdapter(
      {
        onInterim,
        onFinal,
        onAmplitude: vi.fn(),
        onError: vi.fn(),
      },
      fixture.dependencies,
    );
    await adapter.start();

    fixture.recognition.emit([{ transcript: "这是临时内容", isFinal: false }]);
    expect(onInterim).toHaveBeenLastCalledWith("这是临时内容");
    expect(onFinal).not.toHaveBeenCalled();

    fixture.recognition.emit([{ transcript: "这是稳定内容。", isFinal: true }]);
    fixture.recognition.emit([{ transcript: "继续回答。", isFinal: true }]);
    expect(onFinal.mock.calls.flat()).toEqual(["这是稳定内容。", "继续回答。"]);
    expect(
      onFinal.mock.calls.flat().reduce(appendStableTranscript, ""),
    ).toBe("这是稳定内容。继续回答。");
    await adapter.stop();
  });

  it("derives amplitude from analyser samples and releases every audio resource", async () => {
    const fixture = testDependencies();
    const onAmplitude = vi.fn();
    const adapter = new BrowserSttAdapter(
      {
        onInterim: vi.fn(),
        onFinal: vi.fn(),
        onAmplitude,
        onError: vi.fn(),
      },
      fixture.dependencies,
    );
    await adapter.start();
    expect(onAmplitude).toHaveBeenLastCalledWith(0);

    fixture.analyser.getByteTimeDomainData.mockImplementationOnce(
      (samples: Uint8Array) =>
        samples.forEach((_, index) => {
          samples[index] = index % 2 === 0 ? 64 : 192;
        }),
    );
    fixture.getFrame()?.(16);
    expect(onAmplitude.mock.calls.at(-1)?.[0]).toBeGreaterThan(0.9);

    await adapter.stop();
    expect(fixture.recognition.stop).toHaveBeenCalledOnce();
    expect(fixture.track.stop).toHaveBeenCalled();
    expect(fixture.source.disconnect).toHaveBeenCalledOnce();
    expect(fixture.audioContext.close).toHaveBeenCalledOnce();
    expect(fixture.dependencies.cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(onAmplitude).toHaveBeenLastCalledWith(0);
  });

  it("releases a microphone stream that resolves after capture was stopped", async () => {
    const fixture = testDependencies();
    let resolveStream: ((stream: MediaStream) => void) | undefined;
    const pendingStream = new Promise<MediaStream>((resolve) => {
      resolveStream = resolve;
    });
    const adapter = new BrowserSttAdapter(
      {
        onInterim: vi.fn(),
        onFinal: vi.fn(),
        onAmplitude: vi.fn(),
        onError: vi.fn(),
      },
      {
        ...fixture.dependencies,
        getUserMedia: () => pendingStream,
      },
    );

    const starting = adapter.start();
    await adapter.stop();
    resolveStream?.({
      getTracks: () => [{ stop: fixture.track.stop }],
    } as unknown as MediaStream);
    await starting;

    expect(fixture.track.stop).toHaveBeenCalledOnce();
    expect(fixture.recognition.start).not.toHaveBeenCalled();
  });

  it("reports permission denial and unsupported browsers for text fallback", async () => {
    const denied = testDependencies({ denied: true });
    const adapter = new BrowserSttAdapter(
      {
        onInterim: vi.fn(),
        onFinal: vi.fn(),
        onAmplitude: vi.fn(),
        onError: vi.fn(),
      },
      denied.dependencies,
    );

    await expect(adapter.start()).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
    expect(denied.recognition.start).not.toHaveBeenCalled();
    expect(isBrowserSttSupported()).toBe(false);
    expect(() => new BrowserSttError("UNSUPPORTED", "unsupported")).not.toThrow();
  });
});

describe("stable transcript helpers", () => {
  it("appends Chinese and Latin stable segments without corrupting spacing", () => {
    expect(appendStableTranscript("第一句。", "第二句。"))
      .toBe("第一句。第二句。");
    expect(appendStableTranscript("sensor", "noise"))
      .toBe("sensor noise");
  });

  it("maps silence to zero and louder samples to a larger amplitude", () => {
    expect(calculateAmplitude(Uint8Array.from([128, 128]))).toBe(0);
    expect(calculateAmplitude(Uint8Array.from([96, 160])))
      .toBeGreaterThan(0);
  });
});
