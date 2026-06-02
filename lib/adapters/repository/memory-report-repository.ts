import { randomUUID } from "node:crypto";
import type {
  CreateReportInput,
  ReportRecord,
  ReportRepository,
} from "./report-repository";

export class MemoryReportRepository implements ReportRepository {
  private readonly store = new Map<string, ReportRecord>();

  async create(input: CreateReportInput): Promise<ReportRecord> {
    const now = new Date().toISOString();
    const record: ReportRecord = {
      id: randomUUID(),
      status: "processing",
      providerId: input.providerId,
      audioRef: input.audioRef,
      detectedLanguage: null,
      transcript: null,
      audioSeconds: input.audioSeconds ?? null,
      content: null,
      freeVisitDeadline: null,
      medicineExpiryDate: null,
      stageTimings: {},
      apiCost: null,
      error: null,
      createdAt: now,
      generatedAt: null,
    };
    this.store.set(record.id, record);
    return record;
  }

  async update(
    id: string,
    patch: Partial<ReportRecord>,
  ): Promise<ReportRecord> {
    const current = this.store.get(id);
    if (!current) throw new Error(`Report not found: ${id}`);
    const next = { ...current, ...patch, id: current.id };
    this.store.set(id, next);
    return next;
  }

  async get(id: string): Promise<ReportRecord | null> {
    return this.store.get(id) ?? null;
  }

  async list(): Promise<ReportRecord[]> {
    return [...this.store.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }
}
