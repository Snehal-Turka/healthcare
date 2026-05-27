export interface SegmentRecorderOptions {
  segmentMs?: number;
  onSegment: (segment: Blob, index: number, durationMs: number) => void;
}

export type RecordingErrorKind =
  | "permission-denied"
  | "device-not-found"
  | "unsupported"
  | "unknown";

export interface RecordingErrorDescription {
  kind: RecordingErrorKind;
  message: string;
}

export const MICROPHONE_PERMISSION_DENIED_MESSAGE =
  "Microphone access is blocked. Allow microphone permission for this site from your browser settings, then reload the page.";

const RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mpeg",
];

export function selectRecorderMimeType(
  isTypeSupported: (candidate: string) => boolean,
): string {
  return RECORDER_MIME_TYPES.find(isTypeSupported) ?? "";
}

export function describeRecordingError(
  error: unknown,
): RecordingErrorDescription {
  const name = readErrorField(error, "name");
  const message = readErrorField(error, "message");
  const signature = `${name} ${message}`.toLowerCase();

  if (
    name === "NotAllowedError" ||
    name === "SecurityError" ||
    name === "PermissionDeniedError" ||
    signature.includes("permission denied")
  ) {
    return {
      kind: "permission-denied",
      message: MICROPHONE_PERMISSION_DENIED_MESSAGE,
    };
  }

  if (
    name === "NotFoundError" ||
    name === "DevicesNotFoundError" ||
    name === "OverconstrainedError" ||
    signature.includes("requested device not found")
  ) {
    return {
      kind: "device-not-found",
      message:
        "No microphone was found. Connect or enable a microphone, then try recording again.",
    };
  }

  if (
    name === "TypeError" ||
    signature.includes("mediarecorder is not supported") ||
    signature.includes("getusermedia")
  ) {
    return {
      kind: "unsupported",
      message:
        "Recording is not available in this browser. Use a modern browser over HTTPS or localhost.",
    };
  }

  return {
    kind: "unknown",
    message: message || "Recording failed. Check microphone permissions and try again.",
  };
}

export async function requestMicrophoneStream(): Promise<MediaStream> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser");
  }
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new TypeError("getUserMedia is not available in this browser");
  }

  return navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1 },
  });
}

export class SegmentRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private index = 0;
  private running = false;
  private segmentStartedAt = 0;
  private readonly selectedMimeType: string;
  private actualMimeType = "";

  constructor(private readonly opts: SegmentRecorderOptions) {
    this.selectedMimeType =
      typeof MediaRecorder !== "undefined"
        ? selectRecorderMimeType((candidate) =>
            MediaRecorder.isTypeSupported(candidate),
          )
        : "";
  }

  get mimeType(): string {
    return this.actualMimeType || this.selectedMimeType || "audio/webm";
  }

  async start(stream?: MediaStream): Promise<void> {
    if (typeof MediaRecorder === "undefined") {
      throw new Error("MediaRecorder is not supported in this browser");
    }
    this.stream = stream ?? (await requestMicrophoneStream());
    try {
      this.running = true;
      this.cycle();
      this.timer = setInterval(
        () => this.flush(),
        this.opts.segmentMs ?? 29_000,
      );
    } catch (err) {
      this.running = false;
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
      throw err;
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;

    await new Promise<void>((resolve) => {
      const recorder = this.recorder;
      if (recorder?.state === "recording") {
        recorder.onstop = () => {
          this.emitCurrentSegment();
          resolve();
        };
        recorder.stop();
      } else {
        resolve();
      }
    });

    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
  }

  private cycle(): void {
    if (!this.stream || !this.running) return;

    this.chunks = [];
    this.segmentStartedAt = performance.now();
    this.recorder = new MediaRecorder(
      this.stream,
      this.selectedMimeType ? { mimeType: this.selectedMimeType } : undefined,
    );
    this.actualMimeType = this.recorder.mimeType || this.selectedMimeType;
    this.recorder.ondataavailable = (event) => {
      if (event.data.size) this.chunks.push(event.data);
    };
    this.recorder.onstop = () => {
      this.emitCurrentSegment();
      if (this.running) this.cycle();
    };
    this.recorder.start();
  }

  private flush(): void {
    if (this.recorder?.state === "recording") this.recorder.stop();
  }

  private emitCurrentSegment(): void {
    const segment = new Blob(this.chunks, { type: this.mimeType });
    const durationMs = Math.max(performance.now() - this.segmentStartedAt, 0);
    this.chunks = [];
    if (segment.size > 0) this.opts.onSegment(segment, this.index++, durationMs);
  }
}

function readErrorField(error: unknown, field: "name" | "message"): string {
  if (error && typeof error === "object" && field in error) {
    const value = (error as Record<"name" | "message", unknown>)[field];
    if (typeof value === "string") return value;
  }

  if (field === "message" && error instanceof Error) {
    return error.message;
  }

  return "";
}
