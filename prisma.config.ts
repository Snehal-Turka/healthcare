import "dotenv/config";
import { defineConfig } from "prisma/config";
import { resolveMigrationDatabaseUrl } from "./lib/db/database-url";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: resolveMigrationDatabaseUrl(),
  },
});
