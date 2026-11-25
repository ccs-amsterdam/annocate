import { useState } from "react";
import { designItems, redirectSettings, type CoderKind, type StudyResponse } from "@annotinder/contracts";
import { ResearcherApiError, type ResearcherApi } from "../../api/httpResearcherApi";
import {
  useDeploymentQuery,
  useDesignVersionQuery,
  useDesignVersionsQuery,
  useStudyQuery,
  useUpdateStudyMutation,
} from "../../admin/queries";
import { InfoTip } from "@/components/ui/info-tip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Trash2 } from "lucide-react";
import { downloadFile } from "../../admin/download";
import { ReopenSetting } from "./session/ReopenSetting";
import { WhoCodesCards } from "./session/WhoCodesCards";
import { DeleteStudyDialog } from "./studyList/DeleteStudyDialog";

/**
 * Study settings (docs/client.md §7), on the Settings page: the study's name,
 * archived, who codes (until the first deploy), keeping finished sessions
 * open, panel return links, exporting the whole study, and deleting it.
 */
export function StudySettings({ client, onDeleted }: { client: ResearcherApi; onDeleted?: () => void }) {
  const studyQuery = useStudyQuery(client);

  if (studyQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading study...</p>;

  if (!studyQuery.data)
    return <p className="text-sm text-destructive">{studyQuery.error?.message ?? "This study can't be loaded."}</p>;

  return <StudyEditForm key={studyQuery.data.id} study={studyQuery.data} client={client} onDeleted={onDeleted} />;
}

/** The redirect URLs that are set, sorted by name. */
const setUrls = (urls: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(urls)
      .filter(([, url]) => url.trim() !== "")
      .sort(([a], [b]) => a.localeCompare(b)),
  );

/** The settings form, the export, and deleting the study. */
function StudyEditForm({
  study,
  client,
  onDeleted,
}: {
  study: StudyResponse;
  client: ResearcherApi;
  onDeleted?: () => void;
}) {
  const updateStudy = useUpdateStudyMutation(client);
  const [name, setName] = useState(study.name);
  const [archived, setArchived] = useState(study.archived);
  const [coderKind, setCoderKind] = useState(study.coderKind);
  // Who codes is fixed by the first deploy (unknown yet: fixed, until the deployment is read)
  const deployment = useDeploymentQuery(client);
  const kindLocked = deployment.data !== null;
  const [reopenMinutes, setReopenMinutes] = useState(study.reopenMinutes);
  const [redirects, setRedirects] = useState<Record<string, string>>(study.redirectUrls ?? {});
  // The end items' redirect settings in the latest design version, and any URL already set
  const designVersions = useDesignVersionsQuery(client).data ?? [];
  const latest = useDesignVersionQuery(client, designVersions.at(-1)?.id ?? null).data;
  const settingNames = [
    ...new Set([...(latest ? redirectSettings(designItems(latest)) : []), ...Object.keys(study.redirectUrls ?? {})]),
  ];
  // Compared as saved: without empty URLs, in any key order (the server stores JSONB)
  const redirectsDirty = JSON.stringify(setUrls(redirects)) !== JSON.stringify(setUrls(study.redirectUrls ?? {}));
  const dirty =
    name !== study.name ||
    archived !== study.archived ||
    coderKind !== study.coderKind ||
    reopenMinutes !== study.reopenMinutes ||
    redirectsDirty;

  return (
    <div className="max-w-md space-y-6">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const redirectUrls = setUrls(redirects);
          updateStudy.mutate({
            id: study.id,
            body: {
              name,
              archived,
              // Only a change is sent: after the first deploy the server refuses another kind
              ...(coderKind !== study.coderKind ? { coderKind } : {}),
              reopenMinutes,
              redirectUrls,
            },
          });
        }}
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Study Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
            className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
          />
          <span>Archived (hide from active coding lists)</span>
        </label>

        <WhoCodesSetting value={coderKind} locked={kindLocked} onChange={setCoderKind} />

        <ReopenSetting value={reopenMinutes} onChange={setReopenMinutes} />

        {settingNames.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 flex items-center gap-1 text-sm font-medium text-foreground">
              Panel return links
              <InfoTip label="About panel return links">
                End items send coders on to these. They belong to this run (a panel gives each study its own links), not
                to the design, and take effect without deploying. May use $var and $session values.
              </InfoTip>
            </legend>
            {settingNames.map((setting) => (
              <label key={setting} className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                <span className="font-mono">{setting}</span>
                <Input
                  aria-label={`URL for ${setting}`}
                  className="font-mono text-xs"
                  placeholder="https://panel.example/return?id=$session.coder"
                  value={redirects[setting] ?? ""}
                  onChange={(e) => setRedirects({ ...redirects, [setting]: e.target.value })}
                />
              </label>
            ))}
          </fieldset>
        )}

        <div className="pt-2">
          <Button type="submit" disabled={!dirty || updateStudy.isPending}>
            {updateStudy.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
        {updateStudy.isError && <p className="text-sm text-destructive">{updateStudy.error.message}</p>}
        {updateStudy.isSuccess && !dirty && (
          <p className="text-xs font-medium text-primary">Settings saved successfully.</p>
        )}
      </form>

      <StudyExport client={client} />

      <StudyDeletion client={client} study={study} onDeleted={onDeleted} />
    </div>
  );
}

