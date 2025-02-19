"use client";

import { useState } from "react";
import { User, Settings, Moon, Sun, ShieldCheck, Loader } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useMiddlecat } from "middlecat-react";
import { useUserDetails } from "@/app/api/me/details/query";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "../ui/dialog";
import { useDarkMode } from "@/hooks/useDarkMode";
import AdminPanel from "./AdminPanel";
import { Loading } from "../ui/loader";

export default function UserMenu() {
  const { user, loading, signOut } = useMiddlecat();
  const [adminDialog, setAdminDialog] = useState(false);
  const [dark, setDark] = useDarkMode();

  if (!user) return <Loader className="animate-spin-slow" />;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <User />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" data-side="right">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{user.name}</p>
              <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Settings</DropdownMenuLabel>
            <DropdownMenuItem>
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center">
                  {dark ? <Moon className="mr-2 h-4 w-4" /> : <Sun className="mr-2 h-4 w-4" />}
                  <span>Dark Mode</span>
                </div>
                <Switch checked={dark} onCheckedChange={setDark} />
              </div>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <RenderAdmin setAdminDialog={setAdminDialog} />
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => signOut(false)}>Log out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={adminDialog} onOpenChange={setAdminDialog}>
        <DialogContent
          onInteractOutside={(e) => e.preventDefault()}
          className="max-h-[50rem] w-[90vw] max-w-2xl items-start"
        >
          <DialogTitle>Admin Panel</DialogTitle>
          <DialogDescription>Manage users</DialogDescription>
          <AdminPanel />
        </DialogContent>
      </Dialog>
    </>
  );
}

function RenderAdmin({ setAdminDialog }: { setAdminDialog: (value: boolean) => void }) {
  const { user, loading } = useMiddlecat();
  const { data: userDetails } = useUserDetails();
  const router = useRouter();

  if (loading) return null;
  if (userDetails?.role !== "admin") return null;

  return (
    <DropdownMenuItem onClick={() => setAdminDialog(true)}>
      <ShieldCheck className="mr-2 h-4 w-4" />
      <span>Admin Panel</span>
    </DropdownMenuItem>
  );
}
