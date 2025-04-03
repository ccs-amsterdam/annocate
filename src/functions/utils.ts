import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// These are all the dynamic URL params used in the app.
// Nextjs always gives them as string, so we need to coerce them to the correct type.
const SafeParamsSchema = z.object({
  projectId: z.coerce.number(),
  jobId: z.coerce.number(),
  codebookNodeId: z.coerce.number(),
  codebookId: z.coerce.number(),
  userId: z.string(),
  unitId: z.coerce.string(),
});
type SafeParams = z.infer<typeof SafeParamsSchema>;

export function safeParams<T extends object>(params: T): Pick<SafeParams, Extract<keyof T, keyof SafeParams>> {
  const parsed = SafeParamsSchema.partial().parse(params);
  return parsed as Pick<SafeParams, Extract<keyof T, keyof SafeParams>>;
}