/** Who codes in the study (expert coders or a crowd): a choice until the study's first deploy, then fixed. */
function WhoCodesSetting({
  value,
  locked,
  onChange,
}: {
  value: CoderKind;
  locked: boolean;
  onChange: (kind: CoderKind) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-sm font-medium text-foreground">Who codes</legend>
      <WhoCodesCards value={value} disabled={locked} onChoose={onChange} />
      <p className="text-xs text-muted-foreground">
        {locked
          ? "Fixed since the study's first deploy: coders started, and their links and units follow from it."
          : "Can be changed until the study's first deploy. Changing it sets the design's Who codes to the new kind's defaults."}
      </p>
    </fieldset>
  );
}

/** Deleting the study: a button that opens the dialog asking to confirm it. */
function StudyDeletion({
  client,
  study,
  onDeleted,
}: {
  client: ResearcherApi;
  study: StudyResponse;
  onDeleted?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-destructive">Delete this study</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Permanently removes the study with its design versions, units, coders and their answers, sessions and results
        downloads.
      </p>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="mt-3 gap-1.5"
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="h-4 w-4" />
        Delete Study
      </Button>
      {confirming && (
        <DeleteStudyDialog
          client={client}
          study={study}
          onClose={() => setConfirming(false)}
          onDeleted={() => onDeleted?.()}
        />
      )}
    </div>
  );
}

/**
 * The whole study as one file (coders and answers included), to restore it
 * or move it to another server: Create new study › From a file imports it
 * (docs/hosting.md "Moving a study"). A study ADMIN's sensitive action.
 */
function StudyExport({ client }: { client: ResearcherApi }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const { file, bytes } = await client.exportStudy();
      downloadFile(bytes, file);
    } catch (e) {
      // A step-up login was offered (the client asks); other errors show
      if (!(e instanceof ResearcherApiError && e.code === "step_up_required"))
        setError(e instanceof ResearcherApiError ? e.reason : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="flex items-center gap-1 text-sm font-semibold">
        Export the whole study
        <InfoTip label="About the study export">
          One file with everything: units, design versions, links, coders and their answers. Import it with Create new
          study › From a file, on this or another AnnoTinder server (the same release or a newer one). It holds
          coders&apos; data: keep it as safe as the study. For an analysis, use the download on the Results page.
        </InfoTip>
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">To back up the study, or move it to another server.</p>
      <Button type="button" variant="outline" size="sm" className="mt-3 gap-1.5" disabled={busy} onClick={download}>
        <Download className="h-4 w-4" />
        {busy ? "Exporting..." : "Export study"}
      </Button>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
