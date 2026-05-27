import type { PrismaClient } from "@prisma/client";
import type {
  ApiCost,
  ProviderId,
  ReportContent,
  ReportStatus,
  StageTimings,
} from "@/lib/domain/report/schema";
import type {
  CreateReportInput,
  ReportRecord,
  ReportRepository,
} from "./report-repository";

type Row = {
  id: string;
  status: string;
  providerId: string;
  audioRef: string;
  detectedLanguage: string | null;
  transcript: string | null;
  content: string | null;
  freeVisitDeadline: Date | null;
  medicineExpiryDate: Date | null;
  stageTimings: string;
  apiCost?: string | null;
  error: string | null;
  createdAt: Date;
  generatedAt: Date | null;
};

export class PrismaReportRepository implements ReportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateReportInput): Promise<ReportRecord> {
    const row = await this.prisma.report.create({
      data: { providerId: input.providerId, audioRef: input.audioRef },
    });
    return toRecord(row as Row);
  }

  async update(
    id: string,
    patch: Partial<ReportRecord>,
  ): Promise<ReportRecord> {
    const row = await this.prisma.report.update({
      where: { id },
      data: toData(patch),
    });
    return toRecord(row as Row);
  }

  async get(id: string): Promise<ReportRecord | null> {
    const row = await this.prisma.report.findUnique({ where: { id } });
    return row ? toRecord(row as Row) : null;
  }

  async list(): Promise<ReportRecord[]> {
    const rows = await this.prisma.report.findMany({
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => toRecord(r as Row));
  }
}

function toRecord(row: Row): ReportRecord {
  return {
    id: row.id,
    status: row.status as ReportStatus,
    providerId: row.providerId as ProviderId,
    audioRef: row.audioRef,
    detectedLanguage: row.detectedLanguage,
    transcript: row.transcript,
    content: row.content ? (JSON.parse(row.content) as ReportContent) : null,
    freeVisitDeadline: row.freeVisitDeadline
      ? row.freeVisitDeadline.toISOString()
      : null,
    medicineExpiryDate: row.medicineExpiryDate
      ? row.medicineExpiryDate.toISOString()
      : null,
    stageTimings: JSON.parse(row.stageTimings) as StageTimings,
    apiCost: parseApiCost(row.apiCost),
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    generatedAt: row.generatedAt ? row.generatedAt.toISOString() : null,
  };
}

function toData(patch: Partial<ReportRecord>) {
  const data: Record<string, unknown> = {};
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.providerId !== undefined) data.providerId = patch.providerId;
  if (patch.audioRef !== undefined) data.audioRef = patch.audioRef;
  if (patch.detectedLanguage !== undefined)
    data.detectedLanguage = patch.detectedLanguage;
  if (patch.transcript !== undefined) data.transcript = patch.transcript;
  if (patch.content !== undefined)
    data.content = patch.content ? JSON.stringify(patch.content) : null;
  if (patch.freeVisitDeadline !== undefined)
    data.freeVisitDeadline = patch.freeVisitDeadline
      ? new Date(patch.freeVisitDeadline)
      : null;
  if (patch.medicineExpiryDate !== undefined)
    data.medicineExpiryDate = patch.medicineExpiryDate
      ? new Date(patch.medicineExpiryDate)
      : null;
  if (patch.stageTimings !== undefined)
    data.stageTimings = JSON.stringify(patch.stageTimings);
  if (patch.apiCost !== undefined)
    data.apiCost = patch.apiCost ? JSON.stringify(patch.apiCost) : "{}";
  if (patch.error !== undefined) data.error = patch.error;
  if (patch.generatedAt !== undefined)
    data.generatedAt = patch.generatedAt ? new Date(patch.generatedAt) : null;
  return data;
}

export function parseApiCost(raw: string | null | undefined): ApiCost | null {
  if (!raw || raw === "undefined") return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ApiCost>;
    return Array.isArray(parsed.lineItems) ? (parsed as ApiCost) : null;
  } catch {
    return null;
  }
}
