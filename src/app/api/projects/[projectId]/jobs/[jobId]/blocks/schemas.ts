import { createTableParamsSchema, SafeNameSchema } from "@/app/api/schemaHelpers";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { CodebookVariablesSchema, VariableSchema } from "./variablesSchemas";
import { UnitLayoutSchema } from "./layoutSchemas";

extendZodWithOpenApi(z);

// export const CodebookSettingsSchema = z.object({
//   instruction: z
//     .string()
//     .optional()
//     .openapi({
//       title: "Instruction",
//       description: `Codebooks can contain general instructions for the annotator. These will be shown the first time the annotator sees the codebook in a session,
//        and can be opened again by clicking the instruction button.`,
//     }),
// });

// export const CodebookBaseSchema = z.object({
//   type: z.enum(["survey", "annotation"]),
//   variables: CodebookVariablesSchema.openapi({
//     title: "Variables",
//     description: "The variables that will be shown to the annotator",
//   }),
//   settings: CodebookSettingsSchema,
// });

// export const CodebookSurveySchema = CodebookBaseSchema.extend({
//   type: z.literal("survey"),
// });

// export const CodebookAnnotationSchema = CodebookBaseSchema.extend({
//   type: z.literal("annotation"),
//   unit: UnitLayoutSchema.optional().openapi({
//     title: "Unit",
//     description: "Change unit design for this ",
//   }),
// });

// // !!!!!!!!!!!!!!!!
// // We WILL still have a codebook schema, but this will be for the full collection
// // of Job Blocks. This won't have a form, and is only meant for the API, so that
// // in R and stuff you can just upload a full validated codebook at once. Only on webclient
// // do we need the separate jobblock endpoints

// export const CodebookSchema = z.union([CodebookSurveySchema, CodebookAnnotationSchema]);
// export const CodebookUpdateSchema = z.object({
//   codebook: CodebookSchema,
// });

// //////////////////////////////////////////////////////////

// export const CodebooksTableParamsSchema = createTableParamsSchema({
//   add: {
//     type: z.enum(["survey", "annotation"]).optional().openapi({
//       title: "Type",
//       description: "Filter by codebook type",
//       example: "survey",
//     }),
//   },
// });

// Here we split the jobBlock into the position and content information.
// This is for efficient updating and caching in the web client
export const JobBlockMetaSchema = z.object({
  phase: z.enum(["preSurvey", "annotate", "postSurvey"]).openapi({
    title: "Job phase",
    description: "A job can have multiple phases. Pre-survey, annotation, and post-survey",
  }),
  parentId: z.number().nullable().openapi({ title: "Job Block parent ID", description: "The ID of another job Block" }),
  position: z.number().openapi({ title: "Block position", description: "Position of the block in the job" }),
});

export const JobBlockContentSchema = z.object({
  name: SafeNameSchema.openapi({
    title: "Name",
    description:
      "The name of the block. Will not be visible to annotators. Needs to be unique within the codebook, and only contain alphanumeric characters and underscores.",
    example: "unique_block_name",
  }),
  type: z.enum(["surveyQuestion", "unitLayout", "annotationQuestion"]).openapi({
    title: "Block type",
    description: "The type of the block. A survey question, a unit layout, or an annotation question",
  }),
  content: VariableSchema,
});

export const JobBlockCreateSchema = JobBlockMetaSchema.merge(JobBlockContentSchema);
export const JobBlockMetaUpdateSchema = JobBlockMetaSchema.partial();
export const JobBlockContentUpdateSchema = JobBlockContentSchema.partial();

export const JobBlockResponseSchema = JobBlockMetaSchema.merge(JobBlockContentSchema).extend({
  id: z.number(),
});

export const JobBlockMetaResponseSchema = JobBlockMetaSchema.extend({
  id: z.number(),
});

export const JobBlockContentResponseSchema = JobBlockContentSchema.extend({
  id: z.number(),
});
