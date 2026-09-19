import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminApp } from "./AdminApp";
import type { AdminClient } from "../../api/httpAdminClient";

const stubClient: AdminClient = {
  jobId: 1,
  forJob: () => stubClient,
  listJobs: () => new Promise(() => {}),
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
  getUnit: () => new Promise(() => {}),
  createUnits: () => new Promise(() => {}),
  deleteUnit: () => new Promise(() => {}),
  listUnitsets: () => new Promise(() => {}),
  createUnitset: () => new Promise(() => {}),
  updateUnitset: () => new Promise(() => {}),
  deleteUnitset: () => new Promise(() => {}),
  listCoders: () => new Promise(() => {}),
  inviteCoder: () => new Promise(() => {}),
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
    expect(html).toContain("Codebook");
  });
});
