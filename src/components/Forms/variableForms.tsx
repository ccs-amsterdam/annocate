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

type JobBlockCreate = z.infer<typeof JobBlockCreateSchema>;

export function BlockVariable<T extends FieldValues>({
  form,
  control,
}: {
  form: UseFormReturn<JobBlockCreate>;
  control: Control<T, any>;
}) {
  const generalShape = CodebookVariableSchema.shape;
  const type = form.watch("block.type");

  function appendPath(key: string): Path<T> {
    return `block.${key}` as Path<T>;
  }

  function renderStandard() {
    if (!type) return null;

    return (
      <>
        <TextFormField control={control} zType={generalShape.question} name={appendPath("question")} />
        <TextAreaFormField
          className="resize-y"
          control={control}
          zType={generalShape.instruction}
          name={appendPath("instruction")}
        />
        <DropdownFormField
          control={control}
          zType={generalShape.instructionMode}
          name={appendPath("instructionMode")}
          values={InstructionModeOptions}
          labelWidth="8rem"
          placeholder="after (default)"
        />
      </>
    );
  }

  function renderType() {
    if (type === "select code") {
      const shape = CodebookSelectTypeSchema.shape;
      return (
        <>
          <BooleanFormField control={control} zType={shape.multiple} name={appendPath("multiple")} />
          <BooleanFormField control={control} zType={shape.vertical} name={appendPath("vertical")} />
          <CodesFormField control={control} name={appendPath("codes")} zType={shape.codes} />
        </>
      );
    }
    if (type === "scale") {
      const shape = CodebookScaleTypeSchema.shape;
      return (
        <>
          <CodesFormField control={control} name={appendPath("codes")} zType={shape.codes} />
          <VariableItemsFormField control={control} name={appendPath("items")} zType={shape.items} />
        </>
      );
    }
    return null;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-3">
        <DropdownFormField
          control={control}
          zType={generalShape.type}
          name={appendPath("type")}
          values={variableTypeOptions}
          labelWidth="8rem"
          placeholder="Select question type"
          disableMessage
        />
      </div>
      {renderStandard()}
      {renderType()} {type ? <div></div> : null}
    </div>
  );
}

export function defaultSelect(name: string): z.input<typeof CodebookSelectTypeSchema> {
  return {
    question: "",
    type: "select code",
    instruction: "",
    instructionMode: "after",
    multiple: false,
    vertical: false,
    codes: [{ code: "First option", value: 1, color: "red" }],
  };
}
