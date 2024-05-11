"use client";

import CommonGetTable from "@/components/Common/CommonGetTable";
import { CreateUserDialog } from "@/components/Forms/CreateUser";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useMutateUsers, useUsers } from "../api/users/query";
import { UsersGetResponse } from "../api/users/schemas";

export default function Admin() {
  const { mutateAsync } = useMutateUsers();
  return (
    <div className="flex flex-auto flex-col items-center">
      <div className="">
        <h2>Manage users</h2>
        <CreateUserDialog>
          <Button variant="ghost" className="mx-auto mt-2 flex items-center gap-2 ">
            Create new user
            <Plus className="h-5 w-5" />
          </Button>
        </CreateUserDialog>
      </div>
      <SelectUser />
    </div>
  );
}

function SelectUser() {
  const useUsersProps = useUsers();
  const [selectedUser, setSelectedUser] = useState<UsersGetResponse>();

  return <CommonGetTable className="mt-8 w-full p-3" {...useUsersProps} onSelect={setSelectedUser} />;
}
