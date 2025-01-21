import { z } from "zod";
import { UnitLayoutSchema } from "./layoutSchemas";

export const PhaseSchemaBase = z.object({});

export const SurveyPhaseSchema = PhaseSchemaBase.extend({});

export const AnnotationPhaseSchema = PhaseSchemaBase.extend({
  layout: UnitLayoutSchema,
});
