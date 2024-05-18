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

type CodebookCreateOrUpdateBody = z.infer<typeof CodebooksCreateOrUpdateSchema>;

interface CreateOrUpdateCodebookProps {
  jobId: number;
  current?: z.infer<typeof CodebooksResponseSchema>;
  afterSubmit: () => void;
}

export function CreateCodebook({ jobId, current, afterSubmit }: CreateOrUpdateCodebookProps) {
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
    fields: variables,
    append: appendVariable,
    remove: removeVariable,
  } = useFieldArray({
    name: "codebook.variables",
    control: form.control,
  });

  function onSubmit(values: CodebookCreateOrUpdateBody) {
    console.log(values);
    // mutateAsync(values).then(afterSubmit).catch(console.error);
  }
  const shape = CodebooksCreateOrUpdateSchema.shape;

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
          <Accordion type="single" collapsible className="w-full">
            {variables.map((variable, index) => {
              console.log(variable);
              return (
                <AccordionItem key={variable.id} value={variable.id}>
                  <AccordionTrigger>{variable.name}</AccordionTrigger>
                  <AccordionContent>
                    <CodebookVariable type={variable.type} control={form.control} index={index} />
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
      <RadioFormField control={control} zType={shape.type} name={appendPath("type")} values={variableTypeOptions} />
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
