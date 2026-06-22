import type { FastifyInstance } from "fastify";
import { getEntry } from "../queries.ts";
import { Cache } from "../cache.ts";

const entryCache = new Cache<object>(1000, 60 * 60 * 1000); // 1000 entries, 1h TTL

const tags = { type: "array", items: { type: "string" } } as const;

const schema = {
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "integer" } },
  },
  response: {
    200: {
      type: "object",
      required: ["id", "kanji", "kana", "senses"],
      properties: {
        id: { type: "integer" },
        kanji: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              common: { type: "boolean" },
              tags,
            },
          },
        },
        kana: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              common: { type: "boolean" },
              tags,
              appliesToKanji: tags,
            },
          },
        },
        senses: {
          type: "array",
          items: {
            type: "object",
            properties: {
              partOfSpeech: tags,
              field: tags,
              misc: tags,
              dialect: tags,
              info: tags,
              glosses: tags,
            },
          },
        },
      },
    },
  },
};

export async function entryRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: number } }>(
    "/entry/:id",
    { schema },
    async (request, reply) => {
      const { id } = request.params;
      const key = String(id);

      const cached = entryCache.get(key);
      if (cached) {
        reply.header("x-cache", "HIT");
        return cached;
      }

      const [entry] = await getEntry(app.db, id);
      if (!entry) {
        return reply.code(404).send({ error: "entry not found" });
      }

      entryCache.set(key, entry);
      reply.header("x-cache", "MISS");
      return entry;
    },
  );
}
