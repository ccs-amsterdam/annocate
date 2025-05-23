"use client";

import DBTable from "@/components/Common/DBTable";
import { CreateUser, UpdateUser } from "@/components/Forms/userForms";
import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/simpleDialog";
import { Plus } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { useUsers } from "@/app/api/users/query";
import { UsersResponseSchema } from "@/app/api/users/schemas";

export default function AdminPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-auto flex-col items-center">
      <div className="">
        <SimpleDialog
          open={open}
          setOpen={setOpen}
          header="Create new user"
          trigger={
            <Button variant="ghost" className="mx-auto flex items-center gap-2">
              Create new user
              <Plus className="h-5 w-5" />
            </Button>
          }
        >
          <CreateUser afterSubmit={() => setOpen(false)} />
        </SimpleDialog>
      </div>
      <UserTable />
    </div>
  );
}
const COLUMNS = ["email", "role"];

function UserTable() {
  const useUsersProps = useUsers();
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<z.infer<typeof UsersResponseSchema>>();

  function onSelect(row: z.infer<typeof UsersResponseSchema>) {
    setSelectedUser(row);
    setOpen(true);
  }

  return (
    <>
      <SimpleDialog open={open} setOpen={setOpen} header={`${selectedUser?.email}`}>
        {selectedUser ? <UpdateUser current={selectedUser} afterSubmit={() => setOpen(false)} /> : null}
      </SimpleDialog>
      <DBTable className="w-full p-3" {...useUsersProps} onSelect={onSelect} columns={COLUMNS} />
    </>
  );
}
