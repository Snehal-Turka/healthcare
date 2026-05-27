import { SarvamAIClient } from "sarvamai";
import { env } from "@/lib/config/env";
import { PRICING_SNAPSHOT, priceAudioSeconds } from "@/lib/domain/report/api-cost";
import type {
  TranscriptionOptions,
  TranscriptionProvider,
  TranscriptionResult,
} from "./provider";

type SpeechClient = Pick<SarvamAIClient, "speechToText" | "speechToTextJob">;

/** Shape of a single transcript output file produced by the Batch API. */
interface BatchTranscriptOutput {
  transcript?: string;
  language_code?: string;
}

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 540_000; // 9 min — covers the ~10 min demo ceiling.
const UPLOAD_TIMEOUT_MS = 120_000; // presigned blob PUT/GET have no SDK timeout.

function fileNameFor(mimeType: string): string {
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "audio.m4a";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "audio.mp3";
  if (mimeType.includes("wav")) return "audio.wav";
  if (mimeType.includes("ogg")) return "audio.ogg";
  return "audio.webm";
}

export class SarvamTranscriptionProvider implements TranscriptionProvider {
  readonly id = "sarvam" as const;
  readonly supportsStreaming = false;
  private readonly client: SpeechClient;

  constructor(client?: SpeechClient, apiKey?: string) {
    if (client) {
      this.client = client;
    } else {
      const key = apiKey ?? env().SARVAM_API_KEY;
      if (!key) throw new Error("SARVAM_API_KEY is not set");
      this.client = new SarvamAIClient({ apiSubscriptionKey: key });
    }
  }

  /**
   * Real-time transcription for short (<=30s) live segments. Sarvam's real-time
   * endpoint rejects longer audio, so whole-file uploads use {@link transcribeBatch}.
   */
  async transcribeChunk(
    audio: Uint8Array,
    mimeType: string,
    options: TranscriptionOptions = {},
  ): Promise<TranscriptionResult> {
    const res = await this.client.speechToText.transcribe({
      file: {
        data: Buffer.from(audio),
        filename: fileNameFor(mimeType),
        contentType: mimeType,
      },
      model: "saaras:v3",
      mode: "transcribe",
      language_code: "unknown",
    });
    return {
      text: res.transcript,
      detectedLanguage: res.language_code,
      costLineItem: sarvamCost(options, "Live transcript chunk"),
    };
  }

  /**
   * Transcribe a whole recording (up to ~10 min) via Sarvam's async Batch API,
   * which lifts the 30s cap of the real-time endpoint. Flow: create a job →
   * upload the audio to the returned presigned URL → start → poll → download and
   * parse the transcript output.
   */
  async transcribeBatch(
    audio: Uint8Array,
    mimeType: string,
    options: TranscriptionOptions = {},
  ): Promise<TranscriptionResult> {
    const jobs = this.client.speechToTextJob;
    const fileName = fileNameFor(mimeType);

    const { job_id: jobId } = await jobs.initialise({
      job_parameters: {
        model: "saaras:v3",
        mode: "transcribe",
        language_code: "unknown",
      },
    });

    const uploadLinks = await jobs.getUploadLinks({
      job_id: jobId,
      files: [fileName],
    });
    const uploadUrl = uploadLinks.upload_urls[fileName]?.file_url;
    if (!uploadUrl)
      throw new Error(
        `Sarvam batch job returned no upload URL for ${fileName}`,
      );

    const uploaded = await fetch(uploadUrl, {
      method: "PUT",
      body: Buffer.from(audio),
      headers: {
        "x-ms-blob-type": "BlockBlob",
        "Content-Type": mimeType,
      },
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    if (uploaded.status < 200 || uploaded.status > 226)
      throw new Error(`Sarvam batch upload failed: ${uploaded.status}`);

    await jobs.start(jobId);
    const status = await this.poll(jobId);

    const outputName = (status.job_details ?? [])
      .filter((detail) => detail.state === "Success")
      .flatMap((detail) => detail.outputs ?? [])[0]?.file_name;
    if (!outputName)
      throw new Error("Sarvam batch job produced no transcript output");

    const downloadLinks = await jobs.getDownloadLinks({
      job_id: jobId,
      files: [outputName],
    });
    const downloadUrl = downloadLinks.download_urls[outputName]?.file_url;
    if (!downloadUrl)
      throw new Error(
        `Sarvam batch job returned no download URL for ${outputName}`,
      );

    const res = await fetch(downloadUrl, {
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Sarvam batch download failed: ${res.status}`);
    const output = (await res.json()) as BatchTranscriptOutput;

    return {
      text: output.transcript ?? "",
      detectedLanguage: output.language_code,
      costLineItem: sarvamCost(options, "Transcript"),
    };
  }

  private async poll(jobId: string) {
    const start = Date.now();
    for (;;) {
      const status = await this.client.speechToTextJob.getStatus(jobId);
      const state = status.job_state.toLowerCase();
      if (state === "completed") return status;
      if (state === "failed")
        throw new Error(
          `Sarvam batch job failed: ${status.error_message ?? "unknown error"}`,
        );
      if (Date.now() - start > POLL_TIMEOUT_MS)
        throw new Error("Sarvam batch job timed out");
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

function sarvamCost(
  options: TranscriptionOptions,
  fallbackLabel: string,
) {
  if (options.audioSeconds === undefined) return undefined;
  const pricing = PRICING_SNAPSHOT.sarvam["saaras:v3"];
  return priceAudioSeconds({
    stage: "transcription",
    provider: "sarvam",
    model: "saaras:v3",
    label: options.label ?? fallbackLabel,
    audioSeconds: options.audioSeconds,
    currency: pricing.currency,
    pricePerHour: pricing.pricePerHour,
    accuracy: "estimated",
  });
}
