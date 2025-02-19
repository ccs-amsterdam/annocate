"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { use } from "react";
import { safeParams } from "@/functions/utils";

export default function JobManagementPage(props: { params: Promise<{ projectId: string; jobId: string }> }) {
  const params = safeParams(use(props.params));

  return (
    <div className="container mx-auto mt-16 max-w-3xl py-8">
      <div className="mb-6 flex flex-col items-start justify-between sm:flex-row sm:items-center">
        <h2 className="mb-2 text-lg font-semibold sm:mb-0">Job Actions</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild>
            <Link href={`/projects/${params.projectId}/jobs/${params.jobId}/units`}>Manage Units</Link>
          </Button>
          <Button asChild>
            <Link href={`/projects/${params.projectId}/jobs/${params.jobId}/codebook`}>Manage Codebook</Link>
          </Button>
        </div>
      </div>
      <Separator className="my-6" />
      <div className="space-y-4">
        {/* <h3 className="text-lg font-semibold">Job Details</h3>
        <p className="text-muted-foreground">
          This is where you can view and edit the details of your current job. Add forms, tables, or other components
          here to manage job-specific information.
        </p>
        {/* Add more job management content here */}
      </div>
    </div>
  );
}
