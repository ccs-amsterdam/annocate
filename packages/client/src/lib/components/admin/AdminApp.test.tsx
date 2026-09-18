import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminApp } from "./AdminApp";
import type { AdminClient } from "../../api/httpAdminClient";

/**
 * Smoke-checks that `AdminApp` (design plan §5) renders without throwing,
 * using a stub `AdminClient` whose queries never resolve during a
 * synchronous `renderToStaticMarkup` pass (matching the pattern used for
 * `UnitFields.test.tsx` -- no jsdom/interaction testing infra exists yet in
 * this package, so this only guards against render-time crashes/import
 * errors, not interactive behavior).
 */
const stubClient: AdminClient = {
  getJob: () => new Promise(() => {}),
  createJob: () => new Promise(() => {}),
  updateJob: () => new Promise(() => {}),
  deleteJob: () => new Promise(() => {}),
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
  it("renders the Job tab without throwing while the job query is pending", () => {
    const html = renderToStaticMarkup(<AdminApp client={stubClient} baseUrl="http://localhost:8787" />);
    expect(html).toContain("Loading job");
  });
});
