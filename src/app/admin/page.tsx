import { useUsers } from "../api/users/query";

export default function Admin() {
  const { data: users, isLoading } = useUsers();

  return (
    <div>
      <h1>Admin</h1>
    </div>
  );
}
