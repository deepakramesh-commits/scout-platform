import postgres from "postgres";

const g = globalThis as unknown as { sql?: postgres.Sql };

export const sql = (g.sql ??= postgres(
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:54330/postgres",
));
