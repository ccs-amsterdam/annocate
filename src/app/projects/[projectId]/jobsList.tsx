import { useJob, useJobs } from "@/app/api/projects/[projectId]/jobs/query";
import DBTable, { DBPagination, DBSearch } from "@/components/Common/DBTable";
import { CreateJob } from "@/components/Forms/jobForms";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useQueryState } from "nuqs";
import { useRouter } from "next/navigation";

const COLUMNS = ["deployed", "modified", "name"];

export default function JobsList({ projectId }: { projectId: number }) {
  const [jobId, setJobId] = useQueryState("jobId");
  const useJobsProps = useJobs(projectId, { sort: "modified", direction: "desc" });
  const [prevProps, setPrevProps] = useState(() => {
    const { data, meta, isLoading } = useJobsProps;
    return { data, meta, isLoading };
  });
  const router = useRouter();

  const { data, meta, isLoading } = useJobsProps;
  useEffect(() => {
    setPrevProps({ data, meta, isLoading });
  }, [data, meta, isLoading]);

  function goToJob(jobId: number) {
    router.push(`/projects/${projectId}/jobs/${jobId}`);
  }

  const showPagination = useJobsProps.hasSearch || (prevProps.meta && prevProps.meta.rows > prevProps.meta.pageSize);

  return (
    <div className={"flex flex-col gap-3 px-3"}>
      <CreateJobDialog projectId={projectId} />
      <DBTable {...useJobsProps} columns={COLUMNS} onSelect={(job) => goToJob(job.id)} />
      {/* <JobDrawer projectId={projectId} jobId={Number(jobId)} onClose={() => setJobId(null)} /> */}
    </div>
  );
}

function CreateJobDialog(props: { projectId: number }) {
  const [openForm, setOpenForm] = useState(false);
  return (
    <Popover open={openForm} onOpenChange={setOpenForm}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="mx-auto mt-2 flex items-center gap-2">
          Create new jobs
          <Plus className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-[400px]">
        <CreateJob
          projectId={props.projectId}
          afterSubmit={() => {
            setOpenForm(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function JobDrawer({ projectId, jobId, onClose }: { projectId: number; jobId?: number; onClose: () => void }) {
  const { data: job, isLoading } = useJob(projectId, jobId);

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
      <DrawerContent className="fixed bottom-0 left-auto right-0 mt-0 h-screen w-[500px] max-w-[90vw] rounded-none bg-background p-3">
        <div className="flex h-full flex-col overflow-auto">
          <DrawerHeader>
            <DrawerTitle>{job?.name || ""}</DrawerTitle>
            <DrawerDescription>Last edited on {job?.modified?.toDateString() || ""}</DrawerDescription>
          </DrawerHeader>
          <div className="max-h-full pb-16 pt-10 leading-9">
            {/* {job ? <JobDetails projectId={projectId} jobId={job.id} /> : null} */}
          </div>
          <DrawerClose asChild className="mt-auto">
            <Button variant="outline" size="icon" className="mt-auto w-full bg-background/40 hover:bg-foreground/20">
              Close
            </Button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
