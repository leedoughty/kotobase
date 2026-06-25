import postgres from "postgres";

const LOCAL_URL = "postgres://postgres:postgres@127.0.0.1:54322/postgres";

// One connection factory for both the loader and the API. SSL is required for
// remote hosts (e.g. Supabase) but off for the local Docker Postgres.
export function connect(url: string = process.env.DATABASE_URL ?? LOCAL_URL) {
  const local = /localhost|127\.0\.0\.1|host\.docker\.internal/.test(url);
  return postgres(url, local ? {} : { ssl: "require" });
}
