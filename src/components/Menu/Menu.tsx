"use client";

import { useUserDetails } from "@/app/api/me/details/query";
import Link from "next/link";
import { useParams, useSelectedLayoutSegments } from "next/navigation";
import { FaChevronRight, FaCog } from "react-icons/fa";
import { DarkModeButton } from "../Common/Theme";
import UserMenu from "./UserMenu";
import ResponsiveButtonGroup from "../ui/ResponsiveButtonGroup";
import { ChevronLeft, ChevronRight, Cog } from "lucide-react";
import React from "react";

export default function Menu() {
  const params = useParams();
  const { data: userDetails, isLoading } = useUserDetails();

  function renderAdmin() {
    if (isLoading) return <Cog className="h-8 w-8 animate-spin-slow text-foreground/50" />;
    if (userDetails?.role !== "admin") return null;
    return (
      <Link href="/admin">
        <Cog className="h-8 w-8 hover:text-foreground" />
      </Link>
    );
  }

  function renderNav() {
    if (!params?.projectId) {
      return (
        <>
          <NavItem href="/" key="projects">
            home
          </NavItem>
          <NavItem href="/projects" key="projects">
            projects
          </NavItem>
        </>
      );
    }
    return (
      <>
        <NavItem icon={<ChevronLeft />} href="/projects" key="projects"></NavItem>

        <NavItem href={`/projects/${params.projectId}`} key="project">
          jobs
        </NavItem>
        <NavItem href={`/projects/${params.projectId}/codebooks`} key="codebooks">
          codebooks
        </NavItem>
        <NavItem href={`/projects/${params.projectId}/units`} key="units">
          units
        </NavItem>
        <NavItem href={`/projects/${params.projectId}/users`} key="users">
          users
        </NavItem>
      </>
    );
  }

  return (
    <menu className="w-full px-2">
      <div className="m-0 flex min-h-[3.8rem] list-none items-center gap-2 px-3 pb-0 pt-1 text-xl text-foreground">
        <div key="left" className="mt-1 flex min-h-[3rem] flex-auto items-center ">
          {renderNav()}
        </div>

        <div key="right" className="flex h-full items-center justify-end">
          <ResponsiveButtonGroup>
            {renderAdmin()}
            <DarkModeButton />
            <UserMenu />
          </ResponsiveButtonGroup>
        </div>
      </div>
    </menu>
  );
}

function NavItem({ children, icon, href }: { children?: React.ReactNode; icon?: React.ReactNode; href: string }) {
  return (
    <Link href={href} className="flex h-full items-center gap-2 px-2 hover:text-primary">
      {icon}
      {children}
    </Link>
  );
}
