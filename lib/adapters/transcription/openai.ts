import OpenAI, { toFile } from "openai";
import { env } from "@/lib/config/env";
import { PRICING_SNAPSHOT, priceAudioSeconds, priceTokenUsage } from "@/lib/domain/report/api-cost";
import type {
  TranscriptionOptions,
  TranscriptionProvider,
  TranscriptionResult,
} from "./provider";

const MODEL = "gpt-4o-transcribe";

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
    options: TranscriptionOptions = {},
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
      model: MODEL,
    });
    return {
      text: res.text,
      costLineItem: costFromTranscription(res, options),
    };
  }
}

function costFromTranscription(
  res: { usage?: unknown },
  options: TranscriptionOptions,
) {
  const pricing = PRICING_SNAPSHOT.openai[MODEL];
  const usage = res.usage as
    | {
        type?: "tokens" | "duration";
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
        seconds?: number;
      }
    | undefined;

  if (usage?.type === "tokens" || usage?.input_tokens || usage?.output_tokens) {
    return priceTokenUsage({
      stage: "transcription",
      provider: "openai",
      model: MODEL,
      label: options.label ?? "Transcript",
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      inputUsdPerMillion: pricing.inputUsdPerMillion,
      outputUsdPerMillion: pricing.outputUsdPerMillion,
      accuracy: "exact",
    });
  }

  const audioSeconds = usage?.seconds ?? options.audioSeconds;
  if (audioSeconds === undefined) return undefined;
  return priceAudioSeconds({
    stage: "transcription",
    provider: "openai",
    model: MODEL,
    label: options.label ?? "Transcript",
    audioSeconds,
    currency: "USD",
    pricePerHour: pricing.estimatedUsdPerMinute * 60,
    accuracy: "estimated",
  });
}
