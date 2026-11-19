import {
  RELEASE,
  STUDY_FORMAT_VERSION,
  DESIGN_FORMAT_VERSION,
  StudyFileSchema,
  type ClientVersion,
  type DesignVersion,
  type RecipeInput,
  type SetGroupResponse,
  type StudyFile,
  type StudyResponse,
  type UnitResponse,
} from "@annotinder/contracts";
import { unzipSync } from "fflate";
import type { ResearcherApi } from "../api/httpResearcherApi";
import { describeVersions } from "../design/versions";

// The study file (contracts `StudyFileSchema`): `study.json` in the results
// download, to make a copy of the study ("New study from a file"). It is a
// recipe: the units with their current data, the set columns, the design
// the editor works on (the draft, else the latest version) and the study's
// settings. Reading takes a download (.zip, its study.json) or a design file
// (.json: a design version alone, without units).

/** A study's units with their data, page by page. */
async function allUnits(client: ResearcherApi, onProgress?: (n: number) => void): Promise<UnitResponse[]> {
  const units: UnitResponse[] = [];
  const limit = 200;
  for (;;) {
    const page = await client.listUnitPage({ offset: units.length, limit });
    units.push(...page.units);
    onProgress?.(units.length);
    if (page.units.length < limit || units.length >= page.total) return units;
  }
}

/** The study file for a study as it is now. */
export async function buildStudyFile(
  client: ResearcherApi,
  study: StudyResponse,
  options: { liveId: number | null; onProgress?: (n: number) => void },
): Promise<StudyFile> {
  // The server's release and commit (as a design file records them)
  const version = await client.getServerVersion().catch((): ClientVersion => ({ release: RELEASE, commit: "unknown" }));
  const { currentId } = describeVersions(await client.listDesignVersions(), options.liveId);
  const design: DesignVersion | null = currentId === null ? null : await client.getDesignVersion(currentId);
  const units = await allUnits(client, options.onProgress);
  const groups = await client.listSetGroups();
  return studyFile(study, design, units, groups, version);
}

/** The study file from its parts (`buildStudyFile`). */
export function studyFile(
  study: StudyResponse,
  design: Pick<DesignVersion, "items" | "session" | "public" | "units" | "note"> | null,
  units: Pick<UnitResponse, "id" | "externalId" | "data">[],
  groups: SetGroupResponse[],
  client: ClientVersion,
  exportedAt = new Date(),
): StudyFile {
  const externalId = new Map(units.map((u) => [u.id, u.externalId]));
  const recipe = {
    name: study.name,
    units: units.map((u) => ({ id: u.externalId, data: u.data })),
    sets: groups.map((g) => ({
      group: g.name,
      sets: g.sets.map((s) => ({
        name: s.name,
        units: s.unitIds.flatMap((id) => externalId.get(id) ?? []),
        ordered: s.ordered,
      })),
    })),
    design: design
      ? {
          ...(design.note ? { note: design.note } : {}),
          ...(design.public ? { public: design.public } : {}),
          session: design.session,
          units: design.units,
          items: design.items,
        }
      : { items: [] },
    signIn: study.signIn,
    keepSessionsOpen: study.keepSessionsOpen,
    redirectUrls: study.redirectUrls,
    publish: false,
  };
  return {
    format: "annotinder-study",
    formatVersion: STUDY_FORMAT_VERSION,
    client,
    exportedAt,
    recipe: recipe as StudyFile["recipe"],
  };
}

/** What a file holds, to show before making the study. */
export interface ReadStudyFile {
  /** What to send (`POST /study/from-recipe`); its name can be changed. */
  recipe: RecipeInput;
  /** A study file (a download), or a design file (no units). */
  kind: "study" | "design";
  units: number;
  /** The set columns and how many sets each has. */
  sets: { name: string; sets: number }[];
  /** Questions and loops at the top of the design. */
  items: number;
  /** The release the file was made with. */
  release: string;
}

const decoder = new TextDecoder();

/** Reads a download (.zip) or a study or design file (.json). Throws with a message for people. */
export function readStudyFile(fileName: string, bytes: Uint8Array): ReadStudyFile {
  let text: string;
  if (fileName.toLowerCase().endsWith(".zip") || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(bytes, { filter: (f) => f.name === "study.json" });
    } catch {
      throw new Error("This file can't be read as a zip file.");
    }
    if (!files["study.json"])
      throw new Error("This zip has no study.json: download the study again (Results › Download data) to import it.");
    text = decoder.decode(files["study.json"]);
  } else {
    text = decoder.decode(bytes);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("This file isn't a study or design file: it can't be read as JSON.");
  }
  const meta = json as { format?: unknown; formatVersion?: unknown; client?: { release?: unknown } };
  const release = typeof meta.client?.release === "string" ? meta.client.release : "unknown";
  const newer = (supported: number) =>
    typeof meta.formatVersion === "number" && meta.formatVersion > supported
      ? new Error(`This file was made with a newer AnnoTinder (${release}): update this server to import it.`)
      : null;

  if (meta.format === "annotinder-study") {
    const tooNew = newer(STUDY_FORMAT_VERSION);
    if (tooNew) throw tooNew;
    const parsed = StudyFileSchema.safeParse(json);
    if (!parsed.success)
      throw new Error(`This study file can't be imported: ${parsed.error.issues[0]?.message ?? "it isn't valid"}.`);
    const recipe = { ...parsed.data.recipe, publish: false };
    return {
      recipe,
      kind: "study",
      units: recipe.units.length,
      sets: recipe.sets.map((g) => ({ name: g.group, sets: g.sets.length })),
      items: recipe.design.items.length,
      release,
    };
  }

  if (meta.format === "annotinder-design") {
    const tooNew = newer(DESIGN_FORMAT_VERSION);
    if (tooNew) throw tooNew;
    const file = json as {
      name?: unknown;
      note?: unknown;
      design?: { items?: unknown; session?: unknown; public?: unknown; units?: unknown };
    };
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
      publish: false,
    } as RecipeInput;
    return { recipe, kind: "design", units: 0, sets: [], items: design.items.length, release };
  }

  throw new Error("This file isn't an AnnoTinder study or design file.");
}
