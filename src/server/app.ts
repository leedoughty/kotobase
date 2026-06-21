import Fastify from "fastify";
import { createDb } from "./db.ts";
import { searchRoutes } from "./routes/search.ts";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.decorate("db", createDb());
  app.addHook("onClose", async (instance) => {
    await instance.db.end();
  });

  app.register(searchRoutes);

  return app;
}
