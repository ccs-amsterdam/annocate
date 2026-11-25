// A large existing data set, written straight into the database (far faster
// than coding it through the API): per study, the few sessions that really
// coded a unit through the API (the "template" coders) are copied into many
// sessions with many finished units.
//
// Nothing here spells out what an answer or a session looks like: the rows
// are copies of the template coders' rows, so they follow the server's own
// formats. Only table and column names are used (packages/server/src/db/schema).

/** The template coders' answers about their unit, numbered per coder (tn): the patterns the copies take turns using. */
const PATTERNS = `
  CREATE TEMP TABLE bench_patterns AS
  SELECT dense_rank() OVER (ORDER BY session_id) - 1 AS tn, variable, value, timing, design_version_id
  FROM annotation_values
  WHERE study_id = $1 AND unit_id IS NOT NULL AND retired_at IS NULL`;

/** New sessions: copies of the study's first session. */
const SESSIONS = `
  INSERT INTO coder_sessions (study_id, link_id, coder, session, assignments, created, known_units)
  SELECT t.study_id, t.link_id, t.coder, t.session, t.assignments, t.created, t.known_units
  FROM (SELECT * FROM coder_sessions WHERE study_id = $1 ORDER BY id LIMIT 1) t, generate_series(1, $2::int)`;

/** The new sessions' answers about themselves: copies of the first session's. */
const CODER_ANSWERS = `
  INSERT INTO annotation_values (study_id, session_id, design_version_id, variable, value, timing, frozen, created, updated)
  SELECT a.study_id, s.id, a.design_version_id, a.variable, a.value, a.timing, a.frozen, a.created, a.updated
  FROM coder_sessions s
  JOIN annotation_values a ON a.unit_id IS NULL AND a.retired_at IS NULL
    AND a.session_id = (SELECT min(id) FROM coder_sessions WHERE study_id = $1)
  WHERE s.study_id = $1 AND NOT EXISTS (SELECT 1 FROM annotation_values x WHERE x.session_id = s.id)`;

/**
 * Which session finishes which units: session n takes the next $2 units
 * after those of session n - 1 (around the study's units), without the
 * unit a template coder already coded.
 */
const PAIRS = `
  CREATE TEMP TABLE bench_pairs AS
  WITH s AS (SELECT id, row_number() OVER (ORDER BY id) - 1 AS n FROM coder_sessions WHERE study_id = $1),
       u AS (SELECT unit_id, id AS version_id, row_number() OVER (ORDER BY unit_id) - 1 AS n
             FROM unit_versions WHERE study_id = $1 AND to_deploy IS NULL),
       total AS (SELECT count(*) AS units FROM u)
  SELECT s.id AS session_id, s.n AS sn, u.unit_id, u.version_id, u.n AS un
  FROM s
  CROSS JOIN generate_series(0, $2::int - 1) AS j
  CROSS JOIN total
  JOIN u ON u.n = (s.n * $2::int + j) % total.units
  WHERE NOT EXISTS (SELECT 1 FROM unit_codings c WHERE c.session_id = s.id AND c.unit_id = u.unit_id)`;

/** The answers: per session and unit, one template coder's answers. */
const UNIT_ANSWERS = `
  INSERT INTO annotation_values
    (study_id, session_id, unit_id, unit_version_id, design_version_id, variable, value, timing, created, updated)
  SELECT $1, p.session_id, p.unit_id, p.version_id, a.design_version_id, a.variable, a.value, a.timing, now(), now()
  FROM bench_pairs p
  JOIN bench_patterns a ON a.tn = (p.sn + p.un) % (SELECT max(tn) + 1 FROM bench_patterns)`;

/** The finished units, as the distribution counts them. */
const CODINGS = `
  INSERT INTO unit_codings (study_id, loop_key, unit_id, session_id, agreement)
  SELECT $1, t.loop_key, p.unit_id, p.session_id, t.agreement
  FROM bench_pairs p, (SELECT loop_key, agreement FROM unit_codings WHERE study_id = $1 LIMIT 1) t`;

/** That the units were handed out, in which version. */
const SERVES = `
  INSERT INTO unit_serves (study_id, session_id, unit_id, unit_version_id)
  SELECT $1, session_id, unit_id, version_id FROM bench_pairs
  ON CONFLICT DO NOTHING`;

const MARK_CODED = `UPDATE units SET coded = true WHERE id IN (SELECT unit_id FROM bench_pairs)`;
const COUNT_LINK_USES = `UPDATE links SET uses = uses + $2::int WHERE id = (SELECT min(link_id) FROM coder_sessions WHERE study_id = $1)`;
/** The next request derives the finished units again from the answers: times that. */
const FORGET_CODINGS = `UPDATE deployments SET codings_basis = NULL WHERE study_id = $1`;

/**
 * Fills one study: `sessions` new sessions, and for every session of the
 * study (the template coders too) `unitsPerSession` finished units.
 */
export async function seedStudy(sql, studyId, { sessions, unitsPerSession, rederive }) {
  await sql.query(PATTERNS, [studyId]);
  await sql.query(SESSIONS, [studyId, sessions]);
  await sql.query(CODER_ANSWERS, [studyId]);
  await sql.query(PAIRS, [studyId, unitsPerSession]);
  await sql.query(UNIT_ANSWERS, [studyId]);
  await sql.query(CODINGS, [studyId]);
  await sql.query(SERVES, [studyId]);
  await sql.query(MARK_CODED);
  await sql.query(COUNT_LINK_USES, [studyId, sessions]);
  if (rederive) await sql.query(FORGET_CODINGS, [studyId]);
  await sql.query("DROP TABLE bench_pairs");
  await sql.query("DROP TABLE bench_patterns");
}

/** How many rows the data set has now. */
export async function countRows(sql) {
  const count = async (table) => Number((await sql.query(`SELECT count(*) AS n FROM ${table}`))[0].n);
  return {
    studies: await count("studies"),
    units: await count("units"),
    sessions: await count("coder_sessions"),
    answers: await count("annotation_values"),
    finishedUnits: await count("unit_codings"),
  };
}
