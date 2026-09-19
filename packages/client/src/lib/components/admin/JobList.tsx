import { useState } from "react";
import type { JobResponse } from "@annotinder/contracts";
import type { AdminClient } from "../../api/httpAdminClient";
import { useCreateJobMutation, useDeleteJobMutation, useJobsQuery } from "../../admin/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, FolderOpen, Trash2, Calendar, Archive } from "lucide-react";

interface JobListProps {
  client: AdminClient;
  onSelectJob: (jobId: number) => void;
}

export function JobList({ client, onSelectJob }: JobListProps) {
  const jobsQuery = useJobsQuery(client);
  const createJob = useCreateJobMutation(client);
  const deleteJob = useDeleteJobMutation(client);

  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newJobName, setNewJobName] = useState("");
  const [jobToDelete, setJobToDelete] = useState<JobResponse | null>(null);

  if (jobsQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground animate-pulse">Loading jobs...</p>
      </div>
    );
  }

  if (jobsQuery.isError) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
        <p className="font-medium text-destructive">Failed to load jobs</p>
        <p className="mt-1 text-sm text-muted-foreground">{jobsQuery.error.message}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => jobsQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const jobs = jobsQuery.data ?? [];
  const filteredJobs = jobs.filter((j) =>
    j.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJobName.trim()) return;
    createJob.mutate(
      { name: newJobName.trim(), archived: false },
      {
        onSuccess: (created) => {
          setNewJobName("");
          setShowCreateModal(false);
          onSelectJob(created.id);
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Jobs</h1>
          <p className="text-sm text-muted-foreground">
            Manage annotation jobs, codebooks, units, and coders.
          </p>
        </div>
        <Button
          onClick={() => setShowCreateModal(true)}
          className="w-fit gap-2 shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Create new job
        </Button>
      </div>

      {/* Search & Filter Toolbar */}
      {jobs.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search jobs..."
            className="pl-9"
          />
        </div>
      )}

      {/* Jobs List */}
      {filteredJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-12 text-center">
          <div className="rounded-full bg-primary/10 p-4 text-primary">
            <FolderOpen className="h-8 w-8" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-foreground">
            {jobs.length === 0 ? "No jobs yet" : "No matching jobs"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-xs">
            {jobs.length === 0
              ? "Get started by creating your first annotation job."
              : `No jobs matched the query "${search}".`}
          </p>
          {jobs.length === 0 && (
            <Button
              onClick={() => setShowCreateModal(true)}
              variant="outline"
              className="mt-5 gap-2"
            >
              <Plus className="h-4 w-4" />
              Create job
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredJobs.map((job) => (
            <div
              key={job.id}
              onClick={() => onSelectJob(job.id)}
              className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/50 hover:shadow-md cursor-pointer"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    #{job.id}
                  </span>
                  {job.archived ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground font-medium">
                      <Archive className="h-3 w-3" /> Archived
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary font-medium">
                      Active
                    </span>
                  )}
                </div>

                <h3 className="mt-3 text-lg font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors line-clamp-1">
                  {job.name}
                </h3>

                <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>
                    Created{" "}
                    {job.created
                      ? new Date(job.created).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : "Recently"}
                  </span>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-border/60 pt-3">
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-xs text-primary font-medium hover:bg-primary/10 p-0 h-auto"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectJob(job.id);
                  }}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Open job
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  title="Delete job"
                  onClick={(e) => {
                    e.stopPropagation();
                    setJobToDelete(job);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Job Dialog Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-foreground">Create New Job</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter a descriptive name for your annotation job.
            </p>
            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Job Name
                </label>
                <Input
                  autoFocus
                  placeholder="e.g. Sentiment Analysis Phase 1"
                  value={newJobName}
                  onChange={(e) => setNewJobName(e.target.value)}
                  required
                />
              </div>

              {createJob.isError && (
                <p className="text-xs text-destructive">{createJob.error.message}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewJobName("");
                  }}
                  disabled={createJob.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createJob.isPending || !newJobName.trim()}>
                  {createJob.isPending ? "Creating..." : "Create Job"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Job Confirmation Modal */}
      {jobToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-foreground">Delete Job</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to delete <strong className="text-foreground">{jobToDelete.name}</strong>?
              This will permanently delete all its codebooks, units, and coder annotations.
            </p>

            {deleteJob.isError && (
              <p className="mt-2 text-xs text-destructive">{deleteJob.error.message}</p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setJobToDelete(null)}
                disabled={deleteJob.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={deleteJob.isPending}
                onClick={() => {
                  deleteJob.mutate(jobToDelete.id, {
                    onSuccess: () => setJobToDelete(null),
                  });
                }}
              >
                {deleteJob.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
