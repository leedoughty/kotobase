# jmdict-hakase

A PostgreSQL build of the [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) Japanese-English
dictionary (around 217k entries), with fast CJK full-text search and a small Fastify REST API
on top. (_hakase_, 博士, means "expert".)

JMdict ships as one big JSON file. This project loads it into a proper normalised, indexed
Postgres database and serves it over HTTP.

**Live API:** <https://jmdict-hakase.onrender.com> - try:

- [`/search?q=はかせ`](https://jmdict-hakase.onrender.com/search?q=はかせ) - search by reading
- [`/entry/1474620`](https://jmdict-hakase.onrender.com/entry/1474620) - the full 博士 entry
- [`/examples?q=博士`](https://jmdict-hakase.onrender.com/examples?q=博士) - example sentences for 博士

## What it does

- **Search that understands the script you type.** One `/search` endpoint handles both
  languages. Type Japanese and it matches the written and spoken forms; type English and it
  matches the meanings. Japanese leans on [PGroonga](https://pgroonga.github.io/), because
  Postgres's built-in full-text search can't tokenise Japanese (there are no spaces between
  words to split on); English uses Postgres's own `tsvector` full-text search.
- **Sensible ranking.** Results come back ordered by how common the word is, then how well it
  matched, then length, with one row per word.
- **Full entry lookup.** `/entry/:id` gives you a whole entry back, with all its kanji,
  readings, senses and glosses nested together, fetched in a single query.
- **Example sentences.** `/examples` finds real Japanese↔English sentence pairs for a word
  (from the Tanaka/Tatoeba corpus), and every entry's senses carry their own examples inline.
- **Rate limiting.** 60 requests a minute per IP, with the usual `x-ratelimit-*` and
  `retry-after` headers.
- **Caching.** An in-memory LRU cache with a TTL sits in front of entry lookups, so repeated
  requests skip the database. Each response says whether it was a `HIT` or a `MISS`.

## API

| Method and path                       | What it does                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| `GET /search?q=<term>&limit=<1-50>`   | Ranked search. Japanese `q` matches headwords, English `q` matches meanings.    |
| `GET /entry/:id`                      | The full nested entry for a JMdict id.                                          |
| `GET /examples?q=<term>&limit=<1-50>` | Example sentences for a word (Japanese or English `q`), ranked and diversified. |

```sh
curl 'localhost:3000/search?q=はかせ' # 博士 (hakase, "expert") comes back first
curl 'localhost:3000/search?q=博士' # words written with 博士
curl 'localhost:3000/entry/1474620' # 博士: expert, doctor/PhD, and older senses
curl 'localhost:3000/examples?q=本' # sentences for 本, "book" senses surfacing first
```

```jsonc
// GET /search?q=はかせ&limit=1
[
  {
    "id": 1474620,
    "kanji": "博士",
    "reading": "はかせ",
    "gloss": "expert",
    "common": true,
  },
]
```

```jsonc
// GET /examples?q=本&limit=3
[
  {
    "japanese": "昨日はその本を８０ページまで読んだ。",
    "english": "I read the book up to page 80 yesterday.",
    "entryId": 1522150,
  },
  // … more, spread across the words written with 本 …
]
```

```jsonc
// GET /entry/1474620  (abridged — empty arrays and later senses trimmed)
{
  "id": 1474620,
  "kanji": [{ "text": "博士", "common": true, "tags": [] }],
  "kana": [{ "text": "はかせ", "common": true, "appliesToKanji": ["*"] }],
  "senses": [
    {
      "partOfSpeech": ["n"],
      "glosses": ["expert", "learned person"],
    },
    {
      "partOfSpeech": ["n", "n-suf"],
      "misc": ["col"],
      "glosses": ["doctor", "PhD", "Dr."],
    },
    // … "instructor at the imperial court (ritsuryō period)",
    //     "pitch and length marks (for a Buddhist liturgical chant)" …
  ],
}
```

## Tech stack

- **TypeScript on Node 22.18+.** Run straight through Node's built-in type stripping, so
  there's no build step.
- **PostgreSQL** for storage and full-text search — PGroonga for CJK (Japanese headwords) and
  native `tsvector` FTS for English glosses — run locally through the Supabase CLI (which brings
  it up in Docker).
- **[postgres.js](https://github.com/porsager/postgres)** as the driver. Every query is a
  parameterised tagged template, so there's no room for SQL injection, and the bulk load goes
  through `COPY`.
- **Fastify 5** for the API (decorators, plugins, and JSON Schema for validation and
  serialisation).
- **Supabase CLI migrations**, just plain SQL, no ORM.
- **pnpm**, locked down against supply-chain attacks (a cooldown on brand-new releases, and
  dependency build scripts off by default).

## Data model

Seven tables: `entry`, with `kanji`, `kana` and `sense` hanging off it, `gloss` and `example`
hanging off `sense`, and a `tag` lookup. It's a hybrid. The main hierarchy is properly
normalised with foreign keys and `ON DELETE CASCADE`, but the flat tag lists (part of speech,
field, misc and so on) are stored as `TEXT[]` arrays with GIN indexes rather than their own
tables. All the indexes get built after the data is loaded, not before.

That's about 217,538 entries and ~32K example sentences, or roughly 1.4M rows in total.

## Local development

You'll need Docker (for the local Postgres), pnpm, and Node 22.18 or newer.

```sh
pnpm install
pnpm db:start         # start local Supabase (Postgres) in Docker
pnpm migration:up     # apply schema + enable PGroonga
pnpm data:download    # fetch + checksum-verify the pinned JMdict release
pnpm data:load        # stage, COPY, and index (one transaction)
pnpm dev              # start the API on :3000 (watch mode)
```

### Scripts

| Script                               | Action                                   |
| ------------------------------------ | ---------------------------------------- |
| `db:start` / `db:stop` / `db:status` | manage the local Supabase Postgres       |
| `db:reset`                           | drop and recreate the local database     |
| `migration:new` / `migration:up`     | create / apply SQL migrations            |
| `data:download`                      | fetch + verify the pinned JMdict release |
| `data:load`                          | stage, `COPY`, and index the data        |
| `dev` / `serve`                      | run the API (watch mode / plain)         |
| `typecheck`                          | `tsc --noEmit`                           |

## Deployment

See [`DEPLOY.md`](./DEPLOY.md). The setup is Postgres on Supabase (managed, and it includes
PGroonga) with the API on Render.

## A few decisions worth explaining

- **Load with `COPY`, then build the indexes.** The loader writes the rows out to per-table
  TSV files and streams them in with `COPY` in a single transaction, and only creates the
  indexes afterwards. That's far quicker than row-by-row `INSERT`s against a live index.
- **No N+1.** `/entry/:id` builds its whole nested shape with one `jsonb_agg` query instead of
  looping and querying once per sense. One round trip instead of about thirty.
- **Safe from injection by design.** Every user-supplied value goes in as a bound parameter,
  and `sql.unsafe` never touches user input.
- **Tags as arrays, no foreign key.** The tag lists are checked in the loader rather than
  enforced with a foreign key. With a single trusted writer that's a cheap trade, and it keeps
  things flat and fast.
- **Example ranking: exact → common → diversify.** A single kanji often spans several words
  (本 is both ほん "book" and もと "origin/basis"), and PGroonga's CJK match is a substring
  match, so a naive query for 本 buries the obvious senses under compounds (一本, 基本) and
  lets one high-frequency word fill the page. `/examples` ranks whole-word matches first, then
  common everyday words, then caps each entry to two sentences so the results stay a browsable
  spread rather than a monoculture — without dropping the fuzzy matches further down.
- **Examples are storage-aware.** They reuse the existing kanji/kana/gloss indexes to resolve
  the word, then join on `sense_id`; there's deliberately _no_ full-text index on the sentence
  text itself, which keeps the feature to ~7 MB and inside Supabase's free tier.
- **PGroonga for CJK, native FTS for English.** Japanese headwords (`kanji`/`kana`) are indexed
  with PGroonga, because Postgres's built-in tokeniser can't split Japanese (no spaces between
  words). English glosses, though, tokenise fine with native `to_tsvector('english', …)` + GIN
  — which is _much_ smaller on disk than a PGroonga index (the gloss index alone went from
  ~70 MB to ~8 MB) and gives proper stemming, so searching "cat" matches 猫 without dragging in
  "category" the way a substring match did. Using the right tool per language keeps the whole
  DB inside the free tier.

## Roadmap

- **Semantic search** with pgvector: embed the gloss text so you can search by meaning ("find
  words that mean roughly X"), behind `/search?mode=semantic`.

## Data source

The dictionary is ingested from [`scriptin/jmdict-simplified`](https://github.com/scriptin/jmdict-simplified),
a clean JSON conversion of JMdict (with MIT-licensed TypeScript types). A specific
release is pinned and checksum-verified at download time - see [`src/download.ts`](./src/download.ts).
The underlying JMdict data originates from the EDRDG (see License below).

## License

Source code is licensed **MIT** (see [`LICENSE`](./LICENSE)).

The **JMdict dictionary data is not covered by that license.** It is the property of the
[Electronic Dictionary Research and Development Group (EDRDG)](https://www.edrdg.org/) and
is used under the [Creative Commons Attribution-ShareAlike](https://creativecommons.org/licenses/by-sa/4.0/)
licence. Any JMdict-derived data fetched or served by this project (including sample
fixtures, if added) remains under those terms, and attribution to the EDRDG must be
preserved wherever the data is distributed or served.
