import { ServerRole } from "@/app/types";
import { useQuery } from "@tanstack/react-query";
import { useMiddlecat } from "middlecat-react";

export function useServerRole() {
  const { user } = useMiddlecat();

  return useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      const res = await user.api.get("me/serverRole");
      const serverRole: ServerRole = res.data;
      return serverRole;
    },
    enabled: !!user,
  });
}
