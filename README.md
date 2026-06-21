# jmdict-hakase

JMdict Japanese–English dictionary in PostgreSQL, with CJK full-text and pgvector semantic search, served over a Fastify API.

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
