import postgres from "postgres";

const g = globalThis as unknown as { serviceSql?: postgres.Sql };

// Superuser: bypasses row-level security. Only lib/auth.ts and webhooks may use it; pages read through db().
export const serviceSql = (g.serviceSql ??= postgres(
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:54330/postgres",
));
