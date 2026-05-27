import type { ApiCost as ApiCostRecord } from "@/lib/domain/report/schema";
import {
  formatApiCostTotal,
  summarizeApiCost,
} from "@/lib/domain/report/api-cost";

const STAGE_LABELS = {
  transcription: "Transcript",
  report_generation: "Report",
} as const;

export function ApiCost({ cost }: { cost: ApiCostRecord | null }) {
  if (!cost || cost.lineItems.length === 0) return null;
  const summary = summarizeApiCost(cost);

  return (
    <div className="api-cost-strip print:hidden">
      <span className="api-cost-total">
        API cost: {formatApiCostTotal(cost)}
      </span>
      {summary.map((item) => (
        <span key={item.stage} className="api-cost-chip">
          {STAGE_LABELS[item.stage]}: {item.formatted}
        </span>
      ))}
    </div>
  );
}
