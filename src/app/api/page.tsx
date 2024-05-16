"use client";
import { useMemo } from "react";
import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";
import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";

import { openapiUsers } from "./users/openapi";
import { openapiJobs } from "./jobs/openapi";

const config = {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "AnnoTinder API",
    description: "Endpoints of the AnnoTinder API",
  },
  servers: [{ url: "api" }],
};

const allDescriptions = [...openapiUsers, ...openapiJobs];

export default function OpenAPI() {
  const spec = useMemo(() => {
    return new OpenApiGeneratorV3(allDescriptions).generateDocument(config);
  }, []);

  return (
    <div className="rounded bg-white p-3">
      <SwaggerUI spec={spec} supportedSubmitMethods={[]} />
    </div>
  );
}
