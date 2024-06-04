"use client";
import { useCollections } from "@/app/api/projects/[projectId]/units/query";
import { UnitsTable } from "./UnitsTable";
import { Loading } from "@/components/ui/loader";

export default function Users({ params }: { params: { projectId: number } }) {
  const { data: collections, isLoading: collectionsLoading } = useCollections(params.projectId);

  if (collectionsLoading) return <Loading />;

  return (
    <div className="mx-auto mt-10 grid max-w-[1400px] grid-cols-1 gap-12 lg:grid-cols-[1fr,1fr] lg:gap-6 lg:px-3">
      <div className="w-full">
        <div className="prose p-4 dark:prose-invert lg:rounded-md">
          <h3 className="mb-4 ">Manage Units</h3>
          <p>
            Here you manage your coding units. You can upload <b>Unit data</b>, divide this data over <b>Unit sets</b>,
            and design <b>Layouts</b> for presenting units.
          </p>
          <p>
            A simple project might just have a single unit set with a single layout. Working with multiple sets is
            useful for managing larger projects or experimenting with different layouts.
          </p>
          <p>To divide units over unit sets you can assign them to collections</p>
        </div>
        <div className="m-4 grid grid-cols-3 gap-3 rounded border-2 border-primary">
          <div className="p-4">
            <h3 className="text-base font-semibold">Unit set 1</h3>
            <div>Layout 1</div>
          </div>
        </div>
      </div>
      <div className=" ">
        <div className="bg-primary text-primary-foreground lg:rounded-md">
          <h3 className="p-4 text-lg font-semibold">Unit data</h3>
        </div>
        <div className="mt-3 px-3 lg:px-0">
          <UnitsTable projectId={params.projectId} />
        </div>
      </div>
    </div>
  );
}
