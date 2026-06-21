import type { FastifyInstance } from "fastify";
import { isJapanese, searchByHeadword, searchByMeaning } from "../queries.ts";

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
        required: ["id", "reading", "gloss", "common"],
        properties: {
          id: { type: "integer" },
          kanji: { type: ["string", "null"] },
          reading: { type: "string" },
          gloss: { type: "string" },
          common: { type: "boolean" },
        },
      },
    },
  },
};

interface SearchQuery {
  q: string;
  limit: number;
}

export async function searchRoutes(app: FastifyInstance) {
  app.get<{ Querystring: SearchQuery }>("/search", { schema }, (request) => {
    const { q, limit } = request.query;
    return isJapanese(q)
      ? searchByHeadword(app.db, q, limit)
      : searchByMeaning(app.db, q, limit);
  });
}
