# Phase 1 — Foundation, Domain & Persistence — ✅ COMPLETE

> **Status:** Done (2026-05-25). All 5 test suites (12 tests) green, migration applied, domain layer pure.

**Goal:** Establish the pure domain core (types, deadline rules), the database, and the storage + repository abstractions — all unit-tested, with no external APIs and no UI.

**Architecture:** A framework-free domain layer (`lib/domain`) holds the report schema (zod) and the computed business rules. Persistence is hidden behind a `ReportRepository` interface (Prisma/SQLite impl) and a `Storage` interface (local filesystem impl), so the rest of the app depends on interfaces, not on Prisma or `fs`.

**Tech Stack:** TypeScript, Vitest, Zod, Prisma 7 + SQLite (via `@prisma/adapter-better-sqlite3`). Import alias `@/*` → repo root. Package manager: yarn.

> **Prisma 7 migration notes (deviations from original plan):**
> - `datasource.url` in `schema.prisma` is no longer supported — moved to `prisma.config.ts` using `defineConfig`/`env` from `prisma/config`.
> - `PrismaClient` constructor no longer accepts `datasources` — use a driver adapter (`PrismaBetterSqlite3` from `@prisma/adapter-better-sqlite3`).
> - `prisma db push --skip-generate` flag removed — use `--url` to override the datasource URL.
> - `vite-tsconfig-paths` plugin deprecated — Vite now supports `resolve.tsconfigPaths: true` natively.
> - `loadEnv` singleton (`env`) made lazy (function instead of const) to avoid crashing at import time when `DATABASE_URL` is absent (e.g. in tests that call `loadEnv` directly).

---

## File structure introduced in this phase

```
vitest.config.ts                                  # test runner (native tsconfigPaths)
prisma.config.ts                                  # Prisma 7 config (datasource URL via env)
lib/config/env.ts                                 # zod-validated env (lazy singleton)
lib/db/prisma.ts                                  # PrismaClient singleton (better-sqlite3 adapter)
lib/domain/report/schema.ts                       # zod schema + exported types (the locked types)
lib/domain/report/rules.ts                        # computeFreeVisitDeadline / computeMedicineExpiry
lib/adapters/storage/storage.ts                   # Storage interface
lib/adapters/storage/local-storage.ts             # filesystem impl
lib/adapters/repository/report-repository.ts      # ReportRepository interface + ReportRecord type
lib/adapters/repository/prisma-report-repository.ts
prisma/schema.prisma
.env.example
```

> **Note on the locked types:** `freeVisitDeadline` / `medicineExpiryDate` are **nullable** (`string | null`) — they are computed at the _finalize_ stage (Phase 3), so they are `null` while a report is `processing`.

---

### Task 1: Install deps and configure Vitest

**Files:**

- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install dependencies**

```bash
yarn add zod @prisma/client
yarn add -D vitest vite-tsconfig-paths prisma
```

