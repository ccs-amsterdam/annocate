import { useJobUsers } from "@/app/api/jobs/[jobId]/jobusers/query";
import { JobUsersResponseSchema } from "@/app/api/jobs/[jobId]/jobusers/schemas";
import DBTable from "@/components/Common/DBTable";
import { UpdateJobUser, CreateJobUser } from "@/components/Forms/jobuserForms";
import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/simpleDialog";
import { Plus } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

interface Props {
  jobId: number;
}

const COLUMNS = ["email", "role"];

export function JobUserTable({ jobId }: Props) {
  const useJobUsersProps = useJobUsers(jobId);
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<z.infer<typeof JobUsersResponseSchema>>();

  function onSelect(row: z.infer<typeof JobUsersResponseSchema>) {
    setSelectedUser(row);
    setOpen(true);
  }

  return (
    <div>
      <CreateJobUserButton jobId={jobId} />
      <SimpleDialog open={open} setOpen={setOpen} header={`${selectedUser?.email}`}>
        {selectedUser ? (
          <UpdateJobUser current={selectedUser} jobId={jobId} afterSubmit={() => setOpen(false)} />
        ) : null}
      </SimpleDialog>
      <div className="mt-8 w-full p-3">
        <DBTable {...useJobUsersProps} onSelect={onSelect} columns={COLUMNS} />
      </div>
    </div>
  );
}

function CreateJobUserButton({ jobId }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <SimpleDialog
      open={open}
      setOpen={setOpen}
      header="Create new user"
      trigger={
        <Button variant="ghost" className="mx-auto mt-2 flex items-center gap-2 ">
          Create new user
          <Plus className="h-5 w-5" />
        </Button>
      }
    >
      <CreateJobUser jobId={jobId} afterSubmit={() => setOpen(false)} />
    </SimpleDialog>
  );
}
