"use client";
import {
  CodebookScaleTypeSchema,
  CodebookSelectTypeSchema,
  CodebookVariableSchema,
  variableTypeOptions,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/variableSchemas";
import { Control, FieldValues, UseFormReturn } from "react-hook-form";
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
import { useState } from "react";
import { NameField } from "./jobBlockForms";
import { StyleToolbar } from "../Common/StyleToolbar";
import { Instrument_Sans } from "next/font/google";
import VariableInstructions from "../AnnotationInterface/VariableInstructions";

type JobBlockCreate = z.infer<typeof JobBlockCreateSchema>;

// !!! This is just so TS will warn you if you dare change the name of the content field, since this value is hardcoded in this file
const tsCanary: keyof JobBlockCreate = "content";

export function VariableBlockForm<T extends FieldValues>({
  form,
  control,
}: {
  form: UseFormReturn<JobBlockCreate>;
  control: Control<T, any>;
}) {
  const generalShape = CodebookVariableSchema.shape;
  const type = form.watch("content.type");
  const questionStyle = form.watch("content.questionStyle");

  if (!questionStyle) {
    form.setValue("content.questionStyle", { textAlign: "center", fontWeight: "bold", fontSize: "1.1em" });
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
      <DefaultFields form={form}>{renderType()}</DefaultFields>
    </div>
  );
}

function DefaultFields({ form, children }: { form: UseFormReturn<JobBlockCreate>; children: React.ReactNode }) {
  const type = form.watch("content.type");
  if (!type) return null;
  return (
    <>
      <QuestionField form={form} />
      {children}
      <InstructionField form={form} />
    </>
  );
}

function QuestionField({ form }: { form: UseFormReturn<JobBlockCreate> }) {
  const style = form.watch(`content.questionStyle`);

  return (
    <div className="flex flex-col">
      <TextAreaFormField
        control={form.control}
        zType={CodebookVariableSchema.shape.question}
        name={"content.question"}
        className="rounded-bl-none"
      />
      <StyleToolbar
        positionBottom
        style={style || {}}
        setStyle={(style) => form.setValue(`content.questionStyle`, style, { shouldDirty: true })}
      />
    </div>
  );
}

function InstructionField({ form }: { form: UseFormReturn<JobBlockCreate> }) {
  const style = form.watch(`content.instructionStyle`);
  return (
    <div className="flex flex-col">
      <TextAreaFormField
        control={form.control}
        zType={CodebookVariableSchema.shape.instruction}
        name={"content.instruction"}
      />
      <StyleToolbar
        positionBottom
        style={style || {}}
        setStyle={(style) => form.setValue(`content.instructionStyle`, style, { shouldDirty: true })}
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