- [ ] **Step 2: Add the test script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`**

`vite-tsconfig-paths` makes the `@/*` alias resolve in tests.

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Verify the runner works**

Run: `yarn test`
Expected: exits 0 with "No test files found" (no tests yet).

---

### Task 2: Report schema and types (the locked contract)

**Files:**

- Create: `lib/domain/report/schema.ts`
- Test: `lib/domain/report/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/domain/report/schema.test.ts
import { describe, it, expect } from "vitest";
import { ReportContentSchema } from "@/lib/domain/report/schema";

describe("ReportContentSchema", () => {
  it("parses a valid report content object", () => {
    const input = {
      riskFlags: [
        {
          category: "suicidal-ideation",
          quote: "I feel hopeless",
          note: "Assess risk",
        },
      ],
      summary: ["Patient reports low mood for 3 weeks"],
      medications: [
        {
          medicine: "Sertraline",
          dose: "50mg",
          timing: { morning: true, afternoon: false, night: false },
          duration: "4 weeks",
        },
      ],
      nextMeeting: {
        agenda: "Review response",
        suggestedAt: "2026-06-10T10:00:00.000Z",
      },
    };
    const parsed = ReportContentSchema.parse(input);
    expect(parsed.medications[0].medicine).toBe("Sertraline");
    expect(parsed.nextMeeting?.agenda).toBe("Review response");
  });

  it("allows nextMeeting to be null", () => {
    const parsed = ReportContentSchema.parse({
      riskFlags: [],
      summary: [],
      medications: [],
      nextMeeting: null,
    });
    expect(parsed.nextMeeting).toBeNull();
  });

  it("rejects an unknown risk category", () => {
    expect(() =>
      ReportContentSchema.parse({
        riskFlags: [{ category: "banana", quote: "", note: "" }],
        summary: [],
        medications: [],
        nextMeeting: null,
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `yarn vitest run lib/domain/report/schema.test.ts`
Expected: FAIL — cannot import `ReportContentSchema`.

- [ ] **Step 3: Implement the schema**

```ts
// lib/domain/report/schema.ts
import { z } from "zod";

export const RiskFlagSchema = z.object({
  category: z.enum(["self-harm", "suicidal-ideation", "crisis", "other"]),
  quote: z.string(),
  note: z.string(),
});

export const TimingSchema = z.object({
  morning: z.boolean(),
  afternoon: z.boolean(),
  night: z.boolean(),
  custom: z.string().optional(),
});

export const MedicationSchema = z.object({
  medicine: z.string(),
  dose: z.string(),
  timing: TimingSchema,
  duration: z.string(),
});

export const NextMeetingSchema = z
  .object({ agenda: z.string(), suggestedAt: z.string().nullable() })
  .nullable();

export const ReportContentSchema = z.object({
  riskFlags: z.array(RiskFlagSchema),
  summary: z.array(z.string()),
  medications: z.array(MedicationSchema),
  nextMeeting: NextMeetingSchema,
});

export type RiskFlag = z.infer<typeof RiskFlagSchema>;
export type Timing = z.infer<typeof TimingSchema>;
export type Medication = z.infer<typeof MedicationSchema>;
export type NextMeeting = z.infer<typeof NextMeetingSchema>;
export type ReportContent = z.infer<typeof ReportContentSchema>;

export type ReportStatus = "processing" | "ready" | "failed";
export type ProviderId = "openai" | "sarvam" | "amazon";
export type StageTimings = {
  ingestMs?: number;
  transcribeMs?: number;
  generateMs?: number;
};
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `yarn vitest run lib/domain/report/schema.test.ts`
Expected: PASS (3 tests).

---

### Task 3: Deadline rules (the "no AI" computed sections)

**Files:**

- Create: `lib/domain/report/rules.ts`
- Test: `lib/domain/report/rules.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/domain/report/rules.test.ts
import { describe, it, expect } from "vitest";
import {
  computeFreeVisitDeadline,
  computeMedicineExpiry,
} from "@/lib/domain/report/rules";

describe("deadline rules", () => {
  it("free-visit deadline is 3 days after generation", () => {
    const gen = new Date("2026-05-25T09:00:00.000Z");
    expect(computeFreeVisitDeadline(gen).toISOString()).toBe(
      "2026-05-28T09:00:00.000Z",
    );
  });

  it("medicine expiry is 2 months after generation", () => {
    const gen = new Date("2026-05-25T09:00:00.000Z");
    expect(computeMedicineExpiry(gen).toISOString()).toBe(
      "2026-07-25T09:00:00.000Z",
    );
  });

  it("medicine expiry clamps month-end overflow (Jan 31 -> Mar 31, not slip into May)", () => {
    const gen = new Date("2026-01-31T00:00:00.000Z");
    // +2 months from Jan 31; March has 31 days so this stays Mar 31.
    expect(computeMedicineExpiry(gen).toISOString()).toBe(
      "2026-03-31T00:00:00.000Z",
    );
  });

  it("medicine expiry clamps when target month is shorter (Dec 31 -> Feb 28)", () => {
    const gen = new Date("2025-12-31T00:00:00.000Z");
    expect(computeMedicineExpiry(gen).toISOString()).toBe(
      "2026-02-28T00:00:00.000Z",
    );
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `yarn vitest run lib/domain/report/rules.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the rules**

`addMonthsClamped` avoids JS `setMonth` rollover (e.g., Dec 31 + 2 → would become Mar 3); it clamps to the last valid day of the target month.

```ts
// lib/domain/report/rules.ts
export const FREE_VISIT_DAYS = 3;
export const MEDICINE_EXPIRY_MONTHS = 2;

export function computeFreeVisitDeadline(generatedAt: Date): Date {
  const d = new Date(generatedAt);
  d.setUTCDate(d.getUTCDate() + FREE_VISIT_DAYS);
  return d;
}

export function computeMedicineExpiry(generatedAt: Date): Date {
  return addMonthsClamped(generatedAt, MEDICINE_EXPIRY_MONTHS);
}

function addMonthsClamped(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1); // avoid rollover while changing the month
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `yarn vitest run lib/domain/report/rules.test.ts`
Expected: PASS (4 tests).

---

### Task 4: Typed environment config

**Files:**

- Create: `lib/config/env.ts`
- Create: `.env.example`
- Test: `lib/config/env.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/config/env.test.ts
import { describe, it, expect } from "vitest";
import { loadEnv } from "@/lib/config/env";

describe("loadEnv", () => {
  it("defaults DEFAULT_PROVIDER to openai and STORAGE_DIR to .data/audio", () => {
    const env = loadEnv({ DATABASE_URL: "file:./dev.db" });
    expect(env.DEFAULT_PROVIDER).toBe("openai");
    expect(env.STORAGE_DIR).toBe(".data/audio");
  });

  it("rejects an invalid DEFAULT_PROVIDER", () => {
    expect(() =>
      loadEnv({ DATABASE_URL: "file:./dev.db", DEFAULT_PROVIDER: "nope" }),
    ).toThrow();
  });

  it("requires DATABASE_URL", () => {
    expect(() => loadEnv({})).toThrow();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `yarn vitest run lib/config/env.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `loadEnv` + a process-backed singleton**

`loadEnv` takes a record so it is testable; `env` is the app-wide instance read from `process.env`.

```ts
// lib/config/env.ts
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DEFAULT_PROVIDER: z.enum(["openai", "sarvam", "amazon"]).default("openai"),
  STORAGE_DIR: z.string().default(".data/audio"),
  OPENAI_API_KEY: z.string().optional(),
  SARVAM_API_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: Record<string, string | undefined>): Env {
  return EnvSchema.parse(source);
}

export const env: Env = loadEnv(process.env);
```

- [ ] **Step 4: Create `.env.example`**

```bash
# .env.example
DATABASE_URL="file:./dev.db"
DEFAULT_PROVIDER="openai"     # openai | sarvam | amazon
STORAGE_DIR=".data/audio"
OPENAI_API_KEY=""
SARVAM_API_KEY=""
AWS_REGION="ap-south-1"       # Mumbai
AWS_S3_BUCKET=""
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `yarn vitest run lib/config/env.test.ts`
Expected: PASS (3 tests). Note: importing `env` requires `DATABASE_URL` in the real environment; the test calls `loadEnv` directly so it does not depend on `process.env`.

---

### Task 5: Prisma schema, migration, and client singleton

**Files:**

- Create: `prisma/schema.prisma`
- Create: `lib/db/prisma.ts`
- Modify: `.gitignore` (ignore `*.db`, `.data/`)

- [ ] **Step 1: Write the Prisma schema**

Complex fields are stored as JSON **strings** (version-safe on SQLite); the repository (Task 7) (de)serializes them. Deadlines are nullable (set at finalize).

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Report {
  id                 String    @id @default(cuid())
  status             String    @default("processing") // processing | ready | failed
  providerId         String
  audioRef           String
  detectedLanguage   String?
  transcript         String?
  content            String?   // JSON-serialized ReportContent
  freeVisitDeadline  DateTime?
  medicineExpiryDate DateTime?
  stageTimings       String    @default("{}") // JSON-serialized StageTimings
  error              String?
  createdAt          DateTime  @default(now())
  generatedAt        DateTime?
}
```

- [ ] **Step 2: Set DATABASE_URL and create the migration**

```bash
echo 'DATABASE_URL="file:./dev.db"' >> .env
npx prisma migrate dev --name init
```

Expected: creates `prisma/migrations/**/migration.sql` and generates the client. (If `prisma migrate` prompts for the schema location it is `prisma/schema.prisma`.)

- [ ] **Step 3: Add the client singleton**

Avoids exhausting connections during dev hot-reload.

```ts
// lib/db/prisma.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 4: Ignore local DB + audio artifacts**

