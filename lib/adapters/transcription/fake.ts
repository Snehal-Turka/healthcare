import type { ProviderId } from "@/lib/domain/report/schema";
import type { TranscriptionProvider, TranscriptionResult } from "./provider";

export class FakeTranscriptionProvider implements TranscriptionProvider {
  readonly supportsStreaming = false;
  public calls: { bytes: number; mimeType: string }[] = [];

  constructor(
    readonly id: ProviderId = "openai",
    private readonly result: TranscriptionResult = {
      text: "Patient reports low mood and poor sleep for three weeks.",
      detectedLanguage: "hi",
    },
  ) {}

  async transcribeBatch(
    audio: Uint8Array,
    mimeType: string,
  ): Promise<TranscriptionResult> {
    this.calls.push({ bytes: audio.byteLength, mimeType });
    return this.result;
  }
}
