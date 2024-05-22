"use client";

import { useCreateOrUpdateCodebook } from "@/app/api/jobs/[jobId]/codebook/query";
import {
  CodebookScaleTypeSchema,
  CodebookSchema,
  CodebooksCreateOrUpdateSchema,
  CodebookSelectTypeSchema,
  CodebooksResponseSchema,
  CodebookVariableSchema,
  variableTypeOptions,
} from "@/app/api/jobs/[jobId]/codebook/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { Control, FieldValues, Path, useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { Button } from "../ui/button";
import { Form } from "../ui/form";
import { DropdownFormField, RadioFormField, TextFormField } from "./formHelpers";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { AlertCircle, ChevronDown, XIcon } from "lucide-react";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { AlertDialog } from "../ui/alert-dialog";
import { ConfirmDialog } from "../ui/confirm-dialog";

type Codebook = z.infer<typeof CodebookSchema>;
type CodebookCreateOrUpdateBody = z.infer<typeof CodebooksCreateOrUpdateSchema>;

export function useCreateCodebook(jobId: number) {
  const { mutateAsync } = useCreateOrUpdateCodebook(jobId);

  const create = useCallback(() => {
    const newCodebook = {
      name: "New codebook",
      codebook: {
        settings: {
          instruction: "",
          auto_instruction: false,
        },
        variables: [],
      },
    };
    return mutateAsync(newCodebook);
  }, [mutateAsync]);

  return { create };
}

interface UpdateCodebookProps {
  jobId: number;
  current: z.infer<typeof CodebooksResponseSchema>;
  afterSubmit?: () => void;
  setPreview?: (codebook: Codebook | undefined) => void;
}

export function UpdateCodebook({ jobId, current, afterSubmit, setPreview }: UpdateCodebookProps) {
  const [changed, setChanged] = useState(false);
  const [accordionValue, setAccordionValue] = useState<string>("");
  const { mutateAsync } = useCreateOrUpdateCodebook(jobId);
  const form = useForm<CodebookCreateOrUpdateBody>({
    resolver: zodResolver(CodebooksCreateOrUpdateSchema),
    defaultValues: CodebooksCreateOrUpdateSchema.parse(current),
  });

  useEffect(() => {
    setChanged(true);
  }, [current]);

  const { error } = form.getFieldState("codebook");
  const codebook = form.getValues();
  const variables = form.getValues("codebook.variables");

  useEffect(() => {
    if (!setPreview) return;
    const timer = setTimeout(() => {
      setPreview(codebook?.codebook);
    }, 1000);
    return () => clearTimeout(timer);
  }, [codebook, setPreview]);

  function appendVariable() {
    const newVariables = [...variables, defaultVariable("Variable_" + (variables.length + 1))];
    form.setValue("codebook.variables", newVariables, { shouldValidate: true });
    setAccordionValue("V" + (newVariables.length - 1));
  }

  function removeVariable(index: number) {
    const newVariables = variables.filter((_, i) => i !== index);
    form.setValue("codebook.variables", newVariables, { shouldValidate: true });
    setAccordionValue("");
  }

  function moveVariable(index1: number, index2: number) {
    // insert into the new position. Donn't swap
    const newVariables = [...variables];
    const [removed] = newVariables.splice(index1, 1);
    newVariables.splice(index2, 0, removed);
    form.setValue("codebook.variables", newVariables, { shouldValidate: true });
    setAccordionValue("");
  }

  function onSubmit(values: CodebookCreateOrUpdateBody) {
    if (variables.length === 0) return alert("You need to add at least one variable");
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }
  const shape = CodebooksCreateOrUpdateSchema.shape;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
        <TextFormField control={form.control} zType={shape.name} name="name" />
        <TextFormField
          control={form.control}
          zType={shape.codebook.shape.settings.shape.instruction}
          name="codebook.settings.instruction"
        />
        <div>
          <Accordion
            value={accordionValue}
            onValueChange={setAccordionValue}
            type="single"
            collapsible
            className="w-full"
          >
            {variables.map((variable, index) => {
              const varName = form.watch(`codebook.variables.${index}.name`);
              const varQuestion = form.watch(`codebook.variables.${index}.question`);
              const isActive = accordionValue === "V" + index;
              const { error } = form.getFieldState(`codebook.variables.${index}.name`);
              let bg = isActive ? "bg-primary-light" : "";
              return (
                <AccordionItem key={index} value={"V" + index} className={`${bg}  rounded p-3 `}>
                  <div className={`grid grid-cols-[2rem,1fr] items-center gap-3  ${error ? "text-destructive" : ""}`}>
                    <SwapVariables move={moveVariable} i={index} n={variables.length} bg={bg} error={!!error} />

                    <div>
                      <AccordionTrigger className="text-left no-underline hover:no-underline">
                        <span className="break-all">
                          {varName.replace(/_/g, " ")}
                          {/* {varQuestion && <span className="text-base text-primary/70"> - {variable.question}</span>} */}
                        </span>
                      </AccordionTrigger>
                    </div>
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
          <Button type="button" className="mt-3" onClick={() => appendVariable()}>
            Add Variable
          </Button>
        </div>
        <Button type="submit" disabled={!!error || variables.length === 0}>
          Create User
        </Button>
      </form>
    </Form>
  );
}

function SwapVariables({
  move,
  i,
  n,
  bg,
  error,
}: {
  move: (index1: number, index2: number) => void;
  i: number;
  n: number;
  bg: string;
  error: boolean;
}) {
  const itemArray = Array.from({ length: n }, (_, i) => i);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={n === 1}>
        <Button variant={error ? "destructive" : "default"} className={` h-8 rounded-full `}>
          {i + 1}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className={`flex items-center gap-[11px] overflow-auto border-none shadow-none ${bg} `}
        side="right"
        sideOffset={8}
      >
        move to
        {itemArray.map((j) => {
          if (j === i) return null;
          return (
            <DropdownMenuItem key={j} onClick={() => move(i, j)} className="p-0">
              <Button variant="secondary" className="h-8 w-[2rem] rounded-full hover:border-none ">
                {j + 1}
              </Button>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
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
          <div>select</div>
        </>
      );
    }
    if (type === "scale") {
      const shape = CodebookScaleTypeSchema.shape;
      return (
        <>
          <div>scale</div>
        </>
      );
    }
    return null;
  }

  return (
    <div className="flex flex-col gap-5">
      <DropdownFormField
        control={control}
        zType={generalShape.type}
        name={appendPath("type")}
        values={variableTypeOptions}
        labelWidth="8rem"
      />
      <TextFormField
        control={control}
        zType={generalShape.name}
        name={appendPath("name")}
        onChangeInterceptor={(v) => v.replace(/ /g, "_").replace(/[^a-zA-Z0-9_]/g, "")}
      />
      <TextFormField control={control} zType={generalShape.question} name={appendPath("question")} />
      <TextFormField control={control} zType={generalShape.instruction} name={appendPath("instruction")} />
      {renderType()}
    </div>
  );
}

function defaultVariable(name: string): z.infer<typeof CodebookSelectTypeSchema> {
  return {
    name,
    question: "",
    type: "select code",
    instruction: "",
    codes: [],
  };
}
