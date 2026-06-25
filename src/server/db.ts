import { connect } from "../db.ts";

export type Db = ReturnType<typeof connect>;

export function createDb(): Db {
  return connect();
}

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
  }
}
