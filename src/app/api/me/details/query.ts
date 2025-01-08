import { Authorization } from "@/app/types";
import { useQuery } from "@tanstack/react-query";
import { useMiddlecat } from "middlecat-react";

export function useUserDetails() {
  const { user } = useMiddlecat();

  return useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      if (!user) return;
      console.log(user);
      const res = await user.api.get("me/details");
      const userDetails: Authorization = res.data;
      return userDetails;
    },
    enabled: !!user,
  });
}
