import type { FastifyInstance } from "fastify";
import { examplesForWord } from "../queries.ts";
import { Cache } from "../cache.ts";

const exampleCache = new Cache<object[]>(1000, 60 * 60 * 1000); // 1000 queries, 1h TTL

const schema = {
  querystring: {
    type: "object",
    required: ["q"],
    properties: {
      q: { type: "string", minLength: 1 },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
    },
  },
  response: {
    200: {
      type: "array",
      items: {
        type: "object",
        required: ["japanese", "entryId"],
        properties: {
          japanese: { type: "string" },
          english: { type: ["string", "null"] },
          entryId: { type: "integer" },
        },
      },
    },
  },
};

interface ExamplesQuery {
  q: string;
  limit: number;
}

export async function exampleRoutes(app: FastifyInstance) {
  app.get<{ Querystring: ExamplesQuery }>(
    "/examples",
    { schema },
    async (request, reply) => {
      const { q, limit } = request.query;
      const key = `${q} ${limit}`;

      const cached = exampleCache.get(key);
      if (cached) {
        reply.header("x-cache", "HIT");
        return cached;
      }

      const rows = await examplesForWord(app.db, q, limit);
      const result = [...rows];
      exampleCache.set(key, result);
      reply.header("x-cache", "MISS");
      return result;
    },
  );
}
