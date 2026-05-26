-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "providerId" TEXT NOT NULL,
    "audioRef" TEXT NOT NULL,
    "detectedLanguage" TEXT,
    "transcript" TEXT,
    "content" TEXT,
    "freeVisitDeadline" DATETIME,
    "medicineExpiryDate" DATETIME,
    "stageTimings" TEXT NOT NULL DEFAULT '{}',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedAt" DATETIME
);
