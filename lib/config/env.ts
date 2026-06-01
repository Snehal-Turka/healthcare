import { z } from "zod";

const PostgresUrl = z
  .string()
  .min(1)
  .refine(
    (value) =>
      value.startsWith("postgres://") || value.startsWith("postgresql://"),
    "Must be a Postgres connection string.",
  );

const EnvSchema = z.object({
  DATABASE_URL: PostgresUrl,
  DIRECT_URL: PostgresUrl.optional(),
  DEFAULT_PROVIDER: z.enum(["openai", "sarvam", "amazon"]).default("openai"),
  STORAGE_DIR: z.string().default(".data/audio"),
  OPENAI_API_KEY: z.string().optional(),
  SARVAM_API_KEY: z.string().optional(),
  HC_AWS_REGION: z.string().optional(),
  HC_AWS_S3_BUCKET: z.string().optional(),
  HC_AWS_ACCESS_KEY_ID: z.string().optional(),
  HC_AWS_SECRET_ACCESS_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: Record<string, string | undefined>): Env {
  return EnvSchema.parse(source);
}

let _env: Env | undefined;
export function env(): Env {
  if (!_env) _env = loadEnv(process.env);
  return _env;
}
