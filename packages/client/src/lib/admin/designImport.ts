import {
  DESIGN_FORMAT_VERSION,
  STUDY_EXPORT_FORMAT_VERSION,
  StudyExportManifestSchema,
  type RecipeInput,
} from "@annotinder/contracts";
import { Gunzip } from "fflate";

// New studies from files (Create new study › From a file): a design file
// (`designs/v<n>.json` in the results download, or Export › Design file in
// the editor) makes a study with that design as a draft, with its unit
// fields and no units yet (`POST /study/from-recipe`); a study export
// (`.annotinder.gz`, a study's Settings) is sent to the server as it is
// (`POST /study/import`), after showing what its manifest says.

/** What a design file holds, to show before making the study. */
export interface DesignImport {
  /** What to send; its name can be changed. */
  recipe: RecipeInput;
  /** Questions and loops at the top of the design. */
  items: number;
  /** The release the file was made with. */
  release: string;
}

/** Reads a design file. Throws with a message for people. */
export function readDesignFile(bytes: Uint8Array): DesignImport {
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("This file isn't a design file: it can't be read as JSON.");
  }
  const file = json as {
    format?: unknown;
    formatVersion?: unknown;
    client?: { release?: unknown };
    name?: unknown;
    note?: unknown;
    design?: { items?: unknown; session?: unknown; public?: unknown; units?: unknown };
  };
  if (file.format !== "annotinder-design") throw new Error("This file isn't an AnnoTinder design file.");
  const release = typeof file.client?.release === "string" ? file.client.release : "unknown";
  if (typeof file.formatVersion === "number" && file.formatVersion > DESIGN_FORMAT_VERSION)
    throw new Error(`This file was made with a newer AnnoTinder (${release}): update this server to import it.`);
  const design = file.design;
  if (!design || !Array.isArray(design.items)) throw new Error("This design file has no design.");
  const recipe = {
    name: typeof file.name === "string" && file.name.trim() ? file.name : "Imported design",
    design: {
      ...(typeof file.note === "string" && file.note ? { note: file.note } : {}),
      ...(design.public ? { public: design.public } : {}),
      ...(design.session ? { session: design.session } : {}),
      ...(design.units ? { units: design.units } : {}),
      items: design.items,
    },
    deploy: false,
  } as RecipeInput;
  return { recipe, items: design.items.length, release };
}

/** What a study export holds (its manifest, read in the browser), to show before importing it. */
export interface ExportSummary {
  name: string;
  release: string;
  exportedAt: Date;
  units: number;
  coders: number;
  answers: number;
  designVersions: number;
}

/** Reads a study export's manifest (`StudyExportManifestSchema`). Throws with a message for people. */
export function readExportSummary(bytes: Uint8Array): ExportSummary {
  let firstLine: string;
  try {
    firstLine = firstLineOfGzip(bytes);
  } catch {
    throw new Error("This file can't be unpacked: a study export is a .annotinder.gz file from a study's Settings.");
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(firstLine);
  } catch {
    throw new Error("This isn't a study export.");
  }
  const parsed = StudyExportManifestSchema.safeParse(manifest);
  if (!parsed.success) throw new Error("This isn't a study export.");
  const m = parsed.data;
  if (m.formatVersion > STUDY_EXPORT_FORMAT_VERSION)
    throw new Error(`This export was made with a newer AnnoTinder (${m.client.release}): update this server first.`);
  const rows = (table: string) => m.tables.find((t) => t.name === table)?.rows ?? 0;
  return {
    name: m.study.name,
    release: m.client.release,
    exportedAt: m.exportedAt,
    units: rows("units"),
    coders: rows("coder_sessions"),
    answers: rows("annotation_values"),
    designVersions: rows("design_versions"),
  };
}

/** How much of the file is unpacked at a time. */
const CHUNK = 64 * 1024;

/**
 * The first line of a gzipped text, unpacking only as far as its end: an
 * export of a large study is hundreds of megabytes unpacked. Throws if the
 * file isn't gzip. The end of the file is never checked: what is read is its start.
 */
function firstLineOfGzip(bytes: Uint8Array): string {
  const decoder = new TextDecoder();
  let text = "";
  const gunzip = new Gunzip((chunk) => {
    text += decoder.decode(chunk, { stream: true });
  });
  for (let at = 0; at < bytes.length && !text.includes("\n"); at += CHUNK) {
    gunzip.push(bytes.subarray(at, at + CHUNK));
  }
  const end = text.indexOf("\n");
  return end === -1 ? text : text.slice(0, end);
}
