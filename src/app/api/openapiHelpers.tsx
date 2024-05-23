import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

interface PostMethod {
  method: "post" | "put";
  path: string;
  description: string;
  body: z.ZodSchema<any>;
  response?: z.ZodSchema<any>;
}

interface GetMethod {
  method: "get";
  path: string;
  description: string;
  params?: z.ZodSchema<any>;
  response?: z.ZodSchema<any>;
}

export function createOpenAPIDefinitions(tags: string[], method: (PostMethod | GetMethod)[]) {
  const registry = new OpenAPIRegistry();
  for (const m of method) {
    const request: any = {};
    if ("body" in m)
      request.body = {
        content: {
          "application/json": {
            schema: m.body,
          },
        },
        required: true,
      };
    if ("params" in m) request.params = m.params;

    registry.registerPath({
      method: m.method,
      path: m.path,
      tags,
      description: m.description,
      request,
      responses: {
        200: {
          description: "Success",
          content: {
            "application/json": {
              schema: m.response || z.object({}),
            },
          },
        },
      },
    });
  }

  return registry.definitions;
}
