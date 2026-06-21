import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import type { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { chain } from "stream-chain";
import { parser } from "stream-json";
import { pick } from "stream-json/filters/pick.js";
import { streamArray } from "stream-json/streamers/stream-array.js";
import { streamValues } from "stream-json/streamers/stream-values.js";
import type { JMdictWord } from "./jmdict.ts";

const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));
const STAGE_DIR = `${DATA_DIR}copy/`;
const DB_URL =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:54322/postgres";

const COLUMNS = {
  entry: ["id"],
  kanji: ["id", "entry_id", "position", "text", "common", "tags"],
  kana: [
    "id",
    "entry_id",
    "position",
    "text",
    "common",
    "tags",
    "applies_to_kanji",
  ],
  sense: [
    "id",
    "entry_id",
    "position",
    "part_of_speech",
    "field",
    "misc",
    "dialect",
    "info",
    "applies_to_kanji",
    "applies_to_kana",
  ],
  gloss: ["id", "sense_id", "position", "lang", "text", "type", "gender"],
} as const;

type Cell = string | number | boolean | string[] | null | undefined;

function enc(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function encArray(a: string[]): string {
  const lit = a.length
    ? "{" +
      a
        .map((e) => `"${e.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
        .join(",") +
      "}"
    : "{}";
  return enc(lit);
}

function encodeCell(v: Cell): string {
  if (v == null) return "\\N";
  if (typeof v === "boolean") return v ? "t" : "f";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return encArray(v);
  return enc(v);
}

async function writeLine(stream: Writable, line: string): Promise<void> {
  if (!stream.write(line)) await once(stream, "drain");
}

function writer(name: keyof typeof COLUMNS) {
  const stream = createWriteStream(`${STAGE_DIR}${name}.tsv`);
  let n = 0;
  return {
    count: () => n,
    async push(...cells: Cell[]): Promise<number> {
      const id = ++n;
      await writeLine(stream, [id, ...cells].map(encodeCell).join("\t") + "\n");
      return id;
    },
    async close(): Promise<void> {
      stream.end();
      await once(stream, "finish");
    },
  };
}

function checkTags(
  codes: string[],
  tags: Record<string, string>,
  ctx: string,
): void {
  for (const c of codes) {
    if (!(c in tags)) throw new Error(`unknown tag code "${c}" (${ctx})`);
  }
}

async function findJson(): Promise<string> {
  const files = await readdir(DATA_DIR);
  const name = files.find((f) => /^jmdict-eng-.*\.json$/.test(f));
  if (!name) {
    throw new Error(
      "no jmdict-eng JSON in data/ — run `pnpm data:download` first",
    );
  }
  return `${DATA_DIR}${name}`;
}

async function readTags(jsonPath: string): Promise<Record<string, string>> {
  const source = chain([
    createReadStream(jsonPath),
    parser(),
    pick({ filter: "tags" }),
    streamValues(),
  ]);
  for await (const { value } of source) {
    source.destroy();
    return value as Record<string, string>;
  }
  throw new Error("no 'tags' object found in JSON");
}

async function stage(jsonPath: string, tags: Record<string, string>) {
  await mkdir(STAGE_DIR, { recursive: true });
  const entry = createWriteStream(`${STAGE_DIR}entry.tsv`);
  const kanji = writer("kanji");
  const kana = writer("kana");
  const sense = writer("sense");
  const gloss = writer("gloss");
  let nEntry = 0;

  const source = chain([
    createReadStream(jsonPath),
    parser(),
    pick({ filter: "words" }),
    streamArray(),
  ]);

  for await (const { value } of source) {
    const w = value as JMdictWord;
    const eid = Number(w.id);
    await writeLine(entry, `${eid}\n`);
    nEntry++;

    let p = 0;
    for (const k of w.kanji) {
      checkTags(k.tags, tags, `kanji ${k.text}`);
      await kanji.push(eid, ++p, k.text, k.common, k.tags);
    }
    p = 0;
    for (const k of w.kana) {
      checkTags(k.tags, tags, `kana ${k.text}`);
      await kana.push(eid, ++p, k.text, k.common, k.tags, k.appliesToKanji);
    }
    p = 0;
    for (const s of w.sense) {
      checkTags(s.partOfSpeech, tags, "partOfSpeech");
      checkTags(s.field, tags, "field");
      checkTags(s.misc, tags, "misc");
      checkTags(s.dialect, tags, "dialect");
      const sid = await sense.push(
        eid,
        ++p,
        s.partOfSpeech,
        s.field,
        s.misc,
        s.dialect,
        s.info,
        s.appliesToKanji,
        s.appliesToKana,
      );
      let g = 0;
      for (const gl of s.gloss) {
        await gloss.push(sid, ++g, gl.lang, gl.text, gl.type, gl.gender);
      }
    }
  }

  entry.end();
  await Promise.all([
    once(entry, "finish"),
    kanji.close(),
    kana.close(),
    sense.close(),
    gloss.close(),
  ]);

  return {
    entry: nEntry,
    kanji: kanji.count(),
    kana: kana.count(),
    sense: sense.count(),
    gloss: gloss.count(),
  };
}

async function buildIndexes(sql: postgres.TransactionSql): Promise<void> {
  await sql`CREATE INDEX kanji_entry_id_idx ON kanji (entry_id)`;
  await sql`CREATE INDEX kana_entry_id_idx ON kana (entry_id)`;
  await sql`CREATE INDEX sense_entry_id_idx ON sense (entry_id)`;
  await sql`CREATE INDEX gloss_sense_id_idx ON gloss (sense_id)`;
  await sql`CREATE INDEX kanji_text_idx ON kanji (text)`;
  await sql`CREATE INDEX kana_text_idx ON kana (text)`;
  await sql`CREATE INDEX sense_part_of_speech_idx ON sense USING GIN (part_of_speech)`;
}

async function load(tags: Record<string, string>): Promise<void> {
  const sql = postgres(DB_URL);
  try {
    await sql.begin(async (sql) => {
      await sql`TRUNCATE entry, kanji, kana, sense, gloss, tag RESTART IDENTITY CASCADE`;

      const stale = await sql`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename IN ('entry', 'kanji', 'kana', 'sense', 'gloss')
          AND indexname !~ '_pkey$'`;
      for (const { indexname } of stale)
        await sql`DROP INDEX IF EXISTS ${sql(indexname)}`;

      const tagRows = Object.entries(tags).map(([code, description]) => ({
        code,
        description,
      }));
      if (tagRows.length)
        await sql`INSERT INTO tag ${sql(tagRows, "code", "description")}`;

      for (const name of [
        "entry",
        "kanji",
        "kana",
        "sense",
        "gloss",
      ] as const) {
        await pipeline(
          createReadStream(`${STAGE_DIR}${name}.tsv`),
          await sql`COPY ${sql(name)} (${sql([...COLUMNS[name]])}) FROM STDIN`.writable(),
        );
      }

      await buildIndexes(sql);

      for (const t of ["kanji", "kana", "sense", "gloss"]) {
        await sql`SELECT setval(pg_get_serial_sequence(${t}, 'id'), (SELECT COALESCE(MAX(id), 1) FROM ${sql(t)}))`;
      }
    });
  } finally {
    await sql.end();
  }
}

async function main(): Promise<void> {
  const jsonPath = await findJson();

  console.log("Reading tags …");
  const tags = await readTags(jsonPath);
  console.log(`  ${Object.keys(tags).length} tag codes`);

  console.log("Staging rows …");
  const counts = await stage(jsonPath, tags);
  console.log(
    `  entries ${counts.entry} · kanji ${counts.kanji} · kana ${counts.kana} · sense ${counts.sense} · gloss ${counts.gloss}`,
  );

  console.log("COPY + index into Postgres (one transaction) …");
  await load(tags);

  await rm(STAGE_DIR, { recursive: true, force: true });
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
