"use client";

import { useJob } from "@/app/api/projects/[projectId]/jobs/query";
import { useUnitLayout } from "@/app/api/projects/[projectId]/units/layouts/query";
import { Layout } from "@/app/types";
import { Preview } from "@/components/Common/Preview";
import { Loading } from "@/components/ui/loader";
import { useCallback, useState } from "react";
import { toast } from "sonner";

export default function UnitsetPage({ params }: { params: { projectId: number; jobId: number } }) {
  const [layoutPreview, setLayoutPreview] = useState<Layout | undefined>();

  const { data: job, isLoading: jobLoading } = useJob(params.projectId, params.jobId);

  const confirmUpdate = useCallback(() => {
    toast.success("Updated layout");
  }, []);

  if (jobLoading) return <Loading />;
  if (!job) return <div className="ml-10 mt-10">Layout or columns not found</div>;

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
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="relative flex justify-center">
          <Preview projectId={params.projectId} layout={layoutPreview} />
        </div>
        <div className="max-h-[calc(100vh-var(--header-height))] max-w-[600px] overflow-auto py-6"></div>
      </div>
    </div>
  );
}
