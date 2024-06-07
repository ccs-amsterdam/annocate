"use client";

import { useUnitLayout } from "@/app/api/projects/[projectId]/units/layouts/query";
import { UnitLayoutSchema } from "@/app/api/projects/[projectId]/units/layouts/schemas";
import { Loading } from "@/components/ui/loader";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { UpdateLayout } from "@/components/Forms/layoutForms";

type Layout = z.infer<typeof UnitLayoutSchema>;

export default function Layout({ params }: { params: { projectId: number; layoutId: number } }) {
  const [preview, setPreview] = useState<Layout | undefined>();

  const { data: layout, isLoading } = useUnitLayout(params.projectId, params.layoutId);

  const confirmUpdate = useCallback(() => {
    toast.success("Updated layout");
  }, []);

  if (isLoading) return <Loading />;
  if (!layout) return <div className="ml-10 mt-10">Layout not found</div>;

  return (
    <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-3 lg:grid-cols-2">
      <div className="relative flex justify-center">{/* <PreviewCodebook preview={preview} /> */}</div>
      <div className="max-h-[calc(100vh-var(--header-height))] max-w-[600px] overflow-auto py-6">
        <UpdateLayout
          projectId={params.projectId}
          current={layout}
          setPreview={setPreview}
          afterSubmit={confirmUpdate}
        />
      </div>
    </div>
  );
}
