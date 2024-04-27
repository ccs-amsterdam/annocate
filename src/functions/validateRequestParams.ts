import { z } from "zod";

export default function validateRequestParams(req: Request, schema: z.ZodObject<any, any>) {
  const { searchParams } = new URL(req.url);
  const paramNames = Object.keys(schema.shape);
  const params: Record<string, any> = {};
  for (const paramName of paramNames) {
    const param = searchParams.get(paramName);
    if (param) params[paramName] = param;
  }

  return schema.parse(params);
}
