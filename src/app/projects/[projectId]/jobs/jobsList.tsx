import { Paginate } from "@/app/api/queryHelpers";
import { GetMetaSchema } from "@/app/api/schemaHelpers";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Dot, DotIcon, Plus, X } from "lucide-react";
import { useJobs } from "@/app/api/projects/[projectId]/jobs/query";
import { Button } from "@/components/ui/button";
import { DBPagination, DBSearch } from "@/components/Common/DBTable";
import { Loading } from "@/components/ui/loader";
import { SimpleDialog } from "@/components/ui/simpleDialog";
import { CreateJob } from "@/components/Forms/jobForms";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Drawer, DrawerClose, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import Job from "../page";

export default function JobsList({ projectId }: { projectId: number }) {
  const [jobId, setJobId] = useState<number | undefined>(undefined);
  const props = useJobs(projectId);
  const [prevProps, setPrevProps] = useState(() => {
    const { data, meta, isLoading } = props;
    return { data, meta, isLoading };
  });

  const { data, meta, isLoading } = props;
  useEffect(() => {
    setPrevProps({ data, meta, isLoading });
  }, [data, meta, isLoading]);

  const showPagination = props.hasSearch || (prevProps.meta && prevProps.meta.rows > prevProps.meta.pageSize);

  // if (prevProps.isLoading) {
  //   return <Loading />;
  // }

  return (
    <div className={"flex flex-col gap-3"}>
      <CreateJobDialog projectId={projectId} />
      <div>
        <div className={` mb-4 flex select-none gap-3  ${showPagination ? "" : "hidden"}`}>
          <DBSearch search={props.search} isLoading={props.isLoading} />
          <DBPagination paginate={props.paginate} />
        </div>
        {/* <div className={`mb-3 ${props.isLoading ? "" : "hidden"}`}>Searching...</div> */}
        <div className="flex flex-col gap-1">
          {prevProps.data?.map((row, index) => {
            return (
              <Button
                key={index}
                variant="outline"
                className="max-w-full justify-start"
                onClick={() => {
                  setJobId(row.id);
                }}
              >
                {row.name}
              </Button>
            );
          })}
        </div>
      </div>
      <JobDrawer jobId={jobId} onClose={() => setJobId(undefined)} />
    </div>
  );
}

function CreateJobDialog(props: { projectId: number }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="mx-auto mt-2 flex items-center gap-2 ">
          Create new jobs
          <Plus className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-[400px]">
        <CreateJob projectId={props.projectId} afterSubmit={() => {}} />
      </PopoverContent>
    </Popover>
  );
}

function JobDrawer({ jobId, onClose }: { jobId?: number; onClose: () => void }) {
  function renderJob() {
    return <div></div>;
  }

  return (
    <Drawer
      direction="right"
      open={!!jobId}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <DrawerContent className="fixed bottom-0 left-auto   right-0 mt-0 h-screen w-[500px] max-w-[90vw]  rounded-none bg-background p-3 py-0 ">
        <div className="prose overflow-auto pb-16 pt-10 dark:prose-invert">{renderJob()}</div>
        <DrawerClose>
          <Button
            variant="outline"
            size="icon"
            className="absolute bottom-0 right-0 w-full rounded-none bg-background/40 hover:bg-foreground/20"
          >
            <X />
          </Button>
        </DrawerClose>
      </DrawerContent>
    </Drawer>
  );
}
