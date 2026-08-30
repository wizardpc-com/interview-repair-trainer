export type BrowserSttErrorCode =
  | "UNSUPPORTED"
  | "PERMISSION_DENIED"
  | "AUDIO_UNAVAILABLE"
  | "RECOGNITION_FAILED";

export class BrowserSttError extends Error {
  constructor(
    readonly code: BrowserSttErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BrowserSttError";
  }
}

export type SpeechRecognitionAlternativeLike = Readonly<{
  transcript: string;
}>;

export type SpeechRecognitionResultLike = Readonly<{
  isFinal: boolean;
  length: number;
  readonly [index: number]: SpeechRecognitionAlternativeLike;
}>;

export type SpeechRecognitionEventLike = Readonly<{
  resultIndex: number;
  results: Readonly<{
    length: number;
    readonly [index: number]: SpeechRecognitionResultLike;
  }>;
}>;

export type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Readonly<{ error: string }>) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type AudioContextConstructor = new () => AudioContext;

type SpeechBrowserWindow = Window &
  Readonly<{
    AudioContext?: AudioContextConstructor;
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    webkitAudioContext?: AudioContextConstructor;
  }>;

export type BrowserSttCallbacks = Readonly<{
  onInterim(transcript: string): void;
  onFinal(transcript: string): void;
  onAmplitude(amplitude: number): void;
  onError(error: BrowserSttError): void;
}>;

export type BrowserSttDependencies = Readonly<{
  getUserMedia?: (
    constraints: MediaStreamConstraints,
  ) => Promise<MediaStream>;
  createRecognition?: () => SpeechRecognitionLike;
  createAudioContext?: () => AudioContext;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame?: (handle: number) => void;
  setTimeout?: (callback: () => void, delay: number) => number;
  clearTimeout?: (handle: number) => void;
}>;

type ResolvedDependencies = Required<BrowserSttDependencies>;

const RECOGNITION_RESTART_DELAY_MS = 250;

function unsupported(): BrowserSttError {
  return new BrowserSttError(
    "UNSUPPORTED",
    "当前浏览器不支持语音识别，请使用最新版 Chrome 或切换到文本输入。",
  );
}

function resolveDependencies(
  overrides: BrowserSttDependencies,
): ResolvedDependencies {
  const speechWindow =
    typeof window === "undefined" ? null : (window as SpeechBrowserWindow);
  const Recognition =
    speechWindow?.SpeechRecognition ?? speechWindow?.webkitSpeechRecognition;
  const AudioContextClass =
    speechWindow?.AudioContext ?? speechWindow?.webkitAudioContext;
  const getUserMedia =
    overrides.getUserMedia ??
    (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia
      ? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
      : undefined);

  const createRecognition =
    overrides.createRecognition ??
    (Recognition === undefined ? undefined : () => new Recognition());
  const createAudioContext =
    overrides.createAudioContext ??
    (AudioContextClass === undefined
      ? undefined
      : () => new AudioContextClass());

  if (
    getUserMedia === undefined ||
    createRecognition === undefined ||
    createAudioContext === undefined ||
    (overrides.requestAnimationFrame === undefined && speechWindow === null) ||
    (overrides.cancelAnimationFrame === undefined && speechWindow === null) ||
    (overrides.setTimeout === undefined && speechWindow === null) ||
    (overrides.clearTimeout === undefined && speechWindow === null)
  ) {
    throw unsupported();
  }

  return {
    getUserMedia,
    createRecognition,
    createAudioContext,
    requestAnimationFrame:
      overrides.requestAnimationFrame ??
      speechWindow!.requestAnimationFrame.bind(speechWindow),
    cancelAnimationFrame:
      overrides.cancelAnimationFrame ??
      speechWindow!.cancelAnimationFrame.bind(speechWindow),
    setTimeout:
      overrides.setTimeout ??
      ((callback, delay) => speechWindow!.setTimeout(callback, delay)),
    clearTimeout:
      overrides.clearTimeout ??
      ((handle) => speechWindow!.clearTimeout(handle)),
  };
}

function isPermissionError(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "name" in cause &&
    (cause.name === "NotAllowedError" || cause.name === "SecurityError")
  );
}

export function calculateAmplitude(samples: Uint8Array): number {
  if (samples.length === 0) {
    return 0;
  }

  let squaredTotal = 0;
  for (const sample of samples) {
    const normalized = (sample - 128) / 128;
    squaredTotal += normalized * normalized;
  }

  return Math.min(1, Math.sqrt(squaredTotal / samples.length) * 3.5);
}

export function appendStableTranscript(
  current: string,
  segment: string,
): string {
  const base = current.trimEnd();
  const next = segment.trim();
  if (base.length === 0) {
    return next;
  }
  if (next.length === 0) {
    return base;
  }

  const needsSpace = /[A-Za-z0-9]$/.test(base) && /^[A-Za-z0-9]/.test(next);
  return `${base}${needsSpace ? " " : ""}${next}`;
}

export function isBrowserSttSupported(
  overrides: BrowserSttDependencies = {},
): boolean {
  try {
    resolveDependencies(overrides);
    return true;
  } catch {
    return false;
  }
}

