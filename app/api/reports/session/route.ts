import { env } from "@/lib/config/env";
import type { ProviderId } from "@/lib/domain/report/schema";
import { prisma } from "@/lib/db/prisma";
import { PrismaReportRepository } from "@/lib/adapters/repository/prisma-report-repository";

export const dynamic = "force-dynamic";

const VALID: ProviderId[] = ["openai", "sarvam", "amazon"];

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    providerId?: string;
  };
  const requested = String(body.providerId ?? env().DEFAULT_PROVIDER);
  const providerId = (
    VALID.includes(requested as ProviderId) ? requested : env().DEFAULT_PROVIDER
  ) as ProviderId;
  const repo = new PrismaReportRepository(prisma);
  const report = await repo.create({
    providerId,
    audioRef: "pending:live",
  });

  return Response.json({ reportId: report.id });
}
