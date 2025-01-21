"use client";

import { useUpdateCodebook, useCreateCodebook } from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/";
import {
  CodebookScaleTypeSchema,
  CodebookSelectTypeSchema,
  CodebookVariableSchema,
  InstructionModeOptions,
  variableTypeOptions,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/variableSchemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { Equal, Plus, Save, Watch, XIcon } from "lucide-react";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { Control, FieldValues, Path, useForm, UseFormReturn, useWatch } from "react-hook-form";
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
import { CodebookSchema } from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/schemas";
import {
  fieldTypeOptions,
  UnitGeneralLayoutSchema,
  UnitImageLayoutSchema,
  UnitMarkdownLayoutSchema,
  UnitTextLayoutSchema,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/layoutSchemas";
import { StyleToolbar } from "../Common/StyleToolbar";
import { Label } from "../ui/label";
import { SetState } from "@/app/types";
import { CodebookPreview } from "@/app/projects/[projectId]/jobs/[jobId]/design/page";
import { equal } from "assert";

type Codebook = z.infer<typeof CodebookSchema>;

export const CodebookUpdateSchema = z.object({
  jobBlockId: z.number(),
  codebook: CodebookSchema,
});
type CodebookUpdate = z.input<typeof CodebookUpdateSchema>;

interface UpdateCodebookProps {
  projectId: number;
  current: z.input<typeof CodebookUpdateSchema>;
  afterSubmit?: () => void;
  setPreview?: SetState<CodebookPreview | undefined>;
  saveOnChange?: React.MutableRefObject<{ dirty: boolean; error: boolean; save?: () => void }>;
}

export const UpdateCodebook = React.memo(function UpdateCodebook({
  projectId,
  current,
  afterSubmit,
  setPreview,
  saveOnChange,
}: UpdateCodebookProps) {
  const { mutateAsync } = useUpdateCodebook(projectId, current.id);
  const form = useForm<CodebookUpdate>({
    resolver: zodResolver(CodebookUpdateSchema),
    defaultValues: CodebookUpdateSchema.parse(current),
  });

  const { error } = form.getFieldState("codebook");
  const { error: variablesError } = form.getFieldState("codebook.variables");
  const variables = form.getValues("codebook.variables");
  const currentAsString = useMemo(() => JSON.stringify(CodebookUpdateSchema.parse(current)), [current]);

  useEffect(() => {
    form.reset(CodebookUpdateSchema.parse(current));
  }, [current, form]);

  useEffect(() => {
    function beforeUnload(e: BeforeUnloadEvent) {
      e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
    }
    if (form.formState.isDirty) return;
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [form]);

  function renderUnitFields() {
    if (current.codebook.type !== "annotation") return null;
    return (
      <div className="w-full">
        <div className="prose mt-6 w-full border-b-2 pb-2 dark:prose-invert">
          <h3 className="text-foreground/80">Unit Mapping</h3>
        </div>
        <UnitFields form={form} />
      </div>
    );
  }

  function onSubmit(values: CodebookUpdate) {
    if (variables.length === 0) return alert("You need to add at least one variable");
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }
  const shape = CodebookUpdateSchema.shape;

  let isDirty = form.formState.isDirty;
  if (isDirty) {
    // for some reason, the form can be dirty when the data is completely identical...
    if (JSON.stringify(form.getValues()) === currentAsString) isDirty = false;
  }

  // TODO
  // Add "saveAs" argument to mutate codebook endpoint. If given, create copy with this name.
  // When saving a codebook that is used in multiple jobs, ask if the user wants to save or copy as.
  // this argument can also be passed to the saveOnChange.save function, so this question can
  // also be asked from the onChange modal

  if (saveOnChange)
    saveOnChange.current = {
      dirty: isDirty,
      error: !!error,
      save: async () => {
        const values = form.getValues();
        await mutateAsync(values).then(afterSubmit).catch(console.error);
      },
    };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="relative flex w-full flex-col gap-3 p-3 lg:px-8">
        <div
          className={`fixed left-0 top-0 z-50 flex h-[var(--header-height)] w-full items-center justify-between gap-10 border-b bg-background px-8 ${isDirty ? "" : "hidden"} `}
        >
          <Button
            type="button"
            className="flex w-min items-center gap-2 shadow-lg disabled:opacity-0"
            variant="destructive"
            onClick={() => form.reset(CodebookUpdateSchema.parse(current))}
          >
            <XIcon className="h-5 w-5" />
            Undo changes
          </Button>
          <div>
            {error ? <div className="text-destructive">{error.message}</div> : null}
            {variablesError ? <div className="text-destructive">{variablesError.message}</div> : null}
          </div>
          <Button
            className="flex w-min items-center gap-2 shadow-lg disabled:opacity-50"
            type="submit"
            disabled={!isDirty || !!error}
          >
            <Save className="h-5 w-5" />
            Save changes
          </Button>
        </div>

        {renderUnitFields()}
        <div>
          <div className="prose mt-6 w-full border-b-2 pb-2 dark:prose-invert">
            <h3 className="text-foreground/80">Variables</h3>
          </div>
          {/* <TextAreaFormField
          control={form.control}
          zType={shape.codebook.shape.settings.shape.instruction}
          name="codebook.settings.instruction"
        />
        <BooleanFormField
          control={form.control}
          zType={shape.codebook.shape.settings.shape.auto_instruction}
          name="codebook.settings.auto_instruction"
        /> */}
          <Variables form={form} />
        </div>
        <WatchForPreview id={current.jobBlockId} form={form} setPreview={setPreview} />
      </form>
    </Form>
  );
});

function UnitFields({ form }: { form: UseFormReturn<CodebookUpdateSchema> }) {
  const [accordionValue, setAccordionValue] = useState<string>("");
  const fields = form.getValues("codebook.unit.fields");

  if (!fields) return null;

  function appendField() {
    const newFields = [...fields, defaultField("Field_" + (fields.length + 1))];
    form.setValue("codebook.unit.fields", newFields, { shouldDirty: true });
    setAccordionValue("V" + (newFields.length - 1));
  }

  function removeField(index: number) {
    const newFields = fields.filter((_, i) => i !== index);
    form.setValue("codebook.unit.fields", newFields, { shouldDirty: true });
    setAccordionValue("");
  }

  function moveField(index1: number, index2: number) {
    // insert into the new position. Donn't swap
    const newFields = [...fields];
    const [removed] = newFields.splice(index1, 1);
    newFields.splice(index2, 0, removed);
    form.setValue("codebook.unit.fields", newFields, { shouldDirty: true });
    setAccordionValue("");
  }

  return (
    <div className="flex flex-col">
      <Accordion value={accordionValue} onValueChange={setAccordionValue} type="single" collapsible className="w-full">
        {fields.map((field, index) => {
          const varName = form.watch(`codebook.unit.fields.${index}.name`);
          const isActive = accordionValue === "V" + index;
          const { error } = form.getFieldState(`codebook.unit.fields.${index}`);
          let bg = isActive ? "bg-primary-light" : "";
          return (
            <AccordionItem key={index} value={"V" + index} className={`${bg} px-3`}>
              <div className={`grid grid-cols-[2rem,1fr] items-center gap-3 ${error ? "text-destructive" : ""}`}>
                <MoveItemInArray move={moveField} i={index} n={fields.length} bg={bg} error={!!error} />

                <div>
                  <AccordionTrigger className="text-left text-base no-underline hover:no-underline">
                    <span className="break-all">{varName.replace(/_/g, " ")}</span>
                  </AccordionTrigger>
                </div>
              </div>
              <AccordionContent className="flex flex-col gap-5 px-1 py-3">
                <LayoutField form={form} type={field.type} control={form.control} index={index} />
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
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="ml-auto mt-3 flex w-40 items-center gap-1"
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
  form: UseFormReturn<CodebookUpdateBody>;
  type: string;
  control: Control<T, any>;
  index: number;
}) {
  const generalShape = UnitGeneralLayoutSchema.shape;
  const style = form.watch(`codebook.unit.fields.${index}.style`);

  function appendPath(key: string): Path<T> {
    return `codebook.unit.fields.${index}.${key}` as Path<T>;
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
            setStyle={(style) => form.setValue(`codebook.unit.fields.${index}.style`, style, { shouldDirty: true })}
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
        <TextFormField control={control} zType={generalShape.column} name={appendPath("column")} />
      </div>
      {renderType()}
    </div>
  );
}

function Variables({ form }: { form: UseFormReturn<CodebookUpdateBody> }) {
  const [accordionValue, setAccordionValue] = useState<string>("");

  const variables = form.getValues("codebook.variables");

  function appendVariable() {
    const newVariables = [...variables, defaultVariable("Variable_" + (variables.length + 1))];
    form.setValue("codebook.variables", newVariables, { shouldDirty: true });
    setAccordionValue("V" + (newVariables.length - 1));
  }

  function removeVariable(index: number) {
    const newVariables = variables.filter((_, i) => i !== index);
    form.setValue("codebook.variables", newVariables, { shouldDirty: true });
    setAccordionValue("");
  }

  function moveVariable(index1: number, index2: number) {
    // insert into the new position. Donn't swap
    const newVariables = [...variables];
    const [removed] = newVariables.splice(index1, 1);
    newVariables.splice(index2, 0, removed);
    form.setValue("codebook.variables", newVariables, { shouldDirty: true });
    setAccordionValue("");
  }

  return (
    <div className="flex flex-col">
      <Accordion value={accordionValue} onValueChange={setAccordionValue} type="single" collapsible className="w-full">
        {variables.map((variable, index) => {
          const varName = form.watch(`codebook.variables.${index}.name`);
          const varQuestion = form.watch(`codebook.variables.${index}.question`);
          const varType = form.watch(`codebook.variables.${index}.type`);
          const isActive = accordionValue === "V" + index;
          const { error } = form.getFieldState(`codebook.variables.${index}`);
          let bg = isActive ? "bg-primary-light" : "";
          return (
            <AccordionItem key={index} value={"V" + index} className={`${bg} px-3`}>
              <div className={`grid w-full grid-cols-[2rem,1fr] items-center gap-3 ${error ? "text-destructive" : ""}`}>
                <MoveItemInArray move={moveVariable} i={index} n={variables.length} bg={bg} error={!!error} />

                <AccordionTrigger className="w-full text-base no-underline hover:no-underline">
                  {varName.replace(/_/g, " ")}
                </AccordionTrigger>
              </div>
              <AccordionContent className="flex flex-col gap-5 px-1 py-3">
                <CodebookVariable type={variable.type} control={form.control} index={index} />
                <ConfirmDialog
                  title="Remove variable"
                  message="This will remove the variable. Are you sure?"
                  onAccept={() => removeVariable(index)}
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
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="ml-auto mt-3 w-40"
        onClick={() => appendVariable()}
      >
        add variable
      </Button>
    </div>
  );
}

function CodebookVariable<T extends FieldValues>({
  type,
  control,
  index,
}: {
  type: string;
  control: Control<T, any>;
  index: number;
}) {
  const generalShape = CodebookVariableSchema.shape;

  function appendPath(key: string): Path<T> {
    return `codebook.variables.${index}.${key}` as Path<T>;
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
      <div className="grid grid-cols-2 gap-3">
        <TextFormField
          control={control}
          zType={generalShape.name}
          name={appendPath("name")}
          onChangeInterceptor={(v) => v.replace(/ /g, "_").replace(/[^a-zA-Z0-9_]/g, "")}
        />
        <DropdownFormField
          control={control}
          zType={generalShape.type}
          name={appendPath("type")}
          values={variableTypeOptions}
          labelWidth="8rem"
        />
      </div>
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
      {renderType()}
    </div>
  );
}

export function emptyCodebook(projectId: number, type: "survey" | "annotation" | undefined) {
  const unit = {
    fields: [],
    meta: [],
    grid: {
      areas: [],
      rows: [],
      columns: [],
    },
  };

  const settings = {
    instruction: "",
  };

  const variables = [
    {
      name: "Variable_1",
      question: "Question goes here",
      type: "select code" as const,
      codes: [
        { code: "First answer", value: 1 },
        { code: "Second answer", value: 2 },
        { code: "Third answer", value: 3 },
      ],
    },
  ];

  if (type === "survey") {
    const newCodebook: Codebook = {
      type: "survey",
      settings,
      variables,
    };
    return newCodebook;
  }
  const newCodebook: Codebook = {
    unit,
    type: "annotation",
    settings,
    variables,
  };
  return newCodebook;
}

function WatchForPreview({
  id,
  form,
  setPreview,
}: {
  id: number;
  form: any;
  setPreview?: SetState<CodebookPreview | undefined>;
}) {
  const watch = useWatch({ control: form.control, name: "codebook" });
  useEffect(() => {
    if (!setPreview) return;
    const timeout = setTimeout(() => {
      form.trigger();
      const codebook = CodebookSchema.safeParse(watch);
      if (codebook.success) setPreview({ id, codebook: codebook.data });
    }, 250);
    return () => clearTimeout(timeout);
  }, [watch, setPreview, form, id]);
  return <div></div>;
}

function defaultField(name: string): z.input<typeof UnitMarkdownLayoutSchema> {
  return {
    name,
    type: "markdown",
    column: "",
    style: { fontSize: "1rem", lineHeight: "1.5rem", fontWeight: "normal", fontStyle: "normal" },
  };
}

function defaultVariable(name: string): z.input<typeof CodebookSelectTypeSchema> {
  return {
    name,
    question: "",
    type: "select code",
    instruction: "",
    instructionMode: "after",
    multiple: false,
    vertical: false,
    codes: [{ code: "Example", value: 1, color: "red" }],
  };
}
