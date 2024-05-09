"use client";

import { useUserDetails } from "@/app/api/me/details/query";
import Link from "next/link";
import { useSelectedLayoutSegments } from "next/navigation";
import { FaChevronRight, FaCog } from "react-icons/fa";
import MenuButtonGroup from "../Annotator/subcomponents/MenuButtonGroup";
import { DarkModeButton } from "../Common/Theme";
import UserMenu from "./UserMenu";

export default function Menu() {
  const path = useSelectedLayoutSegments() || [];
  const { data: userDetails, isLoading } = useUserDetails();

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
  function renderAdmin() {
    if (isLoading) return <FaCog className="h-7 w-7 animate-spin-slow text-foreground/50" />;
    if (userDetails?.role !== "admin") return null;
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
            {renderAdmin()}
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
