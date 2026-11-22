import { strFromU8, unzipSync } from "fflate";
import {
  ResultsExportManifestSchema,
  type AnnotationRow,
  type CoderDeletion,
  type CoderProgress,
  type DeploymentVersion,
  type DesignVersion,
  type Device,
  type ResultsExportManifest,
  type SetGroupResponse,
  type UnitVersion,
} from "@annotinder/contracts";

// The server's raw results export (docs/plans/exports-and-files.md): a zip of
// JSON lines in the researcher API's shapes. The data download builds its
// tables from it (exportData.ts).

export interface RawExport {
  manifest: ResultsExportManifest;
  /** Also reset answers (with `retiredAt`). */
  answers: AnnotationRow[];
  units: UnitVersion[];
  coders: CoderProgress[];
  /** Every design version, with its number as researchers see it. */
  designVersions: (DesignVersion & { number: number })[];
  deployments: DeploymentVersion[];
  sets: SetGroupResponse[];
  devices: Device[];
  deletions: CoderDeletion[];
}

/** Reads an export; refuses one that is incomplete (rows that don't match the manifest's counts). */
export function readRawExport(bytes: Uint8Array): RawExport {
  const files = unzipSync(bytes);
  if (!files["manifest.json"]) throw new Error("The export is incomplete (no manifest): download it again");
  const manifest = ResultsExportManifestSchema.parse(JSON.parse(strFromU8(files["manifest.json"])));
  const lines = <T>(name: string): T[] => {
    const rows = files[name]
      ? strFromU8(files[name])
          .split("\n")
          .filter((line) => line.length > 0)
          .map((line) => JSON.parse(line) as T)
      : [];
    if (rows.length !== (manifest.counts[name] ?? 0))
      throw new Error(`The export is incomplete (${name}): download it again`);
    return rows;
  };
  return {
    manifest,
    answers: lines("answers.jsonl"),
    units: lines("units.jsonl"),
    coders: lines("coders.jsonl"),
    designVersions: lines("design_versions.jsonl"),
    deployments: lines("deployments.jsonl"),
    sets: lines("sets.jsonl"),
    devices: lines("devices.jsonl"),
    deletions: lines("deletions.jsonl"),
  };
}