Append to `.gitignore`:

```
# local data
*.db
*.db-journal
.data/
```

---

### Task 6: Storage interface + local filesystem implementation

**Files:**

- Create: `lib/adapters/storage/storage.ts`
- Create: `lib/adapters/storage/local-storage.ts`
- Test: `lib/adapters/storage/local-storage.test.ts`

- [ ] **Step 1: Define the interface**

```ts
// lib/adapters/storage/storage.ts
export interface Storage {
  /** Persists bytes under `key`; returns an opaque ref used by load(). */
  save(key: string, data: Uint8Array, contentType: string): Promise<string>;
  load(ref: string): Promise<Uint8Array>;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/adapters/storage/local-storage.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { rm } from "node:fs/promises";
import { LocalStorage } from "@/lib/adapters/storage/local-storage";

const dir = ".data/test-audio";
const storage = new LocalStorage(dir);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("LocalStorage", () => {
  it("round-trips bytes", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const ref = await storage.save(
      "clip.bin",
      bytes,
      "application/octet-stream",
    );
    const loaded = await storage.load(ref);
    expect(Array.from(loaded)).toEqual([1, 2, 3, 4]);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `yarn vitest run lib/adapters/storage/local-storage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `LocalStorage`**

Returns a `local:<relativePath>` ref so refs are portable and `load` is unambiguous.

