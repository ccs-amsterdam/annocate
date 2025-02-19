"use client";

import { useUserDetails } from "@/app/api/me/details/query";
import Link from "next/link";
import { useParams, useRouter, useSelectedLayoutSegments } from "next/navigation";
import { FaChevronRight, FaCog } from "react-icons/fa";
import UserMenu from "./UserMenu";
import ResponsiveButtonGroup from "../ui/ResponsiveButtonGroup";
import { ChevronLeft, Home, ChevronRight, Cog, Folder } from "lucide-react";
import React, { useEffect } from "react";
import { Button } from "../ui/button";
import { useProject } from "@/app/api/projects/query";
import { safeParams } from "@/functions/utils";
import { useJob } from "@/app/api/projects/[projectId]/jobs/query";
import { ProjectResponse, JobResponse } from "@/app/types";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export default function Menu() {
  const params = useParams();
  const projectId = Number(params?.projectId);
  const jobId = Number(params?.jobId);

  const router = useRouter();
  const { data: userDetails, isLoading, isPending } = useUserDetails();
  const { data: project } = useProject(projectId);
  const { data: job } = useJob(projectId, jobId);

  useEffect(() => {
    if (isPending) return;
    if (!userDetails) router.push("/");
  }, [router, isPending, userDetails]);

  function renderAdmin() {
    if (isLoading) return <Cog className="h-8 w-8 animate-spin-slow text-foreground/50" />;
    if (userDetails?.role !== "admin") return null;
    return (
      <Link href="/admin">
        <Button variant="ghost" size="icon">
          <Cog className="h-8 w-8" />
        </Button>
      </Link>
    );
  }

  return (
    <menu className="w-full px-2">
      <div className="m-0 flex min-h-[3.8rem] list-none items-center gap-2 px-3 text-foreground">
        <div key="left" className="mt-1 flex min-h-[3rem] flex-auto items-center">
          <Breadcrumbs project={project} job={job} />
        </div>

        <div key="right" className="flex h-full items-center justify-end">
          <UserMenu />
        </div>
      </div>
    </menu>
  );
}

export function Breadcrumbs({ project, job }: { project?: ProjectResponse; job?: JobResponse }) {
  function renderProject() {
    if (!project) return null;
    return (
      <>
        <BreadcrumbItem>
          <BreadcrumbLink href={`/projects/${project.id}`}>{project.name}</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator>
          <ChevronRight className="h-4 w-4" />
        </BreadcrumbSeparator>
      </>
    );
  }

  function renderJob() {
    if (!project || !job) return null;
    return (
      <BreadcrumbItem>
        <BreadcrumbLink href={`/projects/${project.id}/jobs/${job.id}`}>{job.name}</BreadcrumbLink>
      </BreadcrumbItem>
    );
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/">
            <Home className="h-4 w-4" />
            <span className="sr-only">Home</span>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator>
          <ChevronRight className="h-4 w-4" />
        </BreadcrumbSeparator>
        <BreadcrumbItem>
          <BreadcrumbLink href="/projects">Projects</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator>
          <ChevronRight className="h-4 w-4" />
        </BreadcrumbSeparator>
        {renderProject()}
        {renderJob()}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
