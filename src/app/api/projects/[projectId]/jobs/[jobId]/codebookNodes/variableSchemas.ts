import { SafeNameSchema, createTableParamsSchema } from "@/app/api/schemaHelpers";
import { FormOptions } from "@/components/Forms/formHelpers";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

///////////////// VARIABLES

export const CodebookCodeSchema = z.object({
  code: z.string().min(1).trim().openapi({
    title: "Code",
    description: "This is the code value that will be shown to the annotator. Needs to be unique within the variable.",
    example: "",
  }),
  color: z.string().optional().openapi({
    title: "Color",
    description: "Optionally, you can specify a custom color for displaying the code.",
    example: "#FF0000 | red | yellow | ...",
  }),
  // label: z.string().optional().openapi({
  //   title: "Label",
  //   description: "Optionally, you can specify a label for the code. If not specified the code value is used.",
  //   example: "Label shown to user",
  value: z.number().optional().openapi({
    title: "Value",
    description:
      "Optionally, you can specify a numeric value related to the code. If specified it needs to be unique within the variable.",
  }),
});

export const CodebookCodesSchema = z
  .array(CodebookCodeSchema)
  .refine(
    (codes) => {
      return codes.length > 0;
    },
    { message: "At least one code is required" },
  )
  .refine(
    (codes) => {
      const names = codes.map((c) => c.code || "");
      return new Set(names).size === names.length;
    },
    { message: "Codes must be unique" },
  )
  .refine(
    (codes) => {
      // values unique
      const values = codes.map((c) => c.value).filter((v) => v != null);
      return new Set(values).size === values.length;
    },
    { message: "Values must be unique" },
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
  .refine(
    (codes) => {
      // values unique
      const values = codes.map((c) => c.value);
      return new Set(values).size === values.length;
    },
    { message: "Values must be unique" },
  )
  .openapi({
    title: "Codes",
    description:
      "The codes that will be shown to the annotator. For swiping, only 2 or 3 codes are allowed. the first, second and third code correspond to the left, right, and upward swipe respectively",
  });

const CodebookQuestion = z.string().openapi({
  title: "Question",
  description: "The question that will be shown to the annotator. Supports scripts and markdown.",
  example: "You can use **markdown**, scipts like {{'this'}}, and variables like data$column",
});

const CodebookQuestionStyle = z
  .record(z.string(), z.string())
  .optional()
  .openapi({
    title: "Question style",
    description: "An object with inline CSS properties",
    example: { fontSize: "1.3em", fontWeight: "bold" },
  });

const CodebookInstruction = z.string().optional().openapi({
  title: "Instruction",
  description: "Provide specific instructions for this variable. Supports scripts and markdown.",
});

const CodebookInstructionStyle = z
  .record(z.string(), z.string())
  .optional()
  .openapi({
    title: "Instruction style",
    description: "An object with inline CSS properties",
    example: { fontSize: "1.3em", fontWeight: "bold" },
  });

const CodebookInstructionAuto = z.boolean().optional().openapi({
  title: "Auto Instruction",
  description: "If true, the instruction modal will automatically be opened the first time the variable is shown.",
});

export const CodebookVariableBaseSchema = z.object({
  question: CodebookQuestion,
  questionStyle: CodebookQuestionStyle,
  instruction: CodebookInstruction,
  instructionStyle: CodebookInstructionStyle,
  instructionAuto: CodebookInstructionAuto,
  fields: z.array(z.string()).optional(),
});

//
// QUESTION VARIABLE
//
export const answerType = ["select code", "search code", "scale", "annotinder", "confirm"] as const;
export const answerTypeOptions: FormOptions[] = [
  { value: "select code", label: "Select Code", description: "Select one or multiple buttons" },
  { value: "search code", label: "Search Code", description: "Search and select one or multiple items from a list" },
  { value: "scale", label: "Scale", description: "Rate one or multiple items on a scale" },
  { value: "annotinder", label: "Swipe", description: "Swipe to annotate (only for 2 or 3 codes)" },
  { value: "confirm", label: "Confirm", description: "Ask annotator to confirm something" },
];

export const CodebookQuestionVariableBaseSchema = CodebookVariableBaseSchema.extend({
  type: z.enum(answerType).openapi({
    title: "Answer type",
    description:
      "The answer type determines how the user can submit their answer. For instance, by clicking a button or swiping.",
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
      "The items for which the question is asked. The item name combines with the variable name (variable.item). The label is shown to the user. If no label is provided, the name is shown (with underscores replaced by spaces).",
  });

export const CodebookParamsVerticalSchema = z.boolean().optional().openapi({
  title: "Vertical",
  description: "If enabled, all buttons are put in a single column",
  example: true,
});

export const CodebookParamsMultipleSchema = z.boolean().optional().openapi({
  title: "Multiple",
  description: "If enabled, multiple options can be chosen",
  example: true,
});

export const CodebookQuestionAnnotinderTypeSchema = CodebookQuestionVariableBaseSchema.extend({
  type: z.literal("annotinder"),
  codes: CodebookSwipeCodesSchema,
});

export const CodebookQuestionScaleTypeSchema = CodebookQuestionVariableBaseSchema.extend({
  type: z.literal("scale"),
  codes: CodebookCodesSchema,
  items: CodebookVariableItemsSchema,
});

export const CodebookQuestionSelectTypeSchema = CodebookQuestionVariableBaseSchema.extend({
  type: z.literal("select code"),
  codes: CodebookCodesSchema,
  multiple: CodebookParamsMultipleSchema,
  vertical: CodebookParamsVerticalSchema,
  same_size: z.boolean().optional(),
});

export const CodebookQuestionSearchTypeSchema = CodebookQuestionVariableBaseSchema.extend({
  type: z.literal("search code"),
  codes: CodebookCodesSchema,
  multiple: z.boolean().optional(),
});

export const CodebookQuestionConfirmTypeSchema = CodebookQuestionVariableBaseSchema.extend({
  type: z.literal("confirm"),
});

export const CodebookQuestionVariableSchema = z.discriminatedUnion("type", [
  CodebookQuestionAnnotinderTypeSchema,
  CodebookQuestionScaleTypeSchema,
  CodebookQuestionSelectTypeSchema,
  CodebookQuestionSearchTypeSchema,
  CodebookQuestionConfirmTypeSchema,
]);

//
// ANNOTATION VARIABLE
//
export const annotationType = ["select code", "search code", "scale", "annotinder", "confirm"] as const;
export const annotationTypeOptions: FormOptions[] = [
  { value: "span", label: "Span", description: "Select span of tokens" },
  { value: "relation", label: "Relation", description: "Draw relation between different spans" },
];
export const CodebookAnnotationVariableBaseSchema = CodebookVariableBaseSchema.extend({
  type: z.enum(annotationType).openapi({
    title: "Annotation type",
    description:
      "The annotation type determines how the user can submit their answer. For instance, by clicking a button or swiping.",
  }),
  question: CodebookQuestion,
  questionStyle: CodebookQuestionStyle,
  instruction: CodebookInstruction,
  instructionStyle: CodebookInstructionStyle,
  instructionAuto: CodebookInstructionAuto,
});

export const CodebookAnnotationRelationOptionsSchema = z.object({
  variable: z.string(),
  values: z.array(z.string()).optional(),
});

export const CodebookAnnotationRelationSchema = z.object({
  codes: CodebookCodesSchema,
  from: CodebookAnnotationRelationOptionsSchema,
  to: CodebookAnnotationRelationOptionsSchema,
});

export const CodebookAnnotationSpanTypeSchema = CodebookAnnotationVariableBaseSchema.extend({
  type: z.literal("span"),
  codes: CodebookCodesSchema,
  editMode: z.boolean().optional(),
});
export const CodebookAnnotationRelationTypeSchema = CodebookAnnotationVariableBaseSchema.extend({
  type: z.literal("relation"),
  relations: z.array(CodebookAnnotationRelationSchema),
  editMode: z.boolean().optional(),
});

export const CodebookAnnotationVariableSchema = z.discriminatedUnion("type", [
  CodebookAnnotationSpanTypeSchema,
  CodebookAnnotationRelationTypeSchema,
]);
