import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { PrismaReportRepository } from "@/lib/adapters/repository/prisma-report-repository";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const repo = new PrismaReportRepository(prisma);
  const reports = await repo.list();

  return (
    <main className="clinical-shell clinical-flow">
      <div className="clinical-topbar">
        <div>
          <p className="clinical-kicker">Saved reports</p>
          <h1 className="clinical-page-title">History</h1>
        </div>
        <Link href="/" className="clinical-action">
          New consultation
        </Link>
      </div>
      {reports.length === 0 && (
        <p className="empty-state">No reports yet.</p>
      )}
      {reports.length > 0 && (
        <div className="history-panel">
          <ul className="history-list">
            {reports.map((r) => (
              <li key={r.id} className="history-row">
                <Link href={`/report/${r.id}`} className="history-link">
                  <span className="history-summary">
                    {r.content?.summary[0] ?? `(${r.status})`}
                  </span>
                  <span className="history-date">
                    {new Date(r.createdAt).toLocaleString("en-IN")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
