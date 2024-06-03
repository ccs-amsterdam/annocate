import { SafeNameSchema, TableParamsSchema } from "@/app/api/schemaHelpers";
import { FormOptions } from "@/components/Forms/formHelpers";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const variableType = [
  "select code",
  "search code",
  "scale",
  "annotinder",
  "confirm",
  "span",
  "relation",
] as const;
export const variableTypeOptions: FormOptions[] = [
  { value: "select code", label: "Select Code", description: "Select one or multiple buttons" },
  { value: "search code", label: "Search Code", description: "Search and select one or multiple items from a list" },
  { value: "scale", label: "Scale", description: "Rate one or multiple items on a scale" },
  { value: "annotinder", label: "Swipe", description: "Swipe to annotate (only for 2 or 3 codes)" },
  { value: "confirm", label: "Confirm", description: "Ask annotator to confirm something" },
];

export const CodebookCodeSchema = z.object({
  code: z.string().min(1).trim().openapi({
    title: "Code",
    description: "This is the code value that will be shown to the annotator. Needs to be unique within the variable.",
    example: "Code label shown to user",
  }),
  color: z.string().optional().openapi({
    title: "Color",
    description: "Optionally, you can specify a custom color for displaying the code.",
    example: "#FF0000 | red | yellow | ...",
  }),
  value: z.union([z.string(), z.number()]).optional().openapi({
    title: "Value",
    description:
      "Optionally, you can specify an additional value related to the code. This can be a number or a string, and doesn't have to be unique",
    example: "negative | -1 | ...",
  }),

  required_for: z.array(z.string()).optional(),
  makes_irrelevant: z.array(z.string()).optional(),
});

export const CodebookCodesSchema = z
  .array(CodebookCodeSchema)
  .refine(
    (codes) => {
      const names = codes.map((c) => c.code || "");
      return new Set(names).size === names.length;
    },
    { message: "Codes must be unique" },
  )
  .openapi({
    title: "Codes",
    description: "The codes that will be shown to the annotator. Codes have to be unique",
  });

export const CodebookSwipeCodesSchema = z
  .array(CodebookCodeSchema)
  .max(3)
  .refine(
    (codes) => {
      const names = codes.map((c) => c.code);
      return new Set(names).size === names.length;
    },
    { message: "Codes must be unique" },
  )
  .openapi({
    title: "Codes",
    description:
      "The codes that will be shown to the annotator. For swiping, only 2 or 3 codes are allowed. the first, second and third code correspond to the left, right, and upward swipe respectively",
  });

export const CodebookVariableSchema = z.object({
  type: z.enum(variableType).openapi({
    title: "Type",
    description: "Choose a format in which the variable will be presented to the annotator.",
    example: "select code",
  }),
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
  instruction: z.string().optional().openapi({
    title: "Instruction",
    description:
      "Provide specific instructions for this variable. This overwrites the general instruction for the codebook.",
    example: "Here we measure emotion, defined as ...",
  }),

  perField: z
    .array(z.string())
    .optional()
    .openapi({
      title: "Per Field",
      description:
        "Optionally, you can ask this question for a specific field, or ask it multiple times for multiple fields. If a field is numbered (e.g., comment.1, comment.1) it will be asked for each item",
      example: ["title", "lead"],
    }),
  perAnnotation: z.array(z.string()).optional(),
  focusAnnotations: z.boolean().optional(),
  fields: z.array(z.string()).optional(),
});

export const CodebookVariableItemSchema = z.object({
  name: SafeNameSchema.openapi({
    title: "Name",
    description:
      "The name of the item. This will be concatenated with the variable name. Should only contain alphanumeric characters and underscores. This is never shown to the coder (that's what the label is for)",
    example: "Item name",
  }),
  label: z.string().max(128).optional().openapi({
    title: "Label",
    description: "The label of the item",
    example: "Item label",
  }),
});

export const CodebookVariableItemsSchema = z
  .array(CodebookVariableItemSchema)
  // .min(0)
  .refine(
    (items) => {
      const names = items.map((i) => i.name);
      return new Set(names).size === names.length;
    },
    { message: "Item names must be unique" },
  )
  .optional()
  .openapi({
    title: "Items",
    description:
      "The items for which the question is asked. The name is for your own use, and will be concatenated with the variable name to store the results. The label is shown to the user",
  });

