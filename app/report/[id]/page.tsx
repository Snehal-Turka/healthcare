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
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        History
      </Link>
      <ReportView report={report} />
    </main>
  );
}
