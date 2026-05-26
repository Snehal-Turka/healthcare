import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { PrismaReportRepository } from "@/lib/adapters/repository/prisma-report-repository";
import { LocalStorage } from "@/lib/adapters/storage/local-storage";
import { getTranscriptionProvider } from "@/lib/adapters/transcription/registry";
import { getReportGenerator } from "@/lib/adapters/generation/registry";
import type { PipelineDeps } from "./orchestrator";

export function productionDeps(): PipelineDeps {
  return {
    repo: new PrismaReportRepository(prisma),
    storage: new LocalStorage(env().STORAGE_DIR),
    getProvider: (id) => getTranscriptionProvider(id),
    generator: getReportGenerator(),
  };
}
