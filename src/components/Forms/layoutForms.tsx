"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Save, Watch, XIcon } from "lucide-react";
import { use, useCallback, useEffect, useState } from "react";
import { Control, FieldValues, Path, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import {
  BooleanFormField,
  CodesFormField,
  DropdownFormField,
  MoveItemInArray,
  TextAreaFormField,
  TextFormField,
  VariableItemsFormField,
} from "./formHelpers";
import { Form } from "../ui/form";
import React from "react";

import { useCreateUnitLayout, useUpdateUnitLayout } from "@/app/api/projects/[projectId]/units/layouts/query";
import {
  fieldTypeOptions,
  UnitFieldLayoutSchema,
  UnitGeneralLayoutSchema,
  UnitImageLayoutSchema,
  UnitLayoutResponseSchema,
  UnitLayoutSchema,
  UnitLayoutsCreateBodySchema,
  UnitMarkdownLayoutSchema,
  UnitTextLayoutSchema,
} from "@/app/api/projects/[projectId]/units/layouts/schemas";
import { useColumns } from "@/app/api/projects/[projectId]/units/columns/query";

type Layout = z.infer<typeof UnitLayoutSchema>;
type LayoutUpdateBody = z.input<typeof UnitLayoutsCreateBodySchema>;

export function useCreateEmptyLayout(projectId: number) {
  const { mutateAsync } = useCreateUnitLayout(projectId);

  const create = useCallback(
    (name: string) => {
      const newLayout = {
        name,
        layout: {
          fields: [],
          variables: [],
          grid: {
            areas: [],
            rows: [],
            columns: [],
          },
        },
      };
      return mutateAsync(newLayout);
    },
    [mutateAsync],
  );

  return { create };
}

interface UpdateLayoutProps {
  projectId: number;
  current: z.infer<typeof UnitLayoutResponseSchema>;
  afterSubmit?: () => void;
  setPreview?: (layout: Layout | undefined) => void;
}

export const UpdateLayout = React.memo(function UpdateLayout({
  projectId,
  current,
  afterSubmit,
  setPreview,
}: UpdateLayoutProps) {
  const [accordionValue, setAccordionValue] = useState<string>("");
  const { mutateAsync } = useUpdateUnitLayout(projectId, current.id);
  const form = useForm<LayoutUpdateBody>({
    resolver: zodResolver(UnitLayoutsCreateBodySchema),
    defaultValues: UnitLayoutsCreateBodySchema.parse(current),
  });
  const [unitsets, setUnitsets] = useState<any>([]);
  const { data: columns } = useColumns(projectId, unitsets);

  console.log(columns);

  const { error } = form.getFieldState("layout");
  const fields = form.getValues("layout.fields");

  useEffect(() => {
    form.reset(UnitLayoutsCreateBodySchema.parse(current));
  }, [current, form]);

  useEffect(() => {
    function beforeUnload(e: BeforeUnloadEvent) {
      e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
    }
    if (form.formState.isDirty) return;
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [form]);

  function appendField() {
    const newFields = [...fields, defaultField("Field_" + (fields.length + 1))];
    form.setValue("layout.fields", newFields, { shouldDirty: true });
    setAccordionValue("V" + (newFields.length - 1));
  }

  function removeField(index: number) {
    const newFields = fields.filter((_, i) => i !== index);
    form.setValue("layout.fields", newFields, { shouldDirty: true });
    setAccordionValue("");
  }

  function moveField(index1: number, index2: number) {
    // insert into the new position. Donn't swap
    const newFields = [...fields];
    const [removed] = newFields.splice(index1, 1);
    newFields.splice(index2, 0, removed);
    form.setValue("layout.fields", newFields, { shouldDirty: true });
    setAccordionValue("");
  }

  function onSubmit(values: LayoutUpdateBody) {
    if (fields.length === 0) return alert("You need to add at least one field");
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }
  const shape = UnitLayoutsCreateBodySchema.shape;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="relative flex flex-col gap-3  p-3 lg:px-8 ">
        <div
          className={`fixed left-0 top-0 z-50 flex h-[var(--header-height)] w-full 
          items-center justify-between gap-10 border-b bg-background px-8 ${form.formState.isDirty ? "" : "hidden"} `}
        >
          <Button
            type="button"
            className="  flex w-min  items-center gap-2 shadow-lg disabled:opacity-0"
            variant="destructive"
            onClick={() => form.reset(UnitLayoutsCreateBodySchema.parse(current))}
          >
            <XIcon className="h-5 w-5" />
            Undo changes
          </Button>
          <Button
            className="  flex w-min  items-center gap-2 shadow-lg disabled:opacity-0"
            variant={error ? "destructive" : "secondary"}
            type="submit"
            disabled={!form.formState.isDirty || fields.length === 0}
          >
            <Save className="h-5 w-5" />
            Save changes
          </Button>
        </div>
        <TextFormField control={form.control} zType={shape.name} name="name" />
        {error?.fields?.root ? <div className="text-destructive">{error.fields.root.message}</div> : null}
        <div>
          <Accordion
            value={accordionValue}
            onValueChange={setAccordionValue}
            type="single"
            collapsible
            className="w-full"
          >
            {fields.map((field, index) => {
              const varName = form.watch(`layout.fields.${index}.name`);
              const isActive = accordionValue === "V" + index;
              const { error } = form.getFieldState(`layout.fields.${index}`);
              let bg = isActive ? "bg-primary-light" : "";
              return (
                <AccordionItem key={index} value={"V" + index} className={`${bg}  rounded p-3 `}>
                  <div className={`grid grid-cols-[2rem,1fr] items-center gap-3  ${error ? "text-destructive" : ""}`}>
                    <MoveItemInArray move={moveField} i={index} n={fields.length} bg={bg} error={!!error} />

                    <div>
                      <AccordionTrigger className="text-left no-underline hover:no-underline">
                        <span className="break-all">{varName.replace(/_/g, " ")}</span>
                      </AccordionTrigger>
                    </div>
                  </div>
                  <AccordionContent className="flex flex-col gap-5 px-1 py-3">
                    <LayoutField type={field.type} control={form.control} index={index} />
                    <ConfirmDialog
                      title="Remove field"
                      message="This will remove the field. Are you sure?"
                      onAccept={() => removeField(index)}
                    >
                      <Button variant="destructive" className="ml-auto h-8 rounded-full">
                        <XIcon />
                      </Button>
                    </ConfirmDialog>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
          <Button type="button" className="mt-3" onClick={() => appendField()}>
            Add Field
          </Button>
        </div>
        <WatchForPreview form={form} setPreview={setPreview} />
      </form>
    </Form>
  );
});

function WatchForPreview({ form, setPreview }: { form: any; setPreview?: (layout: Layout | undefined) => void }) {
  const watch = useWatch({ control: form.control, name: "layout" });
  useEffect(() => {
    if (!setPreview) return;
    const timeout = setTimeout(() => {
      form.trigger();
      const layout = UnitLayoutSchema.safeParse(watch);
      if (layout.success) setPreview(layout.data);
    }, 1000);
    return () => clearTimeout(timeout);
  }, [watch, setPreview, form]);
  return <div></div>;
}

function LayoutField<T extends FieldValues>({
  type,
  control,
  index,
}: {
  type: string;
  control: Control<T, any>;
  index: number;
}) {
  const generalShape = UnitGeneralLayoutSchema.shape;

  function appendPath(key: string): Path<T> {
    return `layout.fields.${index}.${key}` as Path<T>;
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

  return (
    <div className="flex flex-col gap-5">
      <DropdownFormField
        control={control}
        zType={generalShape.type}
        name={appendPath("type")}
        values={fieldTypeOptions}
        labelWidth="8rem"
      />
      <TextFormField
        control={control}
        zType={generalShape.name}
        name={appendPath("name")}
        onChangeInterceptor={(v) => v.replace(/ /g, "_").replace(/[^a-zA-Z0-9_]/g, "")}
      />
      <div>
        <TextFormField control={control} zType={generalShape.column} name={appendPath("column")} />
      </div>
      {renderType()}
    </div>
  );
}

function defaultField(name: string): z.input<typeof UnitMarkdownLayoutSchema> {
  return {
    name,
    type: "markdown",
    column: "",
    style: { fontSize: "1rem", lineHeight: "1.5rem", fontWeight: "normal", fontStyle: "normal" },
  };
}
