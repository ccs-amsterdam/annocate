import { Paginate } from "@/app/api/queryHelpers";
import { GetMetaSchema } from "@/app/api/schemaHelpers";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Dot, DotIcon } from "lucide-react";
import { useJobs } from "@/app/api/projects/[projectId]/jobs/query";
import { Button } from "@/components/ui/button";
import { DBPagination, DBSearch } from "@/components/Common/DBTable";
import { Loading } from "@/components/ui/loader";
import { SimpleDialog } from "@/components/ui/simpleDialog";
import { CreateJob } from "@/components/Forms/jobForms";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

export default function JobsList({ projectId }: { projectId: number }) {
  const props = useJobs(projectId);
  const [prevProps, setPrevProps] = useState(() => {
    const { data, meta, isLoading } = props;
    return { data, meta, isLoading };
  });

  const { data, meta, isLoading } = props;
  useEffect(() => {
    setPrevProps({ data, meta, isLoading });
  }, [data, meta, isLoading]);

  const showPagination = props.meta && props.meta.rows > props.meta.pageSize;

  if (prevProps.isLoading) {
    return <Loading />;
  }

  return (
    <div className={""}>
      <div className={` mb-4 flex select-none gap-3  ${showPagination ? "" : "hidden"}`}>
        <DBSearch search={props.search} isLoading={props.isLoading} />
        <DBPagination paginate={props.paginate} />
      </div>
      {/* <div className={`mb-3 ${props.isLoading ? "" : "hidden"}`}>Searching...</div> */}
      <div className="flex flex-col gap-1">
        {prevProps.data?.map((row, index) => {
          return <div key={index} className=""></div>;
        })}
      </div>
      <div>
        <CreateJobDialog projectId={projectId} />
      </div>
    </div>
  );
}

function CreateJobDialog(props: { projectId: number }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button>Create job</Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-[400px]">
        <CreateJob projectId={props.projectId} afterSubmit={() => {}} />
      </PopoverContent>
    </Popover>
  );
}
