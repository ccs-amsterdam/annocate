import { coderIdProblem, isEmail, type CodersCreate } from "@annotinder/contracts";

// The "Add coders" text (docs/client.md §7, "Coders"): one coder per line,
// `id` or `id<sep>email` with a comma, semicolon or tab between them, and an
// optional header line. With "the coder id is the email address", each line
// is an address that is both.

/** A line of the text as it was read: the coder it gives, or why it gives none. */
export interface ParsedCoder {
  /** The line's number in the text, from 1. */
  line: number;
  coder: string;
  email: string | null;
  error: string | null;
}

/** A coder there already is: its id and address are taken. */
type Existing = { coder: string; email: string | null };

const ID_HEADERS = ["coder", "coder id", "coder_id", "id", "name"];
const EMAIL_HEADERS = ["email", "e-mail", "email address", "mail"];

const cellsOf = (line: string) => line.split(/[,;\t]/).map((cell) => cell.trim());

/** Whether a first line names the columns instead of a coder. */
function isHeader(cells: string[], idIsEmail: boolean): boolean {
  const [first, second] = cells.map((cell) => cell.toLowerCase());
  if (idIsEmail) return cells.length === 1 && [...ID_HEADERS, ...EMAIL_HEADERS].includes(first);
  return ID_HEADERS.includes(first) && (second === undefined || EMAIL_HEADERS.includes(second)) && cells.length <= 2;
}

/** What a line says, before it is compared with the other lines: an id and an address, or what is wrong with it. */
function readLine(cells: string[], idIsEmail: boolean): Omit<ParsedCoder, "line"> {
  const [coder, second] = cells;
  const email = idIsEmail ? coder : second || null;
  const problem = (error: string) => ({ coder, email, error });
  if (idIsEmail && cells.length > 1) return problem("One email address per line");
  if (cells.length > 2) return problem("Too many values: a coder id, or a coder id and an email address");
  const idProblem = coderIdProblem(coder);
  if (idProblem) return problem(idProblem);
  if (email !== null && !isEmail(email)) return problem(`Not an email address: ${email}`);
  return { coder, email, error: null };
}

/** A set of the texts seen so far, ignoring case; `add` says whether a text was there already. */
function seenTexts(initial: (string | null)[]) {
  const seen = new Set(initial.flatMap((text) => (text === null ? [] : [text.toLowerCase()])));
  return (text: string) => {
    const before = seen.has(text.toLowerCase());
    seen.add(text.toLowerCase());
    return before;
  };
}

/**
 * Reads the text: per line with something on it (a header line aside) the
 * coder, or an error: an id that can't be one, an address that isn't one,
 * or an id or address that another line or one of the study's coders
 * (`existing`) has, ignoring case.
 */
export function parseCoders(
  text: string,
  { idIsEmail, existing }: { idIsEmail: boolean; existing: readonly Existing[] },
): ParsedCoder[] {
  const idSeen = seenTexts(existing.map((c) => c.coder));
  const emailSeen = seenTexts(existing.map((c) => c.email));
  const lines = text.split(/\r?\n/).map((raw, i) => ({ line: i + 1, cells: cellsOf(raw), blank: raw.trim() === "" }));
  const filled = lines.filter((l) => !l.blank);
  const rows = filled.length > 0 && isHeader(filled[0].cells, idIsEmail) ? filled.slice(1) : filled;
  return rows.map(({ line, cells }) => {
    const read = readLine(cells, idIsEmail);
    if (read.error !== null) return { line, ...read };
    // Both are noted before either is refused, so a later line sees them as taken
    const idTaken = idSeen(read.coder);
    const emailTaken = read.email !== null && emailSeen(read.email);
    const error = idTaken
      ? "There is a coder with this id already"
      : emailTaken
        ? "Another coder has this email address"
        : null;
    return { line, ...read, error };
  });
}

/** The request that makes the coders read, or null while a line has an error or there is none. */
export function codersToCreate(parsed: readonly ParsedCoder[]): CodersCreate | null {
  if (parsed.length === 0 || parsed.some((p) => p.error !== null)) return null;
  return { coders: parsed.map((p) => ({ coder: p.coder, ...(p.email === null ? {} : { email: p.email }) })) };
}
