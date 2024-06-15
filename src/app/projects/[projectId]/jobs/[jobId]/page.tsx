"use client";

import { useJob } from "@/app/api/projects/[projectId]/jobs/query";
import { useUnitLayout } from "@/app/api/projects/[projectId]/units/layouts/query";
import { useUnitset, useUnitsets } from "@/app/api/projects/[projectId]/units/query";
import { Layout } from "@/app/types";
import { Preview } from "@/components/Common/Preview";
import { UpdateLayout } from "@/components/Forms/layoutForms";
import { Loading } from "@/components/ui/loader";
import { SimpleDropdown } from "@/components/ui/simpleDropdown";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";

export default function UnitsetPage({ params }: { params: { projectId: number; jobId: number } }) {
  const [layoutPreview, setLayoutPreview] = useState<Layout | undefined>();

  const { data: job, isLoading: jobLoading } = useJob(params.projectId, params.jobId);
  const { data: unitset, isLoading: unitsetLoading } = useUnitset(params.projectId, job?.unitsetId);
  const { data: layout, isLoading: layoutLoading } = useUnitLayout(params.projectId, job?.layoutId);

  const confirmUpdate = useCallback(() => {
    toast.success("Updated layout");
  }, []);

  if (unitsetLoading) return <Loading />;
  if (!unitset) return <div className="ml-10 mt-10">Layout or columns not found</div>;

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="mx-auto mb-6 flex w-full select-none items-center justify-center gap-3 rounded-none border-b bg-primary p-3 text-primary-foreground">
        {/* <HelpDrawer size={26} className="ml-4">
          <h3>Reference Unitset</h3>

          <p>
            When designing a unit layout, you need to consider the columns that are available in the unit data. The
            reference units are used to provide hints for available columns, and are shown in the preview.
          </p>
        </HelpDrawer> */}
        <span className="text-lg">Unit set:</span>
        <SelectUnitset projectId={params.projectId} current={unitset.name} />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="relative flex justify-center">
          <Preview projectId={params.projectId} layout={layoutPreview} />
        </div>
        <div className="max-h-[calc(100vh-var(--header-height))] max-w-[600px] overflow-auto py-6">
          {!layout ? null : (
            <UpdateLayout
              projectId={params.projectId}
              current={layout}
              columns={unitset.columns}
              afterSubmit={confirmUpdate}
              setPreview={setLayoutPreview}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SelectUnitset({ projectId, current }: { projectId: number; current?: string }) {
  const { data: unitsets, isLoading } = useUnitsets(projectId, {});
  const router = useRouter();

  if (isLoading) return <Loading />;
  if (!unitsets) return null;
  return (
    <SimpleDropdown
      options={unitsets}
      optionKey="name"
      placeholder="Select unitset"
      value={current}
      onSelect={(unitset) => router.push(`/projects/${projectId}/units/unitsets/${unitset.id}`)}
    />
  );
}
