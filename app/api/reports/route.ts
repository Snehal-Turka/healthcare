import { env } from "@/lib/config/env";
import type { ProviderId } from "@/lib/domain/report/schema";
import { runReportPipeline } from "@/lib/domain/pipeline/orchestrator";
import { productionDeps } from "@/lib/domain/pipeline/deps";
import { prisma } from "@/lib/db/prisma";
import { PrismaReportRepository } from "@/lib/adapters/repository/prisma-report-repository";

export const dynamic = "force-dynamic";

const VALID: ProviderId[] = ["openai", "sarvam", "amazon"];

export async function POST(req: Request): Promise<Response> {
  const form = await req.formData();
  const file = form.get("audio");
  if (!(file instanceof File))
    return new Response("audio file is required", { status: 400 });

  const requested = String(form.get("providerId") ?? env().DEFAULT_PROVIDER);
  const providerId = (
    VALID.includes(requested as ProviderId) ? requested : env().DEFAULT_PROVIDER
  ) as ProviderId;

  const audio = new Uint8Array(await file.arrayBuffer());
  const mimeType = file.type || "audio/webm";
  const transcriptField = form.get("transcript");
  const transcript =
    typeof transcriptField === "string" && transcriptField.trim().length > 0
      ? transcriptField
      : undefined;
  const deps = productionDeps();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runReportPipeline(
          { audio, mimeType, providerId, transcript },
          deps,
        )) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "error", reportId: null, message }) + "\n",
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(): Promise<Response> {
  const repo = new PrismaReportRepository(prisma);
  return Response.json(await repo.list());
}
