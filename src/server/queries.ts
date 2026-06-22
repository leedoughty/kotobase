import type { Db } from "./db.ts";

const JAPANESE = /[぀-ヿ㐀-鿿]/;

export function isJapanese(text: string): boolean {
  return JAPANESE.test(text);
}

export function searchByMeaning(sql: Db, q: string, limit: number) {
  return sql`
    SELECT id, kanji, reading, gloss, common
    FROM (
      SELECT DISTINCT ON (s.entry_id)
        s.entry_id::int AS id,
        (SELECT text FROM kanji WHERE entry_id = s.entry_id ORDER BY position LIMIT 1) AS kanji,
        (SELECT text FROM kana  WHERE entry_id = s.entry_id ORDER BY position LIMIT 1) AS reading,
        g.text AS gloss,
        (EXISTS (SELECT 1 FROM kanji WHERE entry_id = s.entry_id AND common)
         OR EXISTS (SELECT 1 FROM kana WHERE entry_id = s.entry_id AND common)) AS common,
        pgroonga_score(g.tableoid, g.ctid) AS score
      FROM gloss g
      JOIN sense s ON s.id = g.sense_id
      WHERE g.text &@ ${q}
      ORDER BY s.entry_id, pgroonga_score(g.tableoid, g.ctid) DESC, length(g.text)
    ) m
    ORDER BY common DESC, score DESC, length(gloss)
    LIMIT ${limit}
  `;
}

export function searchByHeadword(sql: Db, q: string, limit: number) {
  return sql`
    SELECT id, kanji, reading, gloss, common
    FROM (
      SELECT DISTINCT ON (h.entry_id)
        h.entry_id::int AS id,
        (SELECT text FROM kanji WHERE entry_id = h.entry_id ORDER BY position LIMIT 1) AS kanji,
        (SELECT text FROM kana  WHERE entry_id = h.entry_id ORDER BY position LIMIT 1) AS reading,
        (SELECT g.text FROM sense s JOIN gloss g ON g.sense_id = s.id
           WHERE s.entry_id = h.entry_id ORDER BY s.position, g.position LIMIT 1) AS gloss,
        (EXISTS (SELECT 1 FROM kanji WHERE entry_id = h.entry_id AND common)
         OR EXISTS (SELECT 1 FROM kana WHERE entry_id = h.entry_id AND common)) AS common,
        (h.text = ${q}) AS exact,
        length(h.text) AS hlen
      FROM (
        SELECT entry_id, text FROM kanji WHERE text &@ ${q}
        UNION ALL
        SELECT entry_id, text FROM kana WHERE text &@ ${q}
      ) h
      ORDER BY h.entry_id, (h.text = ${q}) DESC, length(h.text)
    ) x
    ORDER BY common DESC, exact DESC, hlen
    LIMIT ${limit}
  `;
}

export function getEntry(sql: Db, id: number) {
  return sql`
    SELECT
      e.id::int AS id,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'text', k.text, 'common', k.common, 'tags', k.tags
        ) ORDER BY k.position)
        FROM kanji k WHERE k.entry_id = e.id
      ), '[]'::jsonb) AS kanji,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'text', r.text, 'common', r.common, 'tags', r.tags,
          'appliesToKanji', r.applies_to_kanji
        ) ORDER BY r.position)
        FROM kana r WHERE r.entry_id = e.id
      ), '[]'::jsonb) AS kana,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'partOfSpeech', s.part_of_speech, 'field', s.field, 'misc', s.misc,
          'dialect', s.dialect, 'info', s.info,
          'glosses', COALESCE((
            SELECT jsonb_agg(g.text ORDER BY g.position)
            FROM gloss g WHERE g.sense_id = s.id
          ), '[]'::jsonb)
        ) ORDER BY s.position)
        FROM sense s WHERE s.entry_id = e.id
      ), '[]'::jsonb) AS senses
    FROM entry e
    WHERE e.id = ${id}
  `;
}
