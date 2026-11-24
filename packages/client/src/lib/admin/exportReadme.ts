// The README.txt of the data download (results/DownloadView.tsx): what each file and
// column holds. Keep it in step with the tables in exportData.ts.

/** What the files in the download are, for the README. */
export function readme(study: string, exported: Date, labels: boolean, format: "csv" | "xlsx" = "csv"): string {
  return `Data of ${study}, downloaded ${exported.toISOString()} from AnnoTinder.
${format === "xlsx" ? "\nresults.xlsx has a sheet per table below, named as its file (without .csv).\n" : ""}
annotations.csv  A row per unit and coder: the unit's id (unit_id), the unit
                 version the coder saw (unit_version_id), the coder, when they
                 first and last answered, the design version (design_version:
                 n of designs/v<n>.json),
                 the time the coder's browser measured on the unit's
                 questions (unit_ms_client; see timings.csv) and the time
                 from the server handing out the unit to its last answer
                 (unit_ms_server), and a column per question (a scale: a column per item,
                 question.item).${
                   labels
                     ? `
                 Each answer column is followed by a _label column: the label
                 in the design version the answer was given under.`
                     : ""
                 }
coders.csv       A row per coder session (session_id): the coder (their name
                 or id: a coders' column value, a panel's id from the URL, or
                 the email they signed in with), email (where signing in was
                 required), link, started, last
                 active, how their session ended (complete, screenout or
                 quit), when they asked for their answers to be deleted
                 (deletion_requested; not done yet), their session values
                 (session.<name>: URL parameters and source),
                 units finished per loop, and their answers outside unit
                 loops (random conditions included).
units.csv        The units as deployed, a row per version: a unit replaced
                 after it was coded has a row per version (deployed: when).
                 Coders saw only the fields the design shows; the others
                 are for your analysis. Join annotations on unit_version_id.
                 A column per column with a role (coder_set,
                 condition_set, part_set: e.g. anna or anna;bob, #n its
                 position in an ordered set; test_set: overlap,
                 practice or gold).
variables.csv    Per design version (design_version), question and option: the question text,
                 the stored value, its label, and special (not_applicable,
                 dont_know: a special answer, outside the options or range;
                 its value is its code, empty if it has none).
designs/v<n>.json  Each design version answers were given under (and the
                 live one): the whole design (questions, layouts, how units
                 were handed out, session, unit fields), with the AnnoTinder
                 release and commit it ran on (client). Open it in the
                 design viewer of that release to see what coders saw.
display_changes.csv  How each coder's screen looked, a row per change: their
                 keys for answers (numbers, numpad, letters, filter), in
                 responsive studies the width (narrow or wide), and where
                 coders choose it the theme; at: when it changed. Join
                 answers on session_id and time. coders.csv's display
                 column lists each session's displays.
devices.csv      The devices coders used: device type (phone, tablet,
                 desktop), browser and operating system, and when each
                 joined its coder's session (a coder who continued on
                 another device has several). Join annotations on device_id
                 (the device of the unit's latest answer).
timings.csv      Response times, a row per answer: as the coder's browser
                 measured them, in milliseconds: until the first answer
                 (first_ms), on screen over all visits (total_ms), with the
                 page hidden (hidden_ms; another tab, not in total_ms), and
                 how often the answer changed (edits). practice_tries: on
                 a practice question, the answers given until right (1:
                 right the first time). A browser can be tampered with, so with the server's own bound (server_ms):
                 for answers in units, the unit's unit_ms_server; outside
                 units, the time since the coder's previous answer.
                 exceeds_server is true where the browser claims more time
                 than the server saw (a tampered client). unit_id is empty
                 for answers outside unit loops.
deleted_coders.csv  Coders whose data was deleted from AnnoTinder (for
                 instance a coder who withdrew), by session_id and coder:
                 delete them from earlier downloads too.
reset_answers.csv  (if included) Answers a researcher reset, a row per
                 answer, with when it was given (answered) and reset
                 (reset_at). Units are coded again after a reset; the new
                 answers are in annotations.csv.

Answers are the stored values; several answers are joined with "; ", spans
are written as "value: text", relations as "value: from → to" (the spans'
texts), a confirm question as true, and questions a condition skipped are
empty. A special answer (not_applicable, dont_know) is its code, or empty
(missing) if it has none; a question answered so has a _special column
that says which. Questions with spans, relations or several answers also have a _json
column with the full answer: spans with their field and, per fragment, the
offset and length in that field of the unit version (units.csv), relations
with the ids of their spans.
Join annotations and coders on session_id. Times are UTC (ISO 8601).
`;
}
