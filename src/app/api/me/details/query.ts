import { UserDetails } from "@/app/types";
import { useQuery } from "@tanstack/react-query";
import { useMiddlecat } from "middlecat-react";

export function useUserDetails() {
  const { user } = useMiddlecat();

  return useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      if (!user) return;
      const res = await user.api.get("me/details");
      const userDetails: UserDetails = res.data;
      return userDetails;
    },
    enabled: !!user,
  });
}