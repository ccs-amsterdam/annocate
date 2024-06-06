"use client";
import { UnitsTable } from "./UnitsTable";
import { Loading } from "@/components/ui/loader";
import { Database, Palette, Plus } from "lucide-react";
import DBSelect from "@/components/Common/DBSelect";
import { useUnitLayouts } from "@/app/api/projects/[projectId]/units/layouts/query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useCreateEmptyLayout } from "@/components/Forms/layoutForms";
import { useState } from "react";

export default function Users({ params }: { params: { projectId: number } }) {
  const useLayoutsProps = useUnitLayouts(params.projectId);
  const [newLayoutName, setNewLayoutName] = useState("");
  const { create } = useCreateEmptyLayout(params.projectId);
  const router = useRouter();

  return (
    <div className="mx-auto mt-10 grid max-w-[1400px] grid-cols-1 gap-12 lg:grid-cols-[1fr,1fr] lg:gap-6 lg:px-3">
      <div className="flex w-full flex-col gap-6">
        <div className="prose max-w-none border-2 border-secondary p-4 dark:prose-invert lg:rounded-md">
          <h3 className="mb-4 ">Manage Units</h3>
          <p>
            Here you manage your coding units. You can upload <b>Unit data</b> and design <b>Layouts</b> for displaying
            units to coders.
          </p>
          <p>
            A simple project might just have a single collection of units and a single layout, but you can have multiple
            collections and layouts. This way, you can then make different layouts for different collections, or even
            different layouts for the same collection (e.g., for experiments)
          </p>
        </div>
        <div className="flex items-center gap-3 bg-primary p-4 text-primary-foreground lg:rounded-md">
          <Palette />
          <h3 className="text-lg font-semibold">Layouts</h3>
        </div>
        <div>
          <DBSelect {...useLayoutsProps} nameField={"name"} projectId={params.projectId} onSelect={(layout) => {}}>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Create new layout"
                value={newLayoutName}
                onChange={(e) => setNewLayoutName(e.target.value)}
              />
              <Button
                disabled={!newLayoutName}
                className="ml-auto flex  w-min gap-1"
                variant="secondary"
                onClick={() =>
                  create(newLayoutName).then(({ id }) =>
                    router.push(`/projects/${params.projectId}/units/layouts/${id}`),
                  )
                }
              >
                <Plus />
              </Button>
            </div>
          </DBSelect>
        </div>
      </div>
      <div className=" ">
        <div className="flex items-center gap-3 bg-primary p-4 text-primary-foreground lg:rounded-md">
          <Database />
          <h3 className="text-lg font-semibold">Data</h3>
        </div>
        <div className="mt-3 px-3 lg:px-0">
          <UnitsTable projectId={params.projectId} />
        </div>
      </div>
    </div>
  );
}
