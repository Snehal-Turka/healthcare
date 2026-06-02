import type {
  ApiCost,
  ProviderId,
  ReportContent,
  ReportStatus,
  StageTimings,
} from "@/lib/domain/report/schema";

export type ReportRecord = {
  id: string;
  status: ReportStatus;
  providerId: ProviderId;
  audioRef: string;
  detectedLanguage: string | null;
  transcript: string | null;
  audioSeconds: number | null;
  content: ReportContent | null;
  freeVisitDeadline: string | null;
  medicineExpiryDate: string | null;
  stageTimings: StageTimings;
  apiCost: ApiCost | null;
  error: string | null;
  createdAt: string;
  generatedAt: string | null;
};

export type CreateReportInput = Pick<ReportRecord, "providerId" | "audioRef"> & {
  audioSeconds?: number | null;
};

export interface ReportRepository {
  create(input: CreateReportInput): Promise<ReportRecord>;
  update(id: string, patch: Partial<ReportRecord>): Promise<ReportRecord>;
  get(id: string): Promise<ReportRecord | null>;
  list(): Promise<ReportRecord[]>;
}
