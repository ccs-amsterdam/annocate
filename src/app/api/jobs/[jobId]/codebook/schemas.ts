import { SafeNameSchema, TableParamsSchema } from "@/app/api/schemaHelpers";
import { FormOptions } from "@/components/Forms/formHelpers";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

extendZodWithOpenApi(z);

export const variableTypeOptions: FormOptions[] = [
  { value: "select code", label: "Select Code", description: "Select one or more codes from a list" },
  { value: "search code", label: "Search Code", description: "Search for codes in a list" },
  { value: "scale", label: "Scale", description: "Rate on a scale" },
  { value: "annotinder", label: "Annotinder", description: "Annotate with Annotinder" },
  { value: "confirm", label: "Confirm", description: "Confirm the annotation" },
];

export const CodebookCodeSchema = z.object({
  code: z.string().openapi({
    title: "Code",
    description: "This is the code value that will be shown to the annotator. Needs to be unique within the variable.",
    example: "Code label shown to user",
  }),
  color: z.string().nullish().openapi({
    title: "Color",
    description: "Optionally, you can specify a custom color for displaying the code.",
    example: "#FF0000 | red | yellow | ...",
  }),
  value: z.union([z.string(), z.number()]).nullish().openapi({
    title: "Value",
    description:
      "Optionally, you can specify an additional value related to the code. This can be a number or a string, and doesn't have to be unique",
    example: "negative | -1 | ...",
  }),
});

export const CodebookVariableSchema = z.object({
  name: SafeNameSchema.openapi({
    title: "Name",
    description:
      "The name of the variable. Will not be shown to user, so pick a name that works well in your analysis software (e.g., avoid spaces). Needs to be unique within the codebook, and only contain alphanumeric characters and underscores.",
    example: "variable_name",
  }),
  question: z.string().max(512).openapi({
    title: "Question",
    description: "The question that will be shown to the annotator.",
    example: "What is the question you want to ask?",
  }),
  type: z.enum(["select code", "search code", "scale", "annotinder", "confirm"]).openapi({
    title: "Type",
    description: "The type of the variable",
    example: "select code",
  }),
  instruction: z.string().nullish().openapi({
    title: "Instruction",
    description:
      "Optionally, you can provide additional instructions for this variable. This is a markdown string, so you can style it as you like",
    example: "Here we measure emotion, defined as ...",
  }),

  perField: z
    .array(z.string())
    .nullish()
    .openapi({
      title: "Per Field",
      description:
        "Optionally, you can ask this question for a specific field, or ask it multiple times for multiple fields. If a field is numbered (e.g., comment.1, comment.1) it will be asked for each item",
      example: ["title", "lead"],
    }),
  perAnnotation: z.array(z.string()).nullish(),
});

export const CodebookVariableItemSchema = z.object({
  name: SafeNameSchema.openapi({
    title: "Name",
    description:
      "The name of the item. This will be concatenated with the variable name. Should only contain alphanumeric characters and underscores. This is never shown to the coder (that's what the label is for)",
    example: "Item name",
  }),
  label: z.string().max(128).nullish().openapi({
    title: "Label",
    description: "The label of the item",
    example: "Item label",
  }),
});

export const CodebookAnnotinderTypeSchema = CodebookVariableSchema.extend({
  type: z.enum(["annotinder"]),
  codes: z.array(CodebookCodeSchema).max(3),
});

export const CodebookScaleTypeSchema = CodebookVariableSchema.extend({
  type: z.enum(["scale"]),
  items: z.array(CodebookVariableItemSchema),
});

export const CodebookSelectTypeSchema = CodebookVariableSchema.extend({
  type: z.enum(["select code"]),
  codes: z.array(CodebookCodeSchema),
  multiple: z.boolean().nullish(),
  vertical: z.boolean().nullish(),
  same_size: z.boolean().nullish(),
});

export const CodebookSearchTypeSchema = CodebookVariableSchema.extend({
  type: z.enum(["search code"]),
  codes: z.array(CodebookCodeSchema),
  multiple: z.boolean().nullish(),
});

export const CodebookSettingsSchema = z.object({
  instruction: z.string().nullish().openapi({
    title: "Instruction",
    description:
      "Optionally, you can provide additional instructions for the codebook. This is a markdown string, so you can style it as you like",
    example: "Here we measure emotion, defined as ...",
  }),
  auto_instruction: z.boolean().nullish(),
});

export const CodebookUnionTypeSchema = z.union([
  CodebookAnnotinderTypeSchema,
  CodebookScaleTypeSchema,
  CodebookSelectTypeSchema,
  CodebookSearchTypeSchema,
]);

export const CodebookSchema = z.object({
  variables: z.array(CodebookUnionTypeSchema),
  settings: CodebookSettingsSchema,
});

///////////////////////////

export const CodebooksTableParamsSchema = TableParamsSchema.extend({});

export const CodebooksResponseSchema = z.object({
  id: z.number(),
  jobId: z.number(),
  name: z.string(),
  codebook: CodebookSchema,
});

export const CodebooksCreateOrUpdateSchema = z.object({
  name: z.string().max(128).openapi({
    title: "Name",
    description: "The name of the codebook",
    example: "My first codebook",
  }),
  codebook: CodebookSchema,
});
