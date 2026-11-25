import { useState, type ReactNode } from "react";
import { TEST_SET, type UnitField } from "@annotinder/contracts";
import type { ResearcherApi } from "../../../../api/httpResearcherApi";
import {
  useCodersQuery,
  useCreateUnitsMutation,
  usePutSetGroupMutation,
  useSetGroupsQuery,
  useUnitsQuery,
} from "../../../../admin/queries";
import {
  unitsLosingRole,
  unknownCodersText,
  unknownFileCoders,
  uploadFailureText,
  uploadUnits,
  type CsvUpload,
  type JoinMode,
} from "../../../../admin/uploadUnits";
import { Button } from "@/components/ui/button";
import { HelpButton } from "../../../../help/HelpButton";
import { codersOfKind } from "../../../../admin/codersTable";
import { CsvUnitsForm } from "./CsvUnitsForm";
import { JoinSets, LosingRoles, ReplaceExisting } from "./UploadChoices";

/**
 * Uploading units from a CSV (docs/client.md §7, "Units"): choose a file,
 * then per column whether and as which field it is uploaded, and its type.
 * Columns named like a field of the study are linked to it (and keep its
 * type); "Use column names" gives every other column its own (valid) name.
 * Values are checked against the types before anything is uploaded, and a
 * coder_set column against the study's expert coders: a file that names
 * another coder isn't uploaded.
 */
export function UploadUnits({
  client,
  studyFields,
  onDone,
}: {
  client: ResearcherApi;
  studyFields: UnitField[];
  onDone: () => void;
}) {
  const createUnits = useCreateUnitsMutation(client);
  const putGroup = usePutSetGroupMutation(client);
  const existingUnits = useUnitsQuery(client).data ?? [];
  const groups = useSetGroupsQuery(client).data ?? [];
  const coders = useCodersQuery(client).data?.coders;
  // Per group (not in the file as a sets column): what to do with the new units
  const [addTo, setAddTo] = useState<Record<string, "" | JoinMode>>({});
  const [seed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [overwriteCoded, setOverwriteCoded] = useState(false);
  const [result, setResult] = useState<CsvUpload | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  // Units that already exist (by id), and which of those were coded.
  const byId = new Map(existingUnits.map((u) => [u.externalId, u]));
  const replaced = result ? result.units.filter((u) => byId.has(u.externalId)) : [];
  const coded = replaced.filter((u) => byId.get(u.externalId)!.coded);
  const added = result ? result.units.filter((u) => !byId.has(u.externalId)) : [];
  // Set columns the new units could join: those the file doesn't set itself (not test_set: test units are chosen)
  const otherGroups = groups.filter(
    (g) => g.name !== TEST_SET && !result?.setGroups.some((s) => s.group === g.name) && g.sets.length > 0,
  );

  const losing = result ? unitsLosingRole(result.setGroups, groups, existingUnits) : [];
  // Coders the file's coder_set names that the study doesn't have (unknown until the coders are read)
  const experts = codersOfKind(coders ?? [], "expert").map((c) => c.coder);
  const unknown = result && coders ? unknownFileCoders(result.setGroups, experts) : [];

  async function upload() {
    if (!result) return;
    setFailure(null);
    const outcome = await uploadUnits(
      {
        units: result.units,
        overwrite,
        overwriteCoded,
        setGroups: result.setGroups,
        join: otherGroups.flatMap((group) => {
          const mode = addTo[group.name];
          return mode ? [{ group, mode }] : [];
        }),
        addedIds: added.map((u) => u.externalId),
        seed,
      },
      {
        createUnits: (body) => createUnits.mutateAsync(body),
        listUnits: () => client.listUnits(),
        putSetGroup: (group, body) => putGroup.mutateAsync({ group, body }),
      },
      setProgress,
    );
    setProgress(null);
    if (outcome.error === null) onDone();
    else setFailure(uploadFailureText(outcome, result.units.length));
  }

  return (
    <Section onCancel={onDone}>
      <CsvUnitsForm studyFields={studyFields} onResult={setResult} />
      {result && (
        <ReplaceExisting
          replaced={replaced.length}
          coded={coded.length}
          overwrite={overwrite}
          overwriteCoded={overwriteCoded}
          onOverwrite={setOverwrite}
          onOverwriteCoded={setOverwriteCoded}
        />
      )}
      {result && result.errors.length === 0 && (
        <>
          <JoinSets added={added.length} groups={otherGroups} addTo={addTo} onChange={setAddTo} />
          <LosingRoles losing={losing} />
        </>
      )}
      {unknown.length > 0 && <p className="text-sm text-destructive">{unknownCodersText(unknown)}</p>}
      {result && (
        <div className="flex items-center gap-3">
          <Button
            onClick={() => void upload()}
            disabled={
              result.errors.length > 0 ||
              unknown.length > 0 ||
              progress !== null ||
              (replaced.length > 0 && !overwrite) ||
              (overwrite && coded.length > 0 && !overwriteCoded)
            }
          >
            {progress !== null
              ? `Uploading ${progress} / ${result.units.length}...`
              : `Upload ${result.units.length} units`}
          </Button>
          {failure && <p className="text-sm text-destructive">{failure}</p>}
        </div>
      )}
    </Section>
  );
}

function Section({ children, onCancel }: { children: ReactNode; onCancel: () => void }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          Upload units from CSV <HelpButton topic="uploading-units" label="Help: uploading units" />
        </h3>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {children}
    </section>
  );
}
