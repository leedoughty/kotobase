import postgres from "postgres";

export type Db = ReturnType<typeof createDb>;

export function createDb() {
  return postgres(
    process.env.DATABASE_URL ??
      "postgres://postgres:postgres@127.0.0.1:54322/postgres",
  );
}

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
  }
}
