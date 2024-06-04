import { useProjectUsers } from "@/app/api/projects/[projectId]/projectusers/query";
import { ProjectUsersResponseSchema } from "@/app/api/projects/[projectId]/projectusers/schemas";
import DBTable from "@/components/Common/DBTable";
import { UpdateProjectUser, CreateProjectUser } from "@/components/Forms/projectuserForms";
import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/simpleDialog";
import { Plus } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

interface Props {
  projectId: number;
}

const COLUMNS = ["email", "role"];

export function ProjectUserTable({ projectId }: Props) {
  const useProjectUsersProps = useProjectUsers(projectId);
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<z.infer<typeof ProjectUsersResponseSchema>>();

  function onSelect(row: z.infer<typeof ProjectUsersResponseSchema>) {
    setSelectedUser(row);
    setOpen(true);
  }

  return (
    <div>
      <CreateProjectUserButton projectId={projectId} />
      <SimpleDialog open={open} setOpen={setOpen} header={`${selectedUser?.email}`}>
        {selectedUser ? (
          <UpdateProjectUser current={selectedUser} projectId={projectId} afterSubmit={() => setOpen(false)} />
        ) : null}
      </SimpleDialog>
      <div className="mt-8 w-full p-3">
        <DBTable {...useProjectUsersProps} onSelect={onSelect} columns={COLUMNS} />
      </div>
    </div>
  );
}

function CreateProjectUserButton({ projectId }: Props) {
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
      <CreateProjectUser projectId={projectId} afterSubmit={() => setOpen(false)} />
    </SimpleDialog>
  );
}
