import { prisma } from "@/lib/db/prisma";
import { PrismaReportRepository } from "@/lib/adapters/repository/prisma-report-repository";
import { ReportContentSchema } from "@/lib/domain/report/schema";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/reports/[id]">,
): Promise<Response> {
  const { id } = await ctx.params;
  const repo = new PrismaReportRepository(prisma);
  const report = await repo.get(id);
  if (!report) return new Response("not found", { status: 404 });
  return Response.json(report);
}

export async function PATCH(
  req: Request,
  ctx: RouteContext<"/api/reports/[id]">,
): Promise<Response> {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("invalid JSON body", { status: 400 });
  }

  const parsed = ReportContentSchema.safeParse(
    (body as { content?: unknown })?.content,
  );
  if (!parsed.success) {
    return Response.json(
      { error: "invalid report content", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const repo = new PrismaReportRepository(prisma);
  const existing = await repo.get(id);
  if (!existing) return new Response("not found", { status: 404 });

  const updated = await repo.update(id, { content: parsed.data });
  return Response.json(updated);
}
