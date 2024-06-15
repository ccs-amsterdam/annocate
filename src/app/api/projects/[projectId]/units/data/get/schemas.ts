import { z } from "zod";

export const GetUnitParamSchema = z.object({
  id: z.string(),
});
