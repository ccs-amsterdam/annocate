import { useState } from "react";
import type { JobResponse } from "@annotinder/contracts";
import type { AdminClient } from "../../api/httpAdminClient";
import { useCreateJobMutation, useJobQuery, useUpdateJobMutation } from "../../admin/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Job settings panel (design plan §5.1). A server hosts exactly ONE job
 * (design plan §3: single-job-per-deployment), so this is "create the job if
 * it doesn't exist yet, else view/edit its name+archived flag" -- not a list.
 */
export function JobSettings({ client }: { client: AdminClient }) {
  const jobQuery = useJobQuery(client);
  const createJob = useCreateJobMutation(client);

  if (jobQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading job...</p>;

  if (!jobQuery.data) {
    return <CreateJobForm createJob={createJob} />;
  }

  // Keyed by job.id so the form's local draft state (below) is initialized
  // fresh from `job` exactly once per distinct job identity via lazy
  // `useState` initializers, rather than needing a
  // `useEffect(() => setName(job.name), [job])` to sync it in -- design
  // plan §6.5, avoids the react-hooks/set-state-in-effect anti-pattern.
  return <JobEditForm key={jobQuery.data.id} job={jobQuery.data} client={client} />;
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
      <p className="text-sm text-muted-foreground">This server doesn't have a job yet -- create one to get started.</p>
      <Input placeholder="Job name" value={name} onChange={(e) => setName(e.target.value)} required />
      <Button type="submit" disabled={createJob.isPending}>
        {createJob.isPending ? "Creating..." : "Create job"}
      </Button>
      {createJob.isError && <p className="text-sm text-destructive">{createJob.error.message}</p>}
    </form>
  );
}

function JobEditForm({ job, client }: { job: JobResponse; client: AdminClient }) {
  const updateJob = useUpdateJobMutation(client);
  const [name, setName] = useState(job.name);
  const [archived, setArchived] = useState(job.archived);
  const dirty = name !== job.name || archived !== job.archived;

  return (
    <form
      className="flex max-w-sm flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        updateJob.mutate({ id: job.id, body: { name, archived } });
      }}
    >
      <h2 className="text-lg font-medium">Job settings</h2>
      <Input value={name} onChange={(e) => setName(e.target.value)} required />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
        Archived
      </label>
      <Button type="submit" disabled={!dirty || updateJob.isPending}>
        {updateJob.isPending ? "Saving..." : "Save"}
      </Button>
      {updateJob.isError && <p className="text-sm text-destructive">{updateJob.error.message}</p>}
    </form>
  );
}
