import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { PrismaReportRepository } from "@/lib/adapters/repository/prisma-report-repository";
import { ReportView } from "@/components/report/ReportView";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repo = new PrismaReportRepository(prisma);
  const report = await repo.get(id);
  if (!report) notFound();

  return (
    <main className="clinical-shell clinical-flow">
      <Link href="/history" className="back-link">
        ← History
      </Link>
      <ReportView report={report} />
    </main>
  );
}
