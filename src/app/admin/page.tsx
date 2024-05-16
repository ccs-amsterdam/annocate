"use client";

import CommonGetTable from "@/components/Common/CommonGetTable";
import { UpdateUser } from "@/components/Forms/userForms";
import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/simpleDialog";
import { Plus } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { useUsers } from "../api/users/query";
import { UsersResponseSchema } from "../api/users/schemas";

export default function Admin() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-auto flex-col items-center">
      <div className="">
        <h2>Manage users</h2>
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
          <UpdateUser afterSubmit={() => setOpen(false)} />
        </SimpleDialog>
      </div>
      <SelectUser />
    </div>
  );
}
const COLUMNS = ["email", "role"];

function SelectUser() {
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
        <UpdateUser current={selectedUser} afterSubmit={() => setSelectedUser(undefined)} />
      </SimpleDialog>
      <CommonGetTable className="mt-8 w-full p-3" {...useUsersProps} onSelect={onSelect} columns={COLUMNS} />
    </>
  );
}