```ts
// lib/adapters/storage/local-storage.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Storage } from "./storage";

export class LocalStorage implements Storage {
  constructor(private readonly baseDir: string) {}

  async save(
    key: string,
    data: Uint8Array,
    _contentType: string,
  ): Promise<string> {
    const filePath = join(this.baseDir, key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
    return `local:${filePath}`;
  }

  async load(ref: string): Promise<Uint8Array> {
    const filePath = ref.startsWith("local:")
      ? ref.slice("local:".length)
      : ref;
    return new Uint8Array(await readFile(filePath));
  }
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `yarn vitest run lib/adapters/storage/local-storage.test.ts`
Expected: PASS.

---

### Task 7: Report repository interface + Prisma implementation

**Files:**

- Create: `lib/adapters/repository/report-repository.ts`
- Create: `lib/adapters/repository/prisma-report-repository.ts`
- Test: `lib/adapters/repository/prisma-report-repository.test.ts`

- [ ] **Step 1: Define `ReportRecord` and the repository interface**

```ts
// lib/adapters/repository/report-repository.ts
import type {
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
  content: ReportContent | null;
  freeVisitDeadline: string | null; // ISO; computed at finalize
  medicineExpiryDate: string | null; // ISO; computed at finalize
  stageTimings: StageTimings;
  error: string | null;
  createdAt: string; // ISO
  generatedAt: string | null; // ISO
};

export type CreateReportInput = Pick<ReportRecord, "providerId" | "audioRef">;

export interface ReportRepository {
  create(input: CreateReportInput): Promise<ReportRecord>;
  update(id: string, patch: Partial<ReportRecord>): Promise<ReportRecord>;
  get(id: string): Promise<ReportRecord | null>;
  list(): Promise<ReportRecord[]>;
}
```

- [ ] **Step 2: Write the failing integration test**

Uses a temp SQLite file so it never touches `dev.db`.

```ts
// lib/adapters/repository/prisma-report-repository.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { PrismaReportRepository } from "@/lib/adapters/repository/prisma-report-repository";

const url = "file:./test-repo.db";
let prisma: PrismaClient;
let repo: PrismaReportRepository;

beforeAll(() => {
  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
  });
  prisma = new PrismaClient({ datasources: { db: { url } } });
  repo = new PrismaReportRepository(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
  await rm("./prisma/test-repo.db", { force: true });
  await rm("./test-repo.db", { force: true });
});

describe("PrismaReportRepository", () => {
  it("creates, updates, gets, and lists", async () => {
    const created = await repo.create({
      providerId: "openai",
      audioRef: "local:.data/x.webm",
    });
    expect(created.status).toBe("processing");
    expect(created.content).toBeNull();

    const updated = await repo.update(created.id, {
      status: "ready",
      transcript: "hello",
      content: {
        riskFlags: [],
        summary: ["a"],
        medications: [],
        nextMeeting: null,
      },
      freeVisitDeadline: "2026-05-28T09:00:00.000Z",
      stageTimings: { transcribeMs: 120 },
      generatedAt: "2026-05-25T09:00:00.000Z",
    });
    expect(updated.status).toBe("ready");
    expect(updated.content?.summary).toEqual(["a"]);
    expect(updated.stageTimings.transcribeMs).toBe(120);

    const fetched = await repo.get(created.id);
    expect(fetched?.transcript).toBe("hello");

    const all = await repo.list();
    expect(all.length).toBe(1);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `yarn vitest run lib/adapters/repository/prisma-report-repository.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the Prisma repository**

JSON (de)serialization happens here, at the persistence boundary; the rest of the app sees typed objects.

```ts
// lib/adapters/repository/prisma-report-repository.ts
import type { PrismaClient } from "@prisma/client";
import type {
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
  if (patch.error !== undefined) data.error = patch.error;
  if (patch.generatedAt !== undefined)
    data.generatedAt = patch.generatedAt ? new Date(patch.generatedAt) : null;
  return data;
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `yarn vitest run lib/adapters/repository/prisma-report-repository.test.ts`
Expected: PASS.

---

## Phase verification

- [x] `yarn test` — all 5 suites green, 12 tests pass (schema 3, rules 4, env 3, storage 1, repository 1).
- [x] `npx prisma migrate status` — migration `20260525094538_init` applied, schema up to date.
- [x] No `lib/domain/**` file imports Prisma, `fs`, or any SDK (domain stays pure).

## Definition of done

The locked types exist and are exported from `lib/domain/report/schema.ts`; deadline math is proven (incl. month-end edges); a `ReportRepository` and a `Storage` implementation persist and reload records/bytes. No external APIs, no UI. **Ready for Phase 2.**
