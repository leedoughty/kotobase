import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { createDb } from "./db.ts";
import { searchRoutes } from "./routes/search.ts";
import { entryRoutes } from "./routes/entry.ts";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.decorate("db", createDb());
  app.addHook("onClose", async (instance) => {
    await instance.db.end();
  });

  app.register(rateLimit, { max: 60, timeWindow: "1 minute" });
  app.register(searchRoutes);
  app.register(entryRoutes);

  return app;
}
