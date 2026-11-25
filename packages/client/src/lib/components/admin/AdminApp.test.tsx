import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { AdminApp } from "./AdminApp";
import type { ResearcherApi } from "../../api/httpResearcherApi";

const stubClient: ResearcherApi = {
  studyId: 1,
  forStudy: () => stubClient,
  listStudies: () => new Promise(() => {}),
  listExamples: async () => [],
  createStudyFromExample: () => new Promise(() => {}),
  createStudyFromRecipe: () => new Promise(() => {}),
  exportStudy: () => new Promise(() => {}),
  importStudy: () => new Promise(() => {}),
  createStudy: () => new Promise(() => {}),
  deleteStudy: () => new Promise(() => {}),
  getAccountDeletion: () => new Promise(() => {}),
  deleteAccount: () => new Promise(() => {}),
  getStudy: () => new Promise(() => {}),
  updateStudy: () => new Promise(() => {}),
  getStudyUsers: () => new Promise(() => {}),
  putStudyUsers: () => new Promise(() => {}),
  listDesignVersions: () => new Promise(() => {}),
  getDesignVersion: () => new Promise(() => {}),
  createDesignVersion: () => new Promise(() => {}),
  updateDesignVersion: () => new Promise(() => {}),
  deleteDesignVersion: () => new Promise(() => {}),
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
  getResultsAnswers: () => Promise.resolve({ questions: [] }),
  getResultsAgreement: () => Promise.resolve({ questions: [] }),
  listResultUnits: () => Promise.resolve({ units: [] }),
  getResultUnit: () => Promise.reject(new Error("no units")),
  listResultCoders: () => Promise.resolve({ coders: [] }),
  listCoderUnits: () => Promise.resolve({ coders: [] }),
  exportResults: () => Promise.reject(new Error("no export")),
  downloadExport: () => Promise.reject(new Error("no export")),
  listLinks: () => new Promise(() => {}),
  revokeLink: () => new Promise(() => {}),
  reopenLink: () => new Promise(() => {}),
  renewLinkSecret: () => new Promise(() => {}),
  getOverview: () => new Promise(() => {}),
  getDeploymentStatus: () => new Promise(() => {}),
  resetAnnotations: () => new Promise(() => {}),
  getDeployment: () => new Promise(() => {}),
  putDeployment: () => new Promise(() => {}),
  getPendingChanges: () => new Promise(() => {}),
  listDeploymentVersions: () => new Promise(() => {}),
  getServerVersion: () => new Promise(() => {}),
  putUnitFields: () => new Promise(() => {}),
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
  it("renders the StudyList view without throwing while studies query is pending", () => {
    const html = renderToStaticMarkup(
      <AdminApp client={stubClient} location={{ page: "studies" }} onNavigate={() => {}} />,
    );
    expect(html).toContain("Loading studies");
  });

  it("shows a study's pages once the study is known; until then the loading screen", () => {
    const location = { page: "study", studyId: 1, tab: "Overview" } as const;
    const loading = renderToStaticMarkup(
      <AdminApp client={stubClient} location={location} onNavigate={() => {}} queryClient={new QueryClient()} />,
    );
    expect(loading).toContain("Loading study");
    expect(loading).not.toContain("Deploy");
    // The study in the cache (as after the study list or a fetch)
    const queryClient = new QueryClient();
    queryClient.setQueryData(["admin", "study", 1], { id: 1, name: "A study", archived: false });
    const html = renderToStaticMarkup(
      <AdminApp client={stubClient} location={location} onNavigate={() => {}} queryClient={queryClient} />,
    );
    expect(html).toContain("Design");
    expect(html).toContain("Deploy");
  });
});
