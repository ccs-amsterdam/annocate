"use client";
import {
  CodebookScaleTypeSchema,
  CodebookSelectTypeSchema,
  CodebookVariableSchema,
  variableTypeOptions,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/codebookNodes/variableSchemas";
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
import { CodebookNodeCreateSchema } from "@/app/api/projects/[projectId]/jobs/[jobId]/codebookNodes/schemas";
import { NameField } from "./jobBlockForms";
import { StyleToolbar } from "../Common/StyleToolbar";

type CodebookNodeCreate = z.infer<typeof CodebookNodeCreateSchema>;

export function VariableNodeForm<T extends FieldValues>({
  form,
  control,
}: {
  form: UseFormReturn<CodebookNodeCreate>;
  control: Control<T, any>;
}) {
  const generalShape = CodebookVariableSchema.shape;
  const type = form.watch("data.variable.type");
  const questionStyle = form.watch("data.variable.questionStyle");

  if (!questionStyle) {
    form.setValue("data.variable.questionStyle", { textAlign: "center", fontWeight: "bold", fontSize: "1.1em" });
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

function DefaultFields({ form, children }: { form: UseFormReturn<CodebookNodeCreate>; children: React.ReactNode }) {
  const type = form.watch("data.variable.type");
  if (!type) return null;
  return (
    <>
      <QuestionField form={form} />
      {children}
      <InstructionField form={form} />
    </>
  );
}

function QuestionField({ form }: { form: UseFormReturn<CodebookNodeCreate> }) {
  const style = form.watch(`data.variable.questionStyle`);

  return (
    <div className="flex flex-col">
      <TextAreaFormField
        control={form.control}
        zType={CodebookVariableSchema.shape.question}
        name={"data.variable.question"}
        className="rounded-bl-none"
      />
      <StyleToolbar
        positionBottom
        style={style || {}}
        setStyle={(style) => form.setValue(`data.variable.questionStyle`, style, { shouldDirty: true })}
      />
    </div>
  );
}

function InstructionField({ form }: { form: UseFormReturn<CodebookNodeCreate> }) {
  const style = form.watch(`data.variable.instructionStyle`);
  return (
    <div className="flex flex-col">
      <TextAreaFormField
        control={form.control}
        zType={CodebookVariableSchema.shape.instruction}
        name={"data.variable.instruction"}
      />
      <StyleToolbar
        positionBottom
        style={style || {}}
        setStyle={(style) => form.setValue(`data.variable.instructionStyle`, style, { shouldDirty: true })}
      />
    </div>
  );
}

function TypeField({ form }: { form: UseFormReturn<CodebookNodeCreate> }) {
  return (
    <DropdownFormField
      control={form.control}
      zType={CodebookVariableSchema.shape.type}
      name="data.variable.type"
      values={variableTypeOptions}
      labelWidth="8rem"
      placeholder="Select question type"
      disableMessage
    />
  );
}

function MultipleField({ form }: { form: UseFormReturn<CodebookNodeCreate> }) {
  return (
    <BooleanFormField
      control={form.control}
      zType={CodebookSelectTypeSchema.shape.multiple}
      name="data.variable.multiple"
    />
  );
}

function VerticalField({ form }: { form: UseFormReturn<CodebookNodeCreate> }) {
  return (
    <BooleanFormField
      control={form.control}
      zType={CodebookSelectTypeSchema.shape.vertical}
      name="data.variable.vertical"
    />
  );
}

function CodesField({ form }: { form: UseFormReturn<CodebookNodeCreate> }) {
  return (
    <CodesFormField
      form={form}
      control={form.control}
      name="data.variable.codes"
      zType={CodebookSelectTypeSchema.shape.codes}
      hideTitle
    />
  );
}

function ItemsField({ form }: { form: UseFormReturn<CodebookNodeCreate> }) {
  return (
    <VariableItemsFormField
      form={form}
      control={form.control}
      name="data.variable.items"
      zType={CodebookScaleTypeSchema.shape.items}
    />
  );
}
