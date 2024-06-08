"use client";

import { useUnitLayout } from "@/app/api/projects/[projectId]/units/layouts/query";
import { UnitLayoutSchema } from "@/app/api/projects/[projectId]/units/layouts/schemas";
import { Loading } from "@/components/ui/loader";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { UpdateLayout } from "@/components/Forms/layoutForms";
import { useColumns } from "@/app/api/projects/[projectId]/units/columns/query";
import { HelpDrawer } from "@/components/Common/HelpDrawer";
import { useUnitsets } from "@/app/api/projects/[projectId]/units/query";
import { SimpleDropdown } from "@/components/ui/simpleDropdown";
import { UnitsetsResponseSchema } from "@/app/api/projects/[projectId]/units/unitsets/schemas";

type Layout = z.infer<typeof UnitLayoutSchema>;
type UnitSet = z.infer<typeof UnitsetsResponseSchema>;

export default function Layout({ params }: { params: { projectId: number; layoutId: number } }) {
  const [preview, setPreview] = useState<Layout | undefined>();
  const [selectedUnitsets, setSelectedUnitsets] = useState<string[]>();
  const { data: columns, isLoading: columnsLoading } = useColumns(params.projectId, selectedUnitsets);
  const { data: unitsets, isLoading: unitsetsLoading } = useUnitsets(params.projectId);
  const { data: layout, isLoading: layoutLoading } = useUnitLayout(params.projectId, params.layoutId);

  const confirmUpdate = useCallback(() => {
    toast.success("Updated layout");
  }, []);

  if (columnsLoading || layoutLoading || unitsetsLoading) return <Loading />;
  if (!layout || !columns || !unitsets) return <div className="ml-10 mt-10">Layout or columns not found</div>;

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="mx-auto mb-6 flex w-full items-center justify-start gap-3 rounded-none border-b bg-primary p-3 text-primary-foreground">
        <HelpDrawer size={26} className="ml-4">
          <h3>Reference Unitset</h3>

          <p>
            When designing a unit layout, you need to consider the columns that are available in the unit data. The
            reference units are used to provide hints for available columns, and are shown in the preview.
          </p>
        </HelpDrawer>
        <SimpleDropdown
          options={unitsets}
          optionKey="name"
          placeholder="Select unitset"
          value={selectedUnitsets?.[0]}
          setValue={(unitset) => setSelectedUnitsets([unitset])}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="relative flex justify-center">{/* <PreviewCodebook preview={preview} /> */}</div>
        <div className="max-h-[calc(100vh-var(--header-height))] max-w-[600px] overflow-auto py-6">
          <UpdateLayout
            projectId={params.projectId}
            current={layout}
            columns={columns}
            setPreview={setPreview}
            afterSubmit={confirmUpdate}
          />
        </div>
      </div>
    </div>
  );
}
