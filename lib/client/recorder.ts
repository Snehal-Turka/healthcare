export interface SegmentRecorderOptions {
  segmentMs?: number;
  onSegment: (segment: Blob, index: number) => void;
}

export class SegmentRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private index = 0;
  private running = false;
  readonly mimeType: string;

  constructor(private readonly opts: SegmentRecorderOptions) {
    this.mimeType =
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1 },
    });
    this.running = true;
    this.cycle();
    this.timer = setInterval(() => this.flush(), this.opts.segmentMs ?? 29_000);
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
    this.recorder = new MediaRecorder(this.stream, { mimeType: this.mimeType });
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
    this.chunks = [];
    if (segment.size > 0) this.opts.onSegment(segment, this.index++);
  }
}
