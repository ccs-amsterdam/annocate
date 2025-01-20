"use client";
import {
  CodebookScaleTypeSchema,
  CodebookSelectTypeSchema,
  CodebookVariableSchema,
  InstructionModeOptions,
  variableTypeOptions,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/variablesSchemas";
import { Control, FieldValues, Path, UseFormReturn } from "react-hook-form";
import { z } from "zod";
import {
  BooleanFormField,
  CodesFormField,
  DropdownFormField,
  TextAreaFormField,
  TextFormField,
  VariableItemsFormField,
} from "./formHelpers";
import { JobBlockCreateSchema } from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/schemas";
import { renderURL } from "nuqs/dist/_tsup-dts-rollup";
import { Button } from "../ui/button";
import { useState } from "react";

type JobBlockCreate = z.infer<typeof JobBlockCreateSchema>;

export function BlockVariable<T extends FieldValues>({
  form,
  control,
}: {
  form: UseFormReturn<JobBlockCreate>;
  control: Control<T, any>;
}) {
  const generalShape = CodebookVariableSchema.shape;
  const type = form.watch("content.type");

  function appendPath(key: string): Path<T> {
    return `content.${key}` as Path<T>;
  }

  function renderStandard() {
    if (!type) return null;

    return (
      <>
        <QuestionField form={form} />
      </>
    );
  }

  function renderType() {
    if (type === "select code") {
      const shape = CodebookSelectTypeSchema.shape;
      return (
        <>
          <CodesField form={form} />
          <div className="ml-auto flex gap-6">
            <MultipleField form={form} />
            <VerticalField form={form} />
          </div>
        </>
      );
    }
    if (type === "scale") {
      const shape = CodebookScaleTypeSchema.shape;
      return (
        <>
          <CodesField form={form} />
          <ItemsField form={form} />
        </>
      );
    }
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-[1fr,180px] items-end gap-2">
        <NameField form={form} />
        <TypeField form={form} />
      </div>
      {renderStandard()}
      {renderType()}
    </div>
  );
}

function NameField({ form }: { form: UseFormReturn<JobBlockCreate> }) {
  return (
    <TextFormField
      control={form.control}
      zType={JobBlockCreateSchema.shape.name}
      name={"name"}
      onChangeInterceptor={(v) => v.replace(/ /g, "_").replace(/[^a-zA-Z0-9_]/g, "")}
    />
  );
}

function QuestionField({ form }: { form: UseFormReturn<JobBlockCreate> }) {
  const [showInstruction, setShowInstruction] = useState(false);
  const instructionMode = form.watch("content.instructionMode");

  return (
    <>
      <div className="grid grid-cols-[1fr,180px] items-end gap-2">
        <TextFormField control={form.control} zType={CodebookVariableSchema.shape.question} name="content.question" />
        <DropdownFormField
          control={form.control}
          zType={CodebookVariableSchema.shape.instructionMode}
          name="content.instructionMode"
          values={InstructionModeOptions}
          labelWidth="8rem"
          placeholder="No instructions"
        />
      </div>
      {instructionMode != null ? <InstructionField form={form} /> : <div></div>}
    </>
  );
}

function InstructionField({ form }: { form: UseFormReturn<JobBlockCreate> }) {
  return (
    <div className="flex flex-col">
      <TextAreaFormField
        control={form.control}
        zType={CodebookVariableSchema.shape.instruction}
        name={"content.instruction"}
      />
    </div>
  );
}

function TypeField({ form }: { form: UseFormReturn<JobBlockCreate> }) {
  return (
    <DropdownFormField
      control={form.control}
      zType={CodebookVariableSchema.shape.type}
      name="content.type"
      values={variableTypeOptions}
      labelWidth="8rem"
      placeholder="Select question type"
      disableMessage
    />
  );
}

function MultipleField({ form }: { form: UseFormReturn<JobBlockCreate> }) {
  return (
    <BooleanFormField control={form.control} zType={CodebookSelectTypeSchema.shape.multiple} name="content.multiple" />
  );
}

function VerticalField({ form }: { form: UseFormReturn<JobBlockCreate> }) {
  return (
    <BooleanFormField control={form.control} zType={CodebookSelectTypeSchema.shape.vertical} name="content.vertical" />
  );
}

function CodesField({ form }: { form: UseFormReturn<JobBlockCreate> }) {
  return (
    <CodesFormField
      form={form}
      control={form.control}
      name="content.codes"
      zType={CodebookSelectTypeSchema.shape.codes}
      hideTitle
    />
  );
}

function ItemsField({ form }: { form: UseFormReturn<JobBlockCreate> }) {
  return (
    <VariableItemsFormField control={form.control} name="content.items" zType={CodebookScaleTypeSchema.shape.items} />
  );
}
