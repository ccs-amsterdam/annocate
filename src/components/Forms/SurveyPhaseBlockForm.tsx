"use client";
import { Control, FieldValues, UseFormReturn } from "react-hook-form";
import { z } from "zod";
import {
  JobBlockCreateSchema,
  JobBlockSurveyPhaseSchema,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/schemas";
import { NameField } from "./jobBlockForms";

type JobBlockCreate = z.infer<typeof JobBlockCreateSchema>;

export function SurveyPhaseBlockForm<T extends FieldValues>({
  form,
  control,
}: {
  form: UseFormReturn<JobBlockCreate>;
  control: Control<T, any>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-[1fr,180px] items-end gap-2">
        <NameField form={form} />
      </div>
    </div>
  );
}
