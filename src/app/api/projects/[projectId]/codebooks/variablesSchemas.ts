import { SafeNameSchema, createTableParamsSchema } from "@/app/api/schemaHelpers";
import { FormOptions } from "@/components/Forms/formHelpers";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

///////////////// VARIABLES

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

export const InstructionMode = ["before", "after", "modal", "auto_modal"] as const;
export const InstructionModeOptions: FormOptions[] = [
  { value: "before", label: "Before", description: "Show the instruction before the question" },
  { value: "after", label: "After", description: "Show the instruction after the question" },
  { value: "modal", label: "Modal", description: "Show the instruction in a modal" },
  { value: "auto_modal", label: "Auto Modal", description: "Modal that automatically opens the first time" },
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
  value: z.number().optional().openapi({
    title: "Value",
    description: "Optionally, you can specify a numeric value related to the code.",
  }),
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
    description: "The question that will be shown to the annotator. Supports scripts and markdown.",
    example: "What is the question you want to ask?",
  }),
  instruction: z.string().optional().openapi({
    title: "Instruction",
    description: "Provide specific instructions for this variable. Supports scripts and markdown.",
    example: "Here we measure emotion, defined as ...",
  }),
  instructionMode: z.enum(InstructionMode).optional().openapi({
    title: "Instruction Mode",
    description:
      "Choose where the instruction should be shown (default is after). Can be before or after the question, or in a modal that the annotator can open. If set to auto_modal, the instruction will be shown automatically the first time the annotator sees this variable in a session.",
    example: "after",
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

export const CodebookUnionTypeSchema = z.union([
  CodebookSpanTypeSchema,
  CodebookRelationTypeSchema,
  CodebookScaleTypeSchema,
  CodebookAnnotinderTypeSchema,
  CodebookSelectTypeSchema,
  CodebookSearchTypeSchema,
  CodebookConfirmTypeSchema,
]);

export const CodebookVariablesSchema = z
  .array(CodebookUnionTypeSchema)
  .min(1)
  .refine(
    (variables) => {
      const names = variables.map((v) => v.name);
      return new Set(names).size === names.length;
    },
    { message: "Variable names must be unique" },
  );
// .transform((variables) => {
//   if (variables.length > 0) return variables;
//   return [
//     {
//       type: "select code",
//       name: "default",
//       question: "Default question",
//       codes: [],
//     },
//   ];
// });
