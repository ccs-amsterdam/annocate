"use client";

import { FaChevronRight, FaCog, FaUser, FaUsers } from "react-icons/fa";
import { useSelectedLayoutSegments } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import UserMenu from "./UserMenu";
import { useServerRole } from "@/app/api/me/serverRole/query";
import { Loader, Users } from "lucide-react";
import MenuButtonGroup from "../Annotator/subcomponents/MenuButtonGroup";
import { DarkModeButton } from "../Common/Theme";

export default function Menu() {
  const path = useSelectedLayoutSegments() || [];
  const { data: serverRole, isLoading } = useServerRole();

  function renderBreadcrumbs() {
    let newpath = "";
    return path.map((x, i) => {
      const isLast = i === path.length - 1;
      newpath = newpath + "/" + x;
      return (
        <Breadcrumb key={x + i} link={isLast ? undefined : newpath}>
          {x}
        </Breadcrumb>
      );
    });
  }
  function renderServerRole() {
    if (isLoading) return <FaCog className="h-7 w-7 animate-spin-slow text-foreground/50" />;
    if (!serverRole?.admin) return null;
    return (
      <Link href="/admin">
        <FaCog className="h-7 w-7 hover:text-foreground" />
      </Link>
    );
  }

  return (
    <menu className="w-full px-2">
      <ul className="m-0 flex min-h-[3.8rem] list-none items-start gap-2 px-3 pb-0 pt-1 text-xl text-foreground">
        <div key="left" className="mt-1 flex min-h-[3rem] flex-auto items-center ">
          <Breadcrumb link={path.length ? "/" : undefined}>home</Breadcrumb>
          {renderBreadcrumbs()}
        </div>

        <div key="right" className="flex flex-auto justify-end pt-[5px]">
          <MenuButtonGroup>
            {renderServerRole()}
            <DarkModeButton />
            <UserMenu />
          </MenuButtonGroup>
        </div>
      </ul>
    </menu>
  );
}

const Breadcrumb = ({ children, current, link }: { current?: boolean; children: React.ReactNode; link?: string }) => {
  return (
    <div className="flex items-center gap-2 rounded p-2 pl-0 text-primary">
      {link ? (
        <Link href={link}>
          <span className="hover:text-foreground">{children}</span>
        </Link>
      ) : (
        <span className="text-foreground">{children}</span>
      )}
      {link && <FaChevronRight className="ml-1 h-4 w-4" />}
    </div>
  );
};
