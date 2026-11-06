import { CoderStudySchema, type CoderStudy } from "@annotinder/contracts";
import { z } from "zod";

// The studies this browser took part in, for the annotator's home (`/code`):
// the server keeps a device's sessions apart per study (docs/coder-identity.md
// §4: it can't list them), so the browser remembers which studies it opened,
// and asks each for its session's summary. Only the deployment and the URL
// parameters (e.g. a participant id: it is part of the session's key), never
// a link's secret: the device's cookie continues the session.

const STORAGE_KEY = "annotinder:studies";
const MAX_STUDIES = 50;

export interface OpenedStudy {
  deployment: string;
  params: Record<string, string>;
}

function read(): OpenedStudy[] {
  try {
    const parsed = z
      .array(z.object({ deployment: z.string(), params: z.record(z.string(), z.string()) }))
      .safeParse(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function write(studies: OpenedStudy[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(studies.slice(0, MAX_STUDIES)));
  } catch {
    // Storage full or off: the home page just lists fewer studies
  }
}

const same = (a: OpenedStudy, b: OpenedStudy) => a.deployment === b.deployment && JSON.stringify(a.params) === JSON.stringify(b.params);

/** Remembers a study this browser opened (most recent first). */
export function rememberStudy(study: OpenedStudy): void {
  write([study, ...read().filter((s) => !same(s, study))]);
}

/** Where a study continues: its page, with its URL parameters (no link: the device's cookie resumes the session). */
export function continueUrl(study: OpenedStudy): string {
  const query = new URLSearchParams(study.params).toString();
  return `/code/${encodeURIComponent(study.deployment)}${query ? `?${query}` : ""}`;
}

export type StudyEntry = OpenedStudy & { study: CoderStudy; elsewhere: boolean };

/**
 * The studies to show: this browser's (asked one by one; forgotten when the
 * server has no session for them), and with a login, the coder's sessions
 * on other devices.
 */
export async function loadStudies(apiUrl: string): Promise<StudyEntry[]> {
  const opened = read();
  const headers = { "x-annotinder": "1" };
  const here = await Promise.all(
    opened.map(async (o) => {
      const res = await fetch(`${apiUrl}/d/${encodeURIComponent(o.deployment)}/summary`, {
        headers: { ...headers, "x-url-params": new URLSearchParams(o.params).toString() },
        credentials: "same-origin",
      }).catch(() => null);
      if (res?.status === 404) return { opened: o, study: null, gone: true };
      const parsed = res?.ok ? CoderStudySchema.safeParse(await res.json()) : null;
      return { opened: o, study: parsed?.success ? parsed.data : null, gone: false };
    }),
  );
  write(here.filter((h) => !h.gone).map((h) => h.opened));
  const entries: StudyEntry[] = here.flatMap((h) => (h.study ? [{ ...h.opened, study: h.study, elsewhere: false }] : []));
  // A logged-in coder's sessions on other devices (none without a login)
  const res = await fetch(`${apiUrl}/coder/sessions`, { headers, credentials: "same-origin" }).catch(() => null);
  const mine = res?.ok ? z.array(CoderStudySchema).safeParse(await res.json()) : null;
  for (const study of mine?.success ? mine.data : []) {
    if (!entries.some((e) => e.deployment === study.deployment)) entries.push({ deployment: study.deployment, params: {}, study, elsewhere: true });
  }
  return entries;
}
