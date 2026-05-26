import type { ProviderId } from "@/lib/domain/report/schema";

export interface TranscriptionResult {
  text: string;
  detectedLanguage?: string;
}

export interface TranscriptionProvider {
  readonly id: ProviderId;
  readonly supportsStreaming: boolean;
  transcribeBatch(
    audio: Uint8Array,
    mimeType: string,
  ): Promise<TranscriptionResult>;
  /**
   * Low-latency transcription of a short (<=30s) live segment. Providers whose
   * `transcribeBatch` is a heavy/async job (e.g. Sarvam's Batch API) implement
   * this for the live-recording chunk route; the route reuses `transcribeBatch`
   * for providers that omit it.
   */
  transcribeChunk?(
    audio: Uint8Array,
    mimeType: string,
  ): Promise<TranscriptionResult>;
  transcribeStream?(
    chunks: AsyncIterable<Uint8Array>,
    mimeType: string,
  ): AsyncIterable<{ partial: string; isFinal: boolean }>;
}
