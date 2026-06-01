-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "providerId" TEXT NOT NULL,
    "audioRef" TEXT NOT NULL,
    "detectedLanguage" TEXT,
    "transcript" TEXT,
    "content" TEXT,
    "freeVisitDeadline" TIMESTAMP(3),
    "medicineExpiryDate" TIMESTAMP(3),
    "stageTimings" TEXT NOT NULL DEFAULT '{}',
    "apiCost" TEXT NOT NULL DEFAULT '{}',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedAt" TIMESTAMP(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);
