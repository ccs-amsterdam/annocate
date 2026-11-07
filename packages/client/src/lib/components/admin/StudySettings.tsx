import { useState } from "react";
import { designItems, redirectSettings, type StudyResponse } from "@annotinder/contracts";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import { useDesignVersionQuery, useDesignVersionsQuery, useCreateStudyMutation, useDeleteStudyMutation, useStudyQuery, useUpdateStudyMutation } from "../../admin/queries";
import { InfoTip } from "@/components/ui/info-tip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";

/**
 * Study settings (docs/client.md §7), shown at the bottom of the overview: edit
 * the study name, toggle archived status, keep finished sessions open, or
 * delete the study.
 */
export function StudySettings({
  client,
  onDeleted,
}: {
  client: ResearcherApi;
  onDeleted?: () => void;
}) {
  const studyQuery = useStudyQuery(client);
  const createStudy = useCreateStudyMutation(client);

  if (studyQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading study...</p>;

  if (!studyQuery.data) {
    return <CreateStudyForm createStudy={createStudy} />;
  }

  return <StudyEditForm key={studyQuery.data.id} study={studyQuery.data} client={client} onDeleted={onDeleted} />;
}

function CreateStudyForm({ createStudy }: { createStudy: ReturnType<typeof useCreateStudyMutation> }) {
  const [name, setName] = useState("");

  return (
    <form
      className="flex max-w-sm flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        createStudy.mutate({ name, archived: false });
      }}
    >
      <h2 className="text-lg font-medium">Create study</h2>
      <p className="text-sm text-muted-foreground">Enter a study name to get started.</p>
      <Input placeholder="Study name" value={name} onChange={(e) => setName(e.target.value)} required />
      <Button type="submit" disabled={createStudy.isPending}>
        {createStudy.isPending ? "Creating..." : "Create study"}
      </Button>
      {createStudy.isError && <p className="text-sm text-destructive">{createStudy.error.message}</p>}
    </form>
  );
}

/** The redirect URLs that are set, sorted by name. */
const setUrls = (urls: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(urls)
      .filter(([, url]) => url.trim() !== "")
      .sort(([a], [b]) => a.localeCompare(b)),
  );

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
  const deleteStudy = useDeleteStudyMutation(client);
  const [name, setName] = useState(study.name);
  const [archived, setArchived] = useState(study.archived);
  const [keepOpen, setKeepOpen] = useState(study.keepSessionsOpen);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [redirects, setRedirects] = useState<Record<string, string>>(study.redirectUrls ?? {});
  // The end items' redirect settings in the latest design version, and any URL already set
  const designVersions = useDesignVersionsQuery(client).data ?? [];
  const latest = useDesignVersionQuery(client, designVersions.at(-1)?.id ?? null).data;
  const settingNames = [...new Set([...(latest ? redirectSettings(designItems(latest)) : []), ...Object.keys(study.redirectUrls ?? {})])];
  // Compared as saved: without empty URLs, in any key order (the server stores JSONB)
  const redirectsDirty = JSON.stringify(setUrls(redirects)) !== JSON.stringify(setUrls(study.redirectUrls ?? {}));
  const dirty = name !== study.name || archived !== study.archived || keepOpen !== study.keepSessionsOpen || redirectsDirty;

  return (
    <div className="max-w-md space-y-6">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const redirectUrls = setUrls(redirects);
          updateStudy.mutate({ id: study.id, body: { name, archived, keepSessionsOpen: keepOpen, redirectUrls } });
        }}
      >
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Study Name</label>
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
          <span className="flex items-center gap-1">
            Keep finished sessions open
            <InfoTip label="About keeping sessions open">
              Off (recommended): once coders finish, they can go back for 15 minutes; then their answers can&apos;t be looked at or
              changed, also not by someone who gets into their account or device later.
            </InfoTip>
          </span>
        </label>

        {settingNames.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 flex items-center gap-1 text-sm font-medium text-foreground">
              Panel return links
              <InfoTip label="About panel return links">
                End items send coders on to these. They belong to this run (a panel gives each study its own links), not to the design, and
                take effect without deploying. May use $var and $session values.
              </InfoTip>
            </legend>
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
          <Button type="submit" disabled={!dirty || updateStudy.isPending}>
            {updateStudy.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
        {updateStudy.isError && <p className="text-sm text-destructive">{updateStudy.error.message}</p>}
        {updateStudy.isSuccess && !dirty && (
          <p className="text-xs text-primary font-medium">Settings saved successfully.</p>
        )}
      </form>

      {/* Danger Zone */}
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 shadow-sm">
        <h3 className="flex items-center gap-1 text-sm font-semibold text-destructive">
          Delete this study
          <InfoTip label="About deleting">Deleting this study permanently removes its design versions, units, coders and their answers.</InfoTip>
        </h3>

        {!showConfirmDelete ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="mt-3 gap-1.5"
            onClick={() => setShowConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
            Delete Study
          </Button>
        ) : (
          <div className="mt-3 flex items-center gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={deleteStudy.isPending}
              onClick={() => {
                deleteStudy.mutate(study.id, {
                  onSuccess: () => {
                    onDeleted?.();
                  },
                });
              }}
            >
              {deleteStudy.isPending ? "Deleting..." : "Confirm Delete"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowConfirmDelete(false)}
              disabled={deleteStudy.isPending}
            >
              Cancel
            </Button>
          </div>
        )}
        {deleteStudy.isError && <p className="mt-2 text-xs text-destructive">{deleteStudy.error.message}</p>}
      </div>
    </div>
  );
}
