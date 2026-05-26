import OpenAI, { toFile } from "openai";
import { env } from "@/lib/config/env";
import type { TranscriptionProvider, TranscriptionResult } from "./provider";

export class OpenAITranscriptionProvider implements TranscriptionProvider {
  readonly id = "openai" as const;
  readonly supportsStreaming = true;
  private readonly client: OpenAI;

  constructor(apiKey = env().OPENAI_API_KEY) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    this.client = new OpenAI({ apiKey });
  }

  async transcribeBatch(
    audio: Uint8Array,
    mimeType: string,
  ): Promise<TranscriptionResult> {
    const ext =
      mimeType.includes("mp4") || mimeType.includes("m4a")
        ? "m4a"
        : mimeType.includes("wav")
          ? "wav"
          : mimeType.includes("mpeg")
            ? "mp3"
            : "webm";
    const file = await toFile(Buffer.from(audio), `audio.${ext}`, {
      type: mimeType,
    });
    const res = await this.client.audio.transcriptions.create({
      file,
      model: "gpt-4o-transcribe",
    });
    return { text: res.text };
  }
}
