const POSTGRES_SCHEMES = ["postgres://", "postgresql://"];

function assertPostgresUrl(name: string, value: string) {
  if (!POSTGRES_SCHEMES.some((scheme) => value.startsWith(scheme))) {
    throw new Error(`${name} must be a Postgres connection string.`);
  }
}

export function resolveDatabaseUrl(
  source: Record<string, string | undefined> = process.env,
) {
  const url = source.DATABASE_URL?.trim();

  if (!url) {
    throw new Error("DATABASE_URL is required.");
  }

  assertPostgresUrl("DATABASE_URL", url);
  return url;
}

export function resolveMigrationDatabaseUrl(
  source: Record<string, string | undefined> = process.env,
) {
  const url = source.DIRECT_URL?.trim() || resolveDatabaseUrl(source);

  assertPostgresUrl(
    source.DIRECT_URL?.trim() ? "DIRECT_URL" : "DATABASE_URL",
    url,
  );
  return url;
}
