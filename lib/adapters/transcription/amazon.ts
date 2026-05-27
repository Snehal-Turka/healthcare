import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
} from "@aws-sdk/client-transcribe";
import { env } from "@/lib/config/env";
import { PRICING_SNAPSHOT, priceAudioSeconds } from "@/lib/domain/report/api-cost";
import type {
  TranscriptionOptions,
  TranscriptionProvider,
  TranscriptionResult,
} from "./provider";

export class AmazonTranscriptionProvider implements TranscriptionProvider {
  readonly id = "amazon" as const;
  readonly supportsStreaming = true;
  private readonly s3: S3Client;
  private readonly transcribe: TranscribeClient;

  constructor(
    private readonly region = env().AWS_REGION,
    private readonly bucket = env().AWS_S3_BUCKET,
    private readonly accessKeyId = env().AWS_ACCESS_KEY_ID,
    private readonly secretAccessKey = env().AWS_SECRET_ACCESS_KEY,
  ) {
    if (!region || !bucket || !accessKeyId || !secretAccessKey)
      throw new Error(
        "AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY are required for Amazon Transcribe",
      );
    this.s3 = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
    this.transcribe = new TranscribeClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async transcribeBatch(
    audio: Uint8Array,
    mimeType: string,
    options: TranscriptionOptions = {},
  ): Promise<TranscriptionResult> {
    const jobName = `scribe-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ext =
      mimeType.includes("mp4") || mimeType.includes("m4a")
        ? "mp4"
        : mimeType.includes("wav")
          ? "wav"
          : "webm";
    const key = `uploads/${jobName}.${ext}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: audio,
        ContentType: mimeType,
      }),
    );

    await this.transcribe.send(
      new StartTranscriptionJobCommand({
        TranscriptionJobName: jobName,
        IdentifyLanguage: true,
        MediaFormat: ext === "mp4" ? "mp4" : (ext as "wav" | "webm"),
        Media: { MediaFileUri: `s3://${this.bucket}/${key}` },
      }),
    );

    const result = await this.poll(jobName);
    const uri = result.Transcript?.TranscriptFileUri;
    if (!uri) throw new Error("Amazon Transcribe returned no transcript URI");
    const data = (await (await fetch(uri)).json()) as {
      results: { transcripts: { transcript: string }[] };
    };
    return {
      text: data.results.transcripts[0]?.transcript ?? "",
      detectedLanguage: result.LanguageCode,
      costLineItem: amazonCost(options),
    };
  }

  private async poll(jobName: string, timeoutMs = 120_000) {
    const start = Date.now();
    for (;;) {
      const { TranscriptionJob } = await this.transcribe.send(
        new GetTranscriptionJobCommand({ TranscriptionJobName: jobName }),
      );
      const status = TranscriptionJob?.TranscriptionJobStatus;
      if (status === "COMPLETED") return TranscriptionJob!;
      if (status === "FAILED")
        throw new Error(
          `Amazon Transcribe job failed: ${TranscriptionJob?.FailureReason}`,
        );
      if (Date.now() - start > timeoutMs)
        throw new Error("Amazon Transcribe job timed out");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

function amazonCost(options: TranscriptionOptions) {
  if (options.audioSeconds === undefined) return undefined;
  const pricing = PRICING_SNAPSHOT.amazon["aws-transcribe-standard"];
  return priceAudioSeconds({
    stage: "transcription",
    provider: "amazon",
    model: "aws-transcribe-standard",
    label: options.label ?? "Transcript",
    audioSeconds: options.audioSeconds,
    currency: pricing.currency,
    pricePerHour: pricing.pricePerHour,
    accuracy: "estimated",
  });
}
