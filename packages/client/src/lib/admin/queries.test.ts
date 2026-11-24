import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { DeploymentResponse, DeploymentWrite } from "@annotinder/contracts";
import { deployStudy } from "./queries";

const deployment = (active: boolean): DeploymentResponse => ({
  studyId: 1,
  designVersionId: 3,
  active,
  newUnitsMessage: null,
  version: 2,
  updated: new Date(),
});

/** A server with a deployment (or none yet) that records what is deployed. */
function server(current: DeploymentResponse | null) {
  const sent: DeploymentWrite[] = [];
  const client = {
    studyId: 1,
    getDeployment: async () => current,
    putDeployment: async (body: DeploymentWrite) => {
      sent.push(body);
      return deployment(body.active ?? true);
    },
  };
  return { client, sent };
}

describe("deploying", () => {
  it("keeps a paused study paused when the deployment wasn't loaded in this browser", async () => {
    const { client, sent } = server(deployment(false));
    await deployStudy(client, new QueryClient(), { designVersionId: 4 });
    expect(sent).toEqual([{ designVersionId: 4, units: false, active: false }]);
  });

  it("asks the server, not what was loaded earlier (a colleague paused the study since)", async () => {
    const { client, sent } = server(deployment(false));
    const queryClient = new QueryClient();
    queryClient.setQueryData(["admin", "study", 1, "deployment"], deployment(true));
    await deployStudy(client, queryClient, { designVersionId: 4, units: true });
    expect(sent[0].active).toBe(false);
  });

  it("a first deploy is live", async () => {
    const { client, sent } = server(null);
    await deployStudy(client, new QueryClient(), { designVersionId: 4, newUnitsMessage: null });
    expect(sent).toEqual([{ designVersionId: 4, units: false, active: true, newUnitsMessage: null }]);
  });
});
