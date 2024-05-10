"use client";

import { FaUser } from "react-icons/fa";
import { useMiddlecat } from "middlecat-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { User } from "lucide-react";

export default function UserMenu() {
  const { user, loading, signIn, signOut, fixedResource } = useMiddlecat();

  function renderAuth() {
    if (loading) return null;
    if (user?.email)
      return (
        <div className="flex flex-col gap-3">
          <div className=" flex items-center gap-3">
            <img src={user.image} alt="profile" className="h-7 w-7 rounded" referrerPolicy="no-referrer" />
            {user.name || user.email}
          </div>
          <Button className="ml-auto mt-10" onClick={() => signOut(true)}>
            Sign out
          </Button>
        </div>
      );
    return <Button onClick={() => signIn(fixedResource)}>Sign in</Button>;
  }

  return (
    <Popover>
      <PopoverTrigger>
        <User className="h-8 w-8" />
      </PopoverTrigger>
      <PopoverContent className="mr-2 mt-5">
        <div className="flex flex-col gap-3">{renderAuth()}</div>
      </PopoverContent>
    </Popover>
  );
}
