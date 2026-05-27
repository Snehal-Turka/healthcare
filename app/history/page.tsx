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
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New consultation
        </Link>
      </div>
      {reports.length === 0 && (
        <p className="empty-state">
          No reports yet. Start a new consultation to see your history here.
        </p>
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
