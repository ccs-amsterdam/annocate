"use client";
import {
  CodebookScaleTypeSchema,
  CodebookSelectTypeSchema,
  CodebookVariableSchema,
  variableTypeOptions,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/variableSchemas";
import { Control, FieldValues, Path, UseFormReturn } from "react-hook-form";
import { z } from "zod";
import {
  DropdownFormField,
  MoveItemInArray,
  TextAreaFormField,
  TextFormField,
  VariableItemsFormField,
} from "./formHelpers";
import { JobBlockCreateSchema } from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/schemas";
import { renderURL } from "nuqs/dist/_tsup-dts-rollup";
import { Button } from "../ui/button";
import { useState } from "react";
import {
  fieldTypeOptions,
  UnitGeneralLayoutSchema,
  UnitImageLayoutSchema,
  UnitLayoutColumnSchema,
  UnitLayoutTemplateSchema,
  UnitMarkdownLayoutSchema,
  UnitTextLayoutSchema,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/layoutSchemas";
import { StyleToolbar } from "../Common/StyleToolbar";
import { Equal, XIcon } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { NameField } from "./jobBlockForms";

type JobBlockCreate = z.infer<typeof JobBlockCreateSchema>;

// !!! This is just so TS will warn you if you dare change the name of the content field, since this value is hardcoded in this file
const tsCanary: keyof JobBlockCreate = "content";

export function AnnotationPhaseBlockForm<T extends FieldValues>({
  form,
  control,
}: {
  form: UseFormReturn<JobBlockCreate>;
  control: Control<T, any>;
}) {
  const generalShape = CodebookVariableSchema.shape;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-[1fr,180px] items-end gap-2">
        <NameField form={form} />
      </div>
      <UnitFields form={form} />
    </div>
  );
}

function UnitFields({ form }: { form: UseFormReturn<JobBlockCreate> }) {
  const [accordionValue, setAccordionValue] = useState<string>("");
  const fields = form.getValues("content.layout.fields") || [];

  if (!fields) return null;

  function appendField() {
    const newFields = [...fields, defaultField("Field_" + (fields.length + 1))];
    form.setValue("content.layout.fields", newFields, { shouldDirty: true });
    setAccordionValue("V" + (newFields.length - 1));
  }

  function removeField(index: number) {
    const newFields = fields.filter((_, i) => i !== index);
    form.setValue("content.layout.fields", newFields, { shouldDirty: true });
    setAccordionValue("");
  }

  function moveField(index1: number, index2: number) {
    // insert into the new position. Donn't swap
    const newFields = [...fields];
    const [removed] = newFields.splice(index1, 1);
    newFields.splice(index2, 0, removed);
    form.setValue("content.layout.fields", newFields, { shouldDirty: true });
    setAccordionValue("");
  }

  return (
    <div className="mt-6 flex flex-col">
      <Accordion value={accordionValue} onValueChange={setAccordionValue} type="single" collapsible className="w-full">
        {fields.map((field, index) => {
          const varName = form.watch(`content.layout.fields.${index}.name`);
          const isActive = accordionValue === "V" + index;
          const { error } = form.getFieldState(`content.layout.fields.${index}`);
          return (
            <AccordionItem key={index} value={"V" + index}>
              <div
                className={`grid grid-cols-[2rem,1fr,min-content] items-center gap-3 ${error ? "text-destructive" : ""}`}
              >
                <MoveItemInArray move={moveField} i={index} n={fields.length} error={!!error} />

                <AccordionTrigger className="w-full text-left text-base no-underline hover:no-underline">
                  <span className="break-all">{varName.replace(/_/g, " ")}</span>
                </AccordionTrigger>

                <Button
                  variant="ghost"
                  className=""
                  size="icon"
                  onClick={(e) => {
                    e.preventDefault();
                    removeField(index);
                  }}
                  onClickConfirm={{
                    title: "Remove field",
                    message: "This will remove the field. Are you sure?",
                  }}
                >
                  <XIcon />
                </Button>
              </div>
              <AccordionContent className="flex flex-col gap-5 py-2 pb-6 pr-2">
                <LayoutField form={form} type={field.type} control={form.control} index={index} />
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
      <Button
        type="button"
        size="sm"
        className="mr-auto mt-1 flex w-40 items-center gap-1"
        onClick={() => appendField()}
      >
        add field
      </Button>
    </div>
  );
}

function LayoutField<T extends FieldValues>({
  form,
  type,
  control,
  index,
}: {
  form: UseFormReturn<JobBlockCreate>;
  type: string;
  control: Control<T, any>;
  index: number;
}) {
  const generalShape = UnitGeneralLayoutSchema.shape;
  const style = form.watch(`content.layout.fields.${index}.style`);

  function appendPath(key: string): Path<T> {
    return `content.layout.fields.${index}.${key}` as Path<T>;
  }

  function renderType() {
    if (type === "text") {
      const shape = UnitTextLayoutSchema.shape;
      return <></>;
    }
    if (type === "image") {
      const shape = UnitImageLayoutSchema.shape;
      return <></>;
    }
    if (type === "markdown") {
      const shape = UnitMarkdownLayoutSchema.shape;
      return <></>;
    }
    return null;
  }

  function mappingForm() {
    if (type === "markdown") {
      return <TextAreaFormField control={control} zType={UnitLayoutTemplateSchema} name={appendPath("template")} />;
    }
    return <TextFormField control={control} zType={UnitLayoutColumnSchema} name={appendPath("column")} />;
  }

  return (
    <div className="flex flex-col gap-5 py-3">
      <div className="grid grid-cols-[12rem,24px,1fr] items-end gap-3">
        <DropdownFormField
          control={control}
          zType={generalShape.type}
          name={appendPath("type")}
          values={fieldTypeOptions}
          labelWidth="8rem"
        />
        <div />
        {type !== "meta" ? (
          <StyleToolbar
            style={style || {}}
            setStyle={(style) => form.setValue(`content.layout.fields.${index}.style`, style, { shouldDirty: true })}
          />
        ) : (
          <div />
        )}
      </div>
      <div className="grid grid-cols-[12rem,24px,1fr] gap-3">
        <TextFormField
          control={control}
          zType={generalShape.name}
          name={appendPath("name")}
          onChangeInterceptor={(v) => v.replace(/ /g, "_").replace(/[^a-zA-Z0-9_]/g, "")}
        />
        <Equal className="mt-9" />
        {mappingForm()}
      </div>
      {renderType()}
    </div>
  );
}

function defaultField(name: string): z.input<typeof UnitMarkdownLayoutSchema> {
  return {
    name,
    type: "markdown",
    template: "",
    style: { fontSize: "1rem", lineHeight: "1.5rem", fontWeight: "normal", fontStyle: "normal" },
  };
}