export const CodebookParamsVerticalSchema = z.boolean().optional().default(false).openapi({
  title: "Vertical",
  description: "If enabled, all buttons are put in a single column",
  example: true,
});

export const CodebookParamsMultipleSchema = z.boolean().optional().default(false).openapi({
  title: "Multiple",
  description: "If enabled, multiple options can be chosen",
  example: true,
});

export const CodebookRelationOptionsSchema = z.object({
  variable: z.string(),
  values: z.array(z.string()).optional(),
});

export const CodebookRelationSchema = z.object({
  codes: CodebookCodesSchema,
  from: CodebookRelationOptionsSchema,
  to: CodebookRelationOptionsSchema,
});

export const CodebookSpanTypeSchema = CodebookVariableSchema.extend({
  type: z.enum(["span"]),
  codes: CodebookCodesSchema,
  editMode: z.boolean().optional(),
});
export const CodebookRelationTypeSchema = CodebookVariableSchema.extend({
  type: z.enum(["relation"]),
  relations: z.array(CodebookRelationSchema),
  editMode: z.boolean().optional(),
});

export const CodebookAnnotinderTypeSchema = CodebookVariableSchema.extend({
  type: z.enum(["annotinder"]),
  codes: CodebookSwipeCodesSchema,
});

export const CodebookScaleTypeSchema = CodebookVariableSchema.extend({
  type: z.enum(["scale"]),
  codes: CodebookCodesSchema,
  items: CodebookVariableItemsSchema,
});

export const CodebookSelectTypeSchema = CodebookVariableSchema.extend({
  type: z.enum(["select code"]),
  codes: CodebookCodesSchema,
  multiple: CodebookParamsMultipleSchema,
  vertical: CodebookParamsVerticalSchema,
  same_size: z.boolean().optional(),
});

export const CodebookSearchTypeSchema = CodebookVariableSchema.extend({
  type: z.enum(["search code"]),
  codes: CodebookCodesSchema,
  multiple: z.boolean().optional(),
});

export const CodebookConfirmTypeSchema = CodebookVariableSchema.extend({
  type: z.enum(["confirm"]),
});

export const CodebookSettingsSchema = z.object({
  instruction: z.string().optional().openapi({
    title: "Instruction",
    description:
      "Optionally, you can provide additional instructions for the codebook. This is a markdown string, so you can style it as you like",
    example: "Here we measure emotion, defined as ...",
  }),
  auto_instruction: z.boolean().optional().openapi({
    title: "Automatically open instruction the first time",
    description:
      "If enabled, the instruction is automatically shown to the annotator the first time they encounter this codebook.",
    example: true,
  }),
});

export const CodebookUnionTypeSchema = z.union([
  CodebookSpanTypeSchema,
  CodebookRelationTypeSchema,
  CodebookScaleTypeSchema,
  CodebookAnnotinderTypeSchema,
  CodebookSelectTypeSchema,
  CodebookSearchTypeSchema,
  CodebookConfirmTypeSchema,
]);

export const CodebookVariablesSchema = z.array(CodebookUnionTypeSchema).refine(
  (variables) => {
    const names = variables.map((v) => v.name);
    return new Set(names).size === names.length;
  },
  { message: "Variable names must be unique" },
);

export const CodebookSchema = z.object({
  variables: CodebookVariablesSchema.openapi({
    title: "Variables",
    description: "The variables that will be shown to the annotator. Names have to be unique",
  }),
  settings: CodebookSettingsSchema,
});

///////////////////////////

export const CodebooksTableParamsSchema = TableParamsSchema.extend({});

export const CodebookNameSchema = z.string().min(0).max(128).openapi({
  title: "Name",
  description: "The name of the codebook",
  example: "My first codebook",
});

export const CodebooksResponseSchema = z.object({
  id: z.number(),
  projectId: z.number(),
  name: z.string(),
});

export const CodebookResponseSchema = z.object({
  id: z.number(),
  projectId: z.number(),
  name: z.string(),
  codebook: CodebookSchema,
});

export const CodebookCreateBodySchema = z.object({
  name: CodebookNameSchema,
  codebook: CodebookSchema,
  overwrite: z.boolean().optional().openapi({
    title: "Overwrite",
    description: "If a codebook with the same name already exists, overwrite it",
    example: true,
  }),
});

export const CodebookCreateResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export const CodebookUpdateBodySchema = z.object({
  name: CodebookNameSchema.optional(),
  codebook: CodebookSchema.optional(),
});
