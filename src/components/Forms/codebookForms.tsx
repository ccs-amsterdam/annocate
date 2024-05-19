"use client";

import { useCreateOrUpdateCodebook } from "@/app/api/jobs/[jobId]/codebook/query";
import {
  CodebooksCreateOrUpdateSchema,
  CodebookSelectTypeSchema,
  CodebooksResponseSchema,
  variableTypeOptions,
} from "@/app/api/jobs/[jobId]/codebook/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { Control, FieldValues, Path, useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { Button } from "../ui/button";
import { Form } from "../ui/form";
import { RadioFormField, TextFormField } from "./formHelpers";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

type CodebookCreateOrUpdateBody = z.infer<typeof CodebooksCreateOrUpdateSchema>;

interface CreateOrUpdateCodebookProps {
  jobId: number;
  current?: z.infer<typeof CodebooksResponseSchema>;
  afterSubmit: () => void;
}

export function CreateCodebook({ jobId, current, afterSubmit }: CreateOrUpdateCodebookProps) {
  const [accordionValue, setAccordionValue] = useState<string>("");
  const { mutateAsync } = useCreateOrUpdateCodebook(jobId);
  const form = useForm<CodebookCreateOrUpdateBody>({
    resolver: zodResolver(CodebooksCreateOrUpdateSchema),
    defaultValues: current
      ? CodebooksCreateOrUpdateSchema.parse(current)
      : {
          name: "",
          codebook: {
            settings: {
              instruction: "",
              auto_instruction: false,
            },
            variables: [defaultVariable("Variable 1")],
          },
        },
  });

  const {
    fields: variables_array,
    append: appendVariable,
    remove: removeVariable,
    swap: swapVariable,
  } = useFieldArray({
    name: "codebook.variables",
    control: form.control,
    keyName: "id",
  });

  function onSubmit(values: CodebookCreateOrUpdateBody) {
    console.log(values);
    // mutateAsync(values).then(afterSubmit).catch(console.error);
  }
  const shape = CodebooksCreateOrUpdateSchema.shape;
  const variables = form.getValues("codebook.variables");
  console.log(accordionValue);
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
              return (
                <AccordionItem key={index} value={"V" + index}>
                  <div className="grid grid-cols-[2rem,1fr] items-center gap-3">
                    <SwapVariables
                      swap={swapVariable}
                      i={index}
                      n={variables.length}
                      setAccordionValue={setAccordionValue}
                    />

                    <div>
                      <AccordionTrigger>{variable.name}</AccordionTrigger>
                    </div>
                  </div>
                  <AccordionContent>
                    <CodebookVariable type={variable.type} control={form.control} index={index} />
                    <Button onClick={() => removeVariable(index)}>Remove Variable</Button>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
          <Button onClick={() => appendVariable(defaultVariable("Variable " + (variables.length + 1)))}>
            Add Variable
          </Button>
        </div>
        <Button type="submit">Create User</Button>
      </form>
    </Form>
  );
}

function SwapVariables({
  swap,
  i,
  n,
  setAccordionValue,
}: {
  swap: (index1: number, index2: number) => void;
  i: number;
  n: number;
  setAccordionValue: (value: string) => void;
}) {
  const itemArray = Array.from({ length: n }, (_, i) => i);
  return (
    <DropdownMenu modal={false} onOpenChange={() => setAccordionValue("")}>
      <DropdownMenuTrigger asChild>
        <Button className="h-8">{i + 1}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="flex w-full max-w-[80vw] gap-[11px] overflow-auto border-none bg-background"
        side="right"
        sideOffset={8}
      >
        {itemArray.map((j) => {
          if (j === i) return null;
          return (
            <DropdownMenuItem key={j} onClick={() => swap(i, j)} className="p-0">
              <Button variant={i > j ? "secondary" : "default"} className="h-8 w-[2rem]">
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
  function getShape() {
    if (type === "select code") return CodebookSelectTypeSchema.shape;
    return null;
  }
  const shape = getShape();
  console.log(shape);

  if (!shape) return null;
  function appendPath(key: string): Path<T> {
    return `codebook.variables.${index}.${key}` as Path<T>;
  }

  return (
    <div>
      <RadioFormField
        control={control}
        zType={shape.type}
        name={appendPath("type")}
        values={variableTypeOptions}
        labelWidth="8rem"
      />
      <TextFormField control={control} zType={shape.name} name={appendPath("name")} />
      <TextFormField control={control} zType={shape.question} name={appendPath("question")} />
      <TextFormField control={control} zType={shape.instruction} name={appendPath("instruction")} />
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
