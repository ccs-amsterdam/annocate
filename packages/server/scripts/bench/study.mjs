// Setting up a study for the benchmark: units, a design in one of the modes
// (names.mjs `MODES`), a deployment, and the link secrets its coders use.
import {
  asList,
  coderStudyId,
  codersColumnBody,
  expertCodersBody,
  designBody,
  expertName,
  linkCoder,
  modeOfDesign,
  paths,
  unitBody,
} from "./names.mjs";

const UPLOAD_PAGE = 200; // the most units per upload

/** Uploads `count` units; their ids in order. */
async function uploadUnits(api, studyId, count) {
  const ids = [];
  for (let start = 0; start < count; start += UPLOAD_PAGE) {
    const page = [];
    for (let n = start; n < Math.min(count, start + UPLOAD_PAGE); n++) page.push(unitBody(n));
    const created = asList(await api("POST", paths.units(studyId), { units: page }));
    ids.push(...created.map((unit) => unit.id));
  }
  return ids;
}

/** Saves the design and reads it back: fails if the server kept another mode than asked (e.g. dropped a setting). */
async function saveDesign(api, studyId, mode) {
  const saved = await api("POST", paths.design(studyId), designBody(mode));
  const stored = await api("GET", paths.designVersion(studyId, saved.id));
  const resolved = modeOfDesign(stored);
  if (resolved !== mode)
    throw new Error(`Study ${studyId}: asked for mode "${mode}", the stored design is "${resolved}"`);
  return saved.id;
}

/** The link secret of each coder: a crowd shares one link, experts have a link each. */
async function coderSecrets(api, studyId, mode, coders) {
  const links = asList(await api("GET", paths.links(studyId)));
  if (mode !== "experts") return Array.from({ length: coders }, () => links[0].secret);
  const byCoder = new Map(links.map((link) => [linkCoder(link), link.secret]));
  return Array.from({ length: coders }, (_, n) => {
    const secret = byCoder.get(expertName(n));
    if (!secret) throw new Error(`Study ${studyId}: no link for ${expertName(n)}`);
    return secret;
  });
}

/**
 * A deployed study with `units` units for `coders` coders in `mode`:
 * `{ studyId, coderStudyId, mode, units, coders, secrets }` (`coderStudyId`: the
 * study's id in the coder API; `secrets[n]`: the link of coder n).
 */
export async function createStudy(api, { name, mode, units, coders }) {
  const study = await api("POST", paths.studies, { name, coderKind: mode === "experts" ? "expert" : "crowd" });
  const unitIds = await uploadUnits(api, study.id, units);
  if (mode === "experts") {
    await api("POST", paths.coders(study.id), expertCodersBody(coders));
    await api("PUT", paths.codersColumn(study.id), codersColumnBody(unitIds, coders));
  }
  const designVersionId = await saveDesign(api, study.id, mode);
  await api("PUT", paths.deployment(study.id), { designVersionId });
  const secrets = await coderSecrets(api, study.id, mode, coders);
  return { studyId: study.id, coderStudyId: coderStudyId(study), mode, units, coders, secrets };
}

/**
 * Checks a coder's session against the study's mode, by the number of units
 * the server says they will get: unknown in a shared queue (it depends on
 * the other coders), all units for a crowd without one, their own share for
 * an expert. Throws when the server runs another mode than the one measured.
 */
export function checkSessionMode(study, totalUnits) {
  const share = [Math.floor(study.units / study.coders), Math.ceil(study.units / study.coders)];
  const ok =
    study.mode === "shared"
      ? totalUnits === null
      : study.mode === "all"
        ? totalUnits === study.units
        : share.includes(totalUnits);
  if (!ok) {
    throw new Error(
      `Study ${study.studyId}: mode "${study.mode}" with ${study.units} units and ${study.coders} coders, but a coder gets ${totalUnits} units`,
    );
  }
}
