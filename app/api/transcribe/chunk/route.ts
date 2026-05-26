import { getTranscriptionProvider } from "@/lib/adapters/transcription/registry";
import { env } from "@/lib/config/env";
import type { ProviderId } from "@/lib/domain/report/schema";

export const dynamic = "force-dynamic";

const VALID: ProviderId[] = ["openai", "sarvam", "amazon"];

export async function POST(req: Request): Promise<Response> {
  const form = await req.formData();
  const chunk = form.get("chunk");
  if (!(chunk instanceof File)) {
    return new Response("chunk is required", { status: 400 });
  }

  const defaults = env();
  const requested = String(form.get("providerId") ?? defaults.DEFAULT_PROVIDER);
  const providerId = (
    VALID.includes(requested as ProviderId)
      ? requested
      : defaults.DEFAULT_PROVIDER
  ) as ProviderId;

  const audio = new Uint8Array(await chunk.arrayBuffer());
  const provider = getTranscriptionProvider(providerId);
  // Live segments are short (<=30s); prefer the low-latency real-time path when
  // a provider exposes one, otherwise fall back to its whole-file transcription.
  const transcribe = provider.transcribeChunk ?? provider.transcribeBatch;

  try {
    const result = await transcribe.call(
      provider,
      audio,
      chunk.type || "audio/webm",
    );
    return Response.json({
      text: result.text,
      detectedLanguage: result.detectedLanguage ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 502 });
  }
}
