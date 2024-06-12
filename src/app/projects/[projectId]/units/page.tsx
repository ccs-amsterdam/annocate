"use client";
import { CreateUnitsButton, UnitsTable } from "./UnitsTable";
import { Loading } from "@/components/ui/loader";
import { Database, Palette, Plus } from "lucide-react";
import DBSelect from "@/components/Common/DBSelect";
import { useUnitLayouts } from "@/app/api/projects/[projectId]/units/layouts/query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useCreateEmptyLayout } from "@/components/Forms/layoutForms";
import { useState } from "react";
import { HelpDrawer } from "@/components/Common/HelpDrawer";

export default function Users({ params }: { params: { projectId: number } }) {
  const useLayoutsProps = useUnitLayouts(params.projectId);
  const router = useRouter();

  return (
    <div className="mx-auto mt-10 grid max-w-[1400px] grid-cols-1 gap-12 px-3 lg:grid-cols-[1fr,1fr] lg:gap-6">
      <div className="flex w-full flex-col gap-3">
        <div className="flex items-center gap-3 rounded-md bg-primary p-4 text-primary-foreground">
          <Palette />
          <h3 className="text-lg font-semibold">Layouts</h3>
        </div>
        <div>
          <CreateLayout projectId={params.projectId} />
          <DBSelect
            {...useLayoutsProps}
            nameField={"name"}
            projectId={params.projectId}
            onSelect={(layout) => {
              router.push(`/projects/${params.projectId}/units/layouts/${layout.id}`);
            }}
          />
        </div>
      </div>
      <div className="lg:min-h-[20rem]">
        <div className="flex items-center gap-3 rounded-md bg-primary p-4 text-primary-foreground">
          <Database />
          <h3 className="text-lg font-semibold">Unit sets</h3>
        </div>
        <div className="mt-3 px-3 lg:px-0">
          <CreateUnitsButton projectId={params.projectId} />
        </div>
      </div>
      <div className="mt-6 lg:col-span-2">
        <div className="flex items-center gap-3 rounded-md bg-secondary p-4 text-secondary-foreground">
          <Database />
          <h3 className="text-lg font-semibold">Data</h3>
        </div>
        <div className="mt-3 px-3 lg:px-0">
          <UnitsTable projectId={params.projectId} />
        </div>
      </div>
      <Help />
    </div>
  );
}

function CreateLayout({ projectId }: { projectId: number }) {
  const [newLayoutName, setNewLayoutName] = useState("");
  const { create } = useCreateEmptyLayout(projectId);
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      <Input placeholder="Create new layout" value={newLayoutName} onChange={(e) => setNewLayoutName(e.target.value)} />
      <Button
        disabled={!newLayoutName}
        className="ml-auto flex  w-min gap-1"
        variant="secondary"
        onClick={() =>
          create(newLayoutName).then(({ id }) => {
            router.push(`/projects/${projectId}/units/layouts/${id}`);
          })
        }
      >
        <Plus />
      </Button>
    </div>
  );
}

function Help() {
  return (
    <HelpDrawer className="fixed bottom-5 right-5">
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
    </HelpDrawer>
  );
}
