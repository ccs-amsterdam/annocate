import { TableParamsSchema } from "@/app/api/schemaHelpers";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

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
  name: z.string().openapi({
    title: "Name",
    description:
      "The name of the variable. Will not be shown to user, so pick a name that works well in your analysis software (e.g., avoid spaces). Needs to be unique within the codebook.",
    example: "variable_name",
  }),
  question: z.string().openapi({
    title: "Question",
    description: "The question that will be shown to the annotator.",
    example: "What is the question you want to ask?",
  }),
  type: z.enum(["select code", "search code", "scale", "annotinder", "confirm"]).openapi({
    title: "Type",
    description: "The type of the variable",
    example: "select code",
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
  name: z.string(),
  label: z.string().nullish(),
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
  instruction: z.string().nullish(),
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
  name: z.string(),
  codebook: CodebookSchema,
});
