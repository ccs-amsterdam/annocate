import { useState } from "react";
import { designItems, redirectSettings, type JobResponse } from "@annotinder/contracts";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import { useCodebookQuery, useCodebooksQuery, useCreateJobMutation, useDeleteJobMutation, useJobQuery, useUpdateJobMutation } from "../../admin/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";

/**
 * Job settings (docs/client.md §7), shown at the bottom of the overview: edit
 * the job name, toggle archived status, keep finished sessions open, or
 * delete the job.
 */
export function JobSettings({
  client,
  onDeleted,
}: {
  client: ResearcherApi;
  onDeleted?: () => void;
}) {
  const jobQuery = useJobQuery(client);
  const createJob = useCreateJobMutation(client);

  if (jobQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading job...</p>;

  if (!jobQuery.data) {
    return <CreateJobForm createJob={createJob} />;
  }

  return <JobEditForm key={jobQuery.data.id} job={jobQuery.data} client={client} onDeleted={onDeleted} />;
}

function CreateJobForm({ createJob }: { createJob: ReturnType<typeof useCreateJobMutation> }) {
  const [name, setName] = useState("");

  return (
    <form
      className="flex max-w-sm flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        createJob.mutate({ name, archived: false });
      }}
    >
      <h2 className="text-lg font-medium">Create job</h2>
      <p className="text-sm text-muted-foreground">Enter a job name to get started.</p>
      <Input placeholder="Job name" value={name} onChange={(e) => setName(e.target.value)} required />
      <Button type="submit" disabled={createJob.isPending}>
        {createJob.isPending ? "Creating..." : "Create job"}
      </Button>
      {createJob.isError && <p className="text-sm text-destructive">{createJob.error.message}</p>}
    </form>
  );
}

function JobEditForm({
  job,
  client,
  onDeleted,
}: {
  job: JobResponse;
  client: ResearcherApi;
  onDeleted?: () => void;
}) {
  const updateJob = useUpdateJobMutation(client);
  const deleteJob = useDeleteJobMutation(client);
  const [name, setName] = useState(job.name);
  const [archived, setArchived] = useState(job.archived);
  const [keepOpen, setKeepOpen] = useState(job.keepSessionsOpen);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [redirects, setRedirects] = useState<Record<string, string>>(job.redirectUrls ?? {});
  // The end items' redirect settings in the latest codebook version, and any URL already set
  const codebooks = useCodebooksQuery(client).data ?? [];
  const latest = useCodebookQuery(client, codebooks.at(-1)?.id ?? null).data;
  const settingNames = [...new Set([...(latest ? redirectSettings(designItems(latest)) : []), ...Object.keys(job.redirectUrls ?? {})])];
  const redirectsDirty = JSON.stringify(redirects) !== JSON.stringify(job.redirectUrls ?? {});
  const dirty = name !== job.name || archived !== job.archived || keepOpen !== job.keepSessionsOpen || redirectsDirty;

  return (
    <div className="max-w-md space-y-6">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const redirectUrls = Object.fromEntries(Object.entries(redirects).filter(([, url]) => url.trim() !== ""));
          updateJob.mutate({ id: job.id, body: { name, archived, keepSessionsOpen: keepOpen, redirectUrls } });
        }}
      >
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Job Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
            className="rounded border-input text-primary focus:ring-primary h-4 w-4"
          />
          <span>Archived (hide from active coding lists)</span>
        </label>

        <label className="flex items-start gap-2 text-sm text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={keepOpen}
            onChange={(e) => setKeepOpen(e.target.checked)}
            className="mt-0.5 rounded border-input text-primary focus:ring-primary h-4 w-4"
          />
          <span>
            Keep finished sessions open
            <span className="block text-xs text-muted-foreground">
              Off (recommended): once coders finish, they can go back for 15 minutes; then their answers can&apos;t be looked at
              or changed, also not by someone who gets into their account or device later.
            </span>
          </span>
        </label>

        {settingNames.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-foreground">Panel return links</legend>
            <p className="text-xs text-muted-foreground">
              End items send coders on to these. They belong to this run (a panel gives each study its own links), not to the design,
              and take effect without deploying. May use $var and $session values.
            </p>
            {settingNames.map((setting) => (
              <label key={setting} className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                <span className="font-mono">{setting}</span>
                <Input
                  aria-label={`URL for ${setting}`}
                  className="font-mono text-xs"
                  placeholder="https://panel.example/return?id=$session.participant"
                  value={redirects[setting] ?? ""}
                  onChange={(e) => setRedirects({ ...redirects, [setting]: e.target.value })}
                />
              </label>
            ))}
          </fieldset>
        )}

        <div className="pt-2">
          <Button type="submit" disabled={!dirty || updateJob.isPending}>
            {updateJob.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
        {updateJob.isError && <p className="text-sm text-destructive">{updateJob.error.message}</p>}
        {updateJob.isSuccess && !dirty && (
          <p className="text-xs text-primary font-medium">Settings saved successfully.</p>
        )}
      </form>

      {/* Danger Zone */}
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-destructive">Danger Zone</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Deleting this job will permanently remove all associated codebooks, units, and coder annotations.
        </p>

        {!showConfirmDelete ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="mt-4 gap-1.5"
            onClick={() => setShowConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
            Delete Job
          </Button>
        ) : (
          <div className="mt-4 flex items-center gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={deleteJob.isPending}
              onClick={() => {
                deleteJob.mutate(job.id, {
                  onSuccess: () => {
                    onDeleted?.();
                  },
                });
              }}
            >
              {deleteJob.isPending ? "Deleting..." : "Confirm Delete"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowConfirmDelete(false)}
              disabled={deleteJob.isPending}
            >
              Cancel
            </Button>
          </div>
        )}
        {deleteJob.isError && <p className="mt-2 text-xs text-destructive">{deleteJob.error.message}</p>}
      </div>
    </div>
  );
}
