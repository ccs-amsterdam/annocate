import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminApp } from "./AdminApp";
import type { ResearcherApi } from "../../api/httpResearcherApi";

const stubClient: ResearcherApi = {
  studyId: 1,
  forStudy: () => stubClient,
  listStudies: () => new Promise(() => {}),
  listExamples: async () => [],
  createStudyFromExample: () => new Promise(() => {}),
  createStudyFromRecipe: () => new Promise(() => {}),
  createStudy: () => new Promise(() => {}),
  deleteStudy: () => new Promise(() => {}),
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
  listLinks: () => new Promise(() => {}),
  updateLink: () => new Promise(() => {}),
  revokeLink: () => new Promise(() => {}),
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
  passkeyRegisterOptions: () => new Promise(() => {}),
  passkeyRegister: () => new Promise(() => {}),
  passkeyLoginOptions: () => new Promise(() => {}),
  passkeyLogin: () => new Promise(() => {}),
  passkeyRecover: () => new Promise(() => {}),
  listPasskeys: () => new Promise(() => {}),
  deletePasskey: () => new Promise(() => {}),
  renewRecoveryCodes: () => new Promise(() => {}),
  logout: () => new Promise(() => {}),
  loginUrl: (returnTo) => `/auth/login?returnTo=${returnTo}`,
};

describe("AdminApp", () => {
  it("renders the StudyList view without throwing while studies query is pending", () => {
    const html = renderToStaticMarkup(<AdminApp client={stubClient} location={{ page: "studies" }} onNavigate={() => {}} />);
    expect(html).toContain("Loading studies");
  });

  it("renders a selected study view without throwing", () => {
    const html = renderToStaticMarkup(
      <AdminApp client={stubClient} location={{ page: "study", studyId: 1, tab: "Overview" }} onNavigate={() => {}} />,
    );
    expect(html).toContain("Design");
    expect(html).toContain("Deploy");
  });
});
