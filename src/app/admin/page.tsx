import { useState } from "react";
import { UsersGetParams } from "@/app/api/users/schemas";
import { useUsers } from "@/app/api/users/query";

export default function Admin() {
  const [params, setParams] = useState<UsersGetParams>({ query: "" });
  const { data: users, isLoading } = useUsers(params);

  return (
    <div>
      <h1>Admin</h1>
    </div>
  );
}