export class BrowserSttAdapter {
  private dependencies: ResolvedDependencies | null = null;
  private recognition: SpeechRecognitionLike | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private animationFrame: number | null = null;
  private restartTimer: number | null = null;
  private startGeneration = 0;
  private active = false;

  constructor(
    private readonly callbacks: BrowserSttCallbacks,
    private readonly overrides: BrowserSttDependencies = {},
  ) {}

  async start(): Promise<void> {
    if (this.active) {
      return;
    }

    const startGeneration = ++this.startGeneration;
    const dependencies = resolveDependencies(this.overrides);
    let stream: MediaStream;
    try {
      stream = await dependencies.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
    } catch (cause) {
      if (startGeneration !== this.startGeneration) {
        return;
      }
      if (isPermissionError(cause)) {
        throw new BrowserSttError(
          "PERMISSION_DENIED",
          "无法使用麦克风，请允许权限或切换到文本输入。",
        );
      }
      throw new BrowserSttError(
        "AUDIO_UNAVAILABLE",
        "无法连接麦克风，请检查设备后切换到文本输入。",
      );
    }
    if (startGeneration !== this.startGeneration) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    try {
      const audioContext = dependencies.createAudioContext();
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
      if (startGeneration !== this.startGeneration) {
        stream.getTracks().forEach((track) => track.stop());
        await audioContext.close();
        return;
      }
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);

      const recognition = dependencies.createRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "zh-CN";

      this.dependencies = dependencies;
      this.stream = stream;
      this.audioContext = audioContext;
      this.source = source;
      this.recognition = recognition;
      this.active = true;

      recognition.onresult = (event) => this.handleResult(event);
      recognition.onerror = (event) => this.handleRecognitionError(event.error);
      recognition.onend = () => this.handleRecognitionEnd();

      const samples = new Uint8Array(analyser.fftSize);
      const sampleAmplitude = () => {
        if (!this.active) {
          return;
        }
        analyser.getByteTimeDomainData(samples);
        this.callbacks.onAmplitude(calculateAmplitude(samples));
        this.animationFrame = dependencies.requestAnimationFrame(sampleAmplitude);
      };
      sampleAmplitude();
      recognition.start();
    } catch (cause) {
      stream.getTracks().forEach((track) => track.stop());
      await this.releaseResources();
      if (startGeneration !== this.startGeneration) {
        return;
      }
      if (cause instanceof BrowserSttError) {
        throw cause;
      }
      throw new BrowserSttError(
        "RECOGNITION_FAILED",
        "语音识别启动失败，请切换到文本输入。",
      );
    }
  }

  async stop(): Promise<void> {
    this.startGeneration += 1;
    if (!this.active && this.stream === null) {
      return;
    }

    this.active = false;
    if (this.restartTimer !== null && this.dependencies !== null) {
      this.dependencies.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    try {
      this.recognition?.stop();
    } catch {
      // Recognition may already have stopped after a browser-level error.
    }
    await this.releaseResources();
    this.callbacks.onInterim("");
    this.callbacks.onAmplitude(0);
  }

  private handleResult(event: SpeechRecognitionEventLike): void {
    let interim = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result?.[0]?.transcript ?? "";
      if (result?.isFinal) {
        if (transcript.trim().length > 0) {
          this.callbacks.onFinal(transcript);
        }
      } else {
        interim = appendStableTranscript(interim, transcript);
      }
    }
    this.callbacks.onInterim(interim);
  }

  private handleRecognitionError(error: string): void {
    if (error === "aborted") {
      return;
    }
    if (error === "no-speech") {
      this.callbacks.onInterim("");
      return;
    }

    this.callbacks.onError(
      error === "not-allowed" || error === "service-not-allowed"
        ? new BrowserSttError(
            "PERMISSION_DENIED",
            "麦克风权限已被拒绝，请允许权限或切换到文本输入。",
          )
        : new BrowserSttError(
            "RECOGNITION_FAILED",
            "语音识别已中断，请切换到文本输入。",
          ),
    );
  }

  private handleRecognitionEnd(): void {
    if (!this.active || this.dependencies === null || this.recognition === null) {
      return;
    }

    this.restartTimer = this.dependencies.setTimeout(() => {
      this.restartTimer = null;
      if (!this.active || this.recognition === null) {
        return;
      }
      try {
        this.recognition.start();
      } catch {
        this.callbacks.onError(
          new BrowserSttError(
            "RECOGNITION_FAILED",
            "语音识别无法继续，请切换到文本输入。",
          ),
        );
      }
    }, RECOGNITION_RESTART_DELAY_MS);
  }

  private async releaseResources(): Promise<void> {
    this.active = false;
    if (this.animationFrame !== null && this.dependencies !== null) {
      this.dependencies.cancelAnimationFrame(this.animationFrame);
    }
    this.animationFrame = null;

    if (this.recognition !== null) {
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      this.recognition.onend = null;
    }
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.audioContext !== null && this.audioContext.state !== "closed") {
      await this.audioContext.close();
    }

    this.recognition = null;
    this.source = null;
    this.stream = null;
    this.audioContext = null;
    this.dependencies = null;
  }
}
