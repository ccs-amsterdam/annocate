import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminApp } from "./AdminApp";
import type { ResearcherApi } from "../../api/httpResearcherApi";

const stubClient: ResearcherApi = {
  jobId: 1,
  forJob: () => stubClient,
  listJobs: () => new Promise(() => {}),
  listExamples: async () => [],
  createJobFromExample: () => new Promise(() => {}),
  createJobFromRecipe: () => new Promise(() => {}),
  createJob: () => new Promise(() => {}),
  deleteJob: () => new Promise(() => {}),
  getJob: () => new Promise(() => {}),
  updateJob: () => new Promise(() => {}),
  getJobUsers: () => new Promise(() => {}),
  putJobUsers: () => new Promise(() => {}),
  listCodebooks: () => new Promise(() => {}),
  getCodebook: () => new Promise(() => {}),
  createCodebook: () => new Promise(() => {}),
  updateCodebook: () => new Promise(() => {}),
  deleteCodebook: () => new Promise(() => {}),
  listUnits: () => new Promise(() => {}),
  getUnitFields: () => new Promise(() => {}),
  listUnitPage: () => new Promise(() => {}),
  getUnit: () => new Promise(() => {}),
  createUnits: () => new Promise(() => {}),
  deleteUnit: () => new Promise(() => {}),
  listSetGroups: () => new Promise(() => {}),
  putSetGroup: () => new Promise(() => {}),
  deleteSetGroup: () => new Promise(() => {}),
  listCoders: () => new Promise(() => {}),
  deleteCoders: () => new Promise(() => {}),
  postponeDeletion: () => new Promise(() => {}),
  listCoderDeletions: () => Promise.resolve([]),
  listDevices: () => Promise.resolve([]),
  listInvites: () => new Promise(() => {}),
  updateInvite: () => new Promise(() => {}),
  revokeInvite: () => new Promise(() => {}),
  renewInviteSecret: () => new Promise(() => {}),
  getOverview: () => new Promise(() => {}),
  getDeploymentStatus: () => new Promise(() => {}),
  resetAnnotations: () => new Promise(() => {}),
  getDeployment: () => new Promise(() => {}),
  putDeployment: () => new Promise(() => {}),
  createPreview: () => new Promise(() => {}),
  listAnnotations: () => new Promise(() => {}),
  listUnitVersions: () => new Promise(() => {}),
  getMe: () => new Promise(() => {}),
  listApiKeys: () => new Promise(() => {}),
  createApiKey: () => new Promise(() => {}),
  revokeApiKey: () => new Promise(() => {}),
  getAuthOptions: () => new Promise(() => {}),
  logout: () => new Promise(() => {}),
  loginUrl: (returnTo) => `/auth/login?returnTo=${returnTo}`,
};

describe("AdminApp", () => {
  it("renders the JobList view without throwing while jobs query is pending", () => {
    const html = renderToStaticMarkup(<AdminApp client={stubClient} baseUrl="http://localhost:8787" />);
    expect(html).toContain("Loading jobs");
  });

  it("renders a selected job view without throwing", () => {
    const html = renderToStaticMarkup(
      <AdminApp client={stubClient} initialJobId={1} baseUrl="http://localhost:8787" />,
    );
    expect(html).toContain("Design");
    expect(html).toContain("Deploy");
  });
});
