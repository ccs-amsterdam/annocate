"use client";

import { useJobs } from "@/app/api/jobs/query";
import CommonGetTable from "@/components/Common/CommonGetTable";
import { CreateJobDialog } from "@/components/Forms/CreateJob";
import { Button } from "@/components/ui/button";
import { JobsGetResponse } from "../api/jobs/schemas";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useUsers } from "../api/users/query";
import { useState } from "react";
import { UsersGetResponse } from "../api/users/schemas";
import { CreateUserDialog } from "@/components/Forms/CreateUser";

export default function Admin() {
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
