"use client";

import MenuButtonGroup from "../Annotator/subcomponents/MenuButtonGroup";
import { DarkModeButton } from "../Common/Theme";
import { FaChevronRight, FaUser } from "react-icons/fa";
import { useSelectedLayoutSegments } from "next/navigation";
import Link from "next/link";
import { AuthForm, useMiddlecat } from "middlecat-react";
import RadixPopup from "../Common/RadixPopup";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export default function Menu() {
  const path = useSelectedLayoutSegments() || [];
  const breadcrubs = ["home", ...path];
  const { user, loading, signIn, signOut, fixedResource } = useMiddlecat();
  const [showBreadcrumb, setShowBreadcrumb] = useState(true);

  useEffect(() => setShowBreadcrumb(true), []);

  function renderBreadcrumbs() {
    let path = "";
    return breadcrubs.map((x, i) => {
      path = path + "/" + x;
      if (i === breadcrubs.length - 1)
        return (
          <Breadcrumb key={x} current={true}>
            {x}
          </Breadcrumb>
        );
      return (
        <Breadcrumb key={x + i}>
          <Link href={path}>{x}</Link>
          <FaChevronRight
            key={"next" + x + i}
            style={{
              marginLeft: "1rem",
              fontSize: "0.8rem",
              transform: "translateY(8px)",
            }}
          />
        </Breadcrumb>
      );
    });
  }

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
    <menu className="w-full px-2">
      <ul className="m-0 flex min-h-[3.8rem] list-none items-start gap-2 px-3 pb-0 pt-1 text-xl text-foreground">
        <div key="left" className="mt-1 flex min-h-[3rem] flex-auto items-center ">
          {showBreadcrumb ? renderBreadcrumbs() : null}
        </div>
        <div key="right" className="flex flex-auto justify-end pt-[5px]">
          <MenuButtonGroup>
            <div>
              <DarkModeButton />
            </div>
            <Popover>
              <PopoverTrigger>
                <FaUser />
              </PopoverTrigger>
              <PopoverContent className="mr-2 mt-5">
                <div className="flex flex-col gap-3">{renderAuth()}</div>
              </PopoverContent>
            </Popover>
          </MenuButtonGroup>
        </div>
      </ul>
    </menu>
  );
}

const Breadcrumb = ({ children, current }: { current?: boolean; children: React.ReactNode }) => {
  return (
    <div className="rounded p-2 text-primary">
      <span className={`flex  no-underline ${current ? "text-foreground" : "hover:text-foreground"}`}>{children}</span>
    </div>
  );
};
