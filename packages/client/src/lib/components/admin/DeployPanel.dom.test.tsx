// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DeploymentResponse, DeploymentWrite, DesignVersion, TopLevelItem } from "@annotinder/contracts";
import { ResearcherApiError, type ResearcherApi } from "../../api/httpResearcherApi";
import { useConfirmedDeploy } from "../../admin/queries";
import { DeployPanel } from "./DeployPanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const question = (name: string) => ({ type: "question", name, variable: { type: "confirm", question: "Agree?" } });

const version = (id: number, immutable: boolean, items: object[], note: string | null = null): DesignVersion =>
  ({
    id,
    studyId: 1,
    note,
    formatVersion: 1,
    created: new Date(0),
    updated: new Date(0),
    updatedBy: null,
    revision: 1,
    immutable,
    valid: true,
    items: items as TopLevelItem[],
    units: { fields: [] },
    session: { invite: { mode: "crowd" } },
    public: null,
  }) as DesignVersion;

const LIVE = version(1, true, [question("consent")]);
const DRAFT = version(2, false, [question("consent"), question("age")]);
const NO_UNIT_CHANGES = { added: 0, changed: 0, removed: 0, sets: false };

/** A client whose calls never answer: the panel shows what is in the query cache. */
const silent = new Proxy({ studyId: 1 } as Record<string, unknown>, {
  get: (target, key: string) => (key in target ? target[key] : () => new Promise(() => {})),
}) as unknown as ResearcherApi;

type OnDeploy = Parameters<typeof DeployPanel>[0]["onDeploy"];

/** The deploy panel of a study, with these draft unit changes waiting. */
function panel(
  props: { version?: DesignVersion | null; live?: DesignVersion | null; onDeploy?: OnDeploy; experts?: string[] },
  units: Partial<typeof NO_UNIT_CHANGES> = {},
) {
  const { version: draft = DRAFT, live = LIVE } = props;
  const onDeploy = vi.fn<OnDeploy>(props.onDeploy ?? (async () => {}));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const study = ["admin", "study", 1, "deployment"];
  queryClient.setQueryData(study, live ? { designVersionId: live.id, newUnitsMessage: "{n} more for you" } : null);
  queryClient.setQueryData([...study, "pending"], {
    units: { ...NO_UNIT_CHANGES, ...units },
    designVersionId: draft?.id ?? null,
  });
  // The study's expert coders, as the Coders page lists them
  const coders = (props.experts ?? []).map((coder) => ({ coder, kind: "expert", email: null }));
  queryClient.setQueryData(["admin", "study", 1, "coders"], { coders, unassigned: { live: null, draft: 0 } });
  render(
    <QueryClientProvider client={queryClient}>
      <DeployPanel
        client={silent}
        studyReopenMinutes={null}
        version={draft}
        versionNumber={2}
        live={live}
        liveNumber={live ? 1 : null}
        onDeploy={onDeploy}
      />
    </QueryClientProvider>,
  );
  const deploy = () => screen.getByRole<HTMLButtonElement>("button", { name: "Deploy" });
  /** Clicks Deploy, and gives what was deployed. */
  const deployed = async () => {
    fireEvent.click(deploy());
    await waitFor(() => expect(onDeploy).toHaveBeenCalled());
    return onDeploy.mock.lastCall!;
  };
  return { onDeploy, deploy, deployed };
}

const box = (label: RegExp) => screen.getByText(label).querySelector<HTMLInputElement>("input")!;

describe("the deploy panel", () => {
  it("deploys the design draft and the draft units, with the note it suggests from what changed", async () => {
    const { deployed } = panel({}, { added: 3 });
    expect(screen.getByText(/Units and sets: 3 added/)).toBeTruthy();
    const [design, note, units, settings] = await deployed();
    expect(design).toBe(DRAFT);
    expect(note).not.toBe("");
    expect(screen.getByLabelText<HTMLTextAreaElement>(/What changed\?/).value).toBe(note);
    expect(units).toBe(true);
    // Nothing asked: the settings stay as they are
    expect(settings).toEqual({});
  });

  it("units only: with the design left out, the live version stays and the draft stays a draft", async () => {
    const { deployed } = panel({}, { changed: 2 });
    fireEvent.click(box(/Design v2/));
    expect(screen.getByText("The draft stays a draft, for a later deploy.")).toBeTruthy();
    const [design, , units] = await deployed();
    expect(design).toBeNull();
    expect(units).toBe(true);
  });

  it("the design only: the units left out stay drafts", async () => {
    const { deployed } = panel({}, { added: 1, sets: true });
    fireEvent.click(box(/Units and sets/));
    expect(screen.getByText("The units stay drafts, for a later deploy.")).toBeTruthy();
    const [design, , units] = await deployed();
    expect(design).toBe(DRAFT);
    expect(units).toBe(false);
  });

  it("without unit changes only the design is deployed; with nothing left to deploy, Deploy is off", async () => {
    const { deploy, deployed } = panel({});
    expect(screen.getByText("Units and sets: no changes")).toBeTruthy();
    fireEvent.click(box(/Design v2/));
    expect(deploy().disabled).toBe(true);
    fireEvent.click(box(/Design v2/));
    const [, , units] = await deployed();
    expect(units).toBe(false);
  });

  it("without a design draft: the live version stays, the units can go", async () => {
    const { deployed } = panel({ version: null }, { removed: 4 });
    expect(screen.getByText("Design: v1 stays")).toBeTruthy();
    const [design, , units] = await deployed();
    expect(design).toBeNull();
    expect(units).toBe(true);
  });

  it("a note typed by hand is the one deployed (trimmed); a version's own note is where it starts", async () => {
    const { deployed } = panel({ version: { ...DRAFT, note: "Asks for age" } });
    const note = screen.getByLabelText<HTMLTextAreaElement>(/What changed\?/);
    expect(note.value).toBe("Asks for age");
    fireEvent.change(note, { target: { value: "  Asks the coder's age  " } });
    expect((await deployed())[1]).toBe("Asks the coder's age");
  });

  it("a refused deploy says why, keeps the changed note, and can be tried again", async () => {
    let refuse = true;
    const { onDeploy, deploy } = panel({
      onDeploy: async () => {
        if (refuse) throw new Error("The design has errors: fix them first");
      },
    });
    fireEvent.change(screen.getByLabelText(/What changed\?/), { target: { value: "My note" } });
    fireEvent.click(deploy());
    expect(await screen.findByText("The design has errors: fix them first")).toBeTruthy();
    expect(screen.getByLabelText<HTMLTextAreaElement>(/What changed\?/).value).toBe("My note");
    expect(deploy().disabled).toBe(false);
    refuse = false;
    fireEvent.click(deploy());
    await waitFor(() => expect(onDeploy).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("The design has errors: fix them first")).toBeNull());
    expect(onDeploy.mock.lastCall![1]).toBe("My note");
  });

  it("the message for coders who get new units: deployed only when it was changed; emptied: none", async () => {
    const { deployed } = panel({}, { added: 2 });
    const message = screen.getByLabelText<HTMLInputElement>("Message for coders who get new units");
    expect(message.value).toBe("{n} more for you");
    fireEvent.change(message, { target: { value: "  " } });
    expect((await deployed())[3]).toEqual({ newUnitsMessage: null });
  });

  it("the first deploy: design and units always go, and it asks when coders finish", async () => {
    const { deployed } = panel({ live: null }, { added: 10 });
    expect(screen.getByText(/Nothing is deployed yet/)).toBeTruthy();
    expect(box(/Design v2/).disabled).toBe(true);
    expect(box(/Units and sets: 10 units/).disabled).toBe(true);
    const [design, note, units, settings] = await deployed();
    expect([design, note, units]).toEqual([DRAFT, "First version", true]);
    expect(settings).toHaveProperty("reopenMinutes");
  });
});

describe("a crowd's first deploy with expert coders left", () => {
  const EXPERTS = { ...DRAFT, session: { invite: { mode: "coders", link: "per_coder" } } } as DesignVersion;
  const said = () => screen.queryByText(/used and will be deleted/);

  it("says beforehand that they aren't used and will be deleted", () => {
    panel({ live: null, experts: ["anna", "bob", "carl"] });
    expect(said()?.textContent).toContain("3 expert coders aren't used and will be deleted");
  });

  it("says nothing without expert coders, with a design for expert coders, or at a later deploy", () => {
    panel({ live: null });
    expect(said()).toBeNull();
    cleanup();
    panel({ live: null, version: EXPERTS, experts: ["anna"] });
    expect(said()).toBeNull();
    cleanup();
    panel({ experts: ["anna"] });
    expect(said()).toBeNull();
  });
});

describe("deploying with many links to confirm", () => {
  const deployment = { designVersionId: 2, active: true } as unknown as DeploymentResponse;
  const tooMany = () =>
    new ResearcherApiError(409, "confirm", { error: "This makes 5,000 links. Go on?", code: "confirm_links" });

  /** The deploy of a study whose server asks to confirm its links first; the deployments it was sent. */
  function deployer(putDeployment: (write: DeploymentWrite) => Promise<DeploymentResponse>) {
    const sent: DeploymentWrite[] = [];
    const client = {
      studyId: 1,
      getDeployment: async () => ({ ...deployment, active: false }),
      putDeployment: (write: DeploymentWrite) => {
        sent.push(write);
        return putDeployment(write);
      },
    } as unknown as ResearcherApi;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useConfirmedDeploy(client), { wrapper });
    const deploy = () => act(() => result.current({ designVersionId: 2, units: true }).catch((e: unknown) => e));
    return { sent, deploy };
  }

  it("accepted: deploys again, confirmed, with the same choices", async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const { sent, deploy } = deployer(async (write) => {
      if (!write.confirmLinks) throw tooMany();
      return deployment;
    });
    expect(await deploy()).toBe(deployment);
    expect(confirm).toHaveBeenCalledWith("This makes 5,000 links. Go on?");
    expect(sent).toEqual([
      { designVersionId: 2, units: true, active: false },
      { designVersionId: 2, units: true, active: false, confirmLinks: true },
    ]);
  });

  it("declined: nothing more is sent, and the deploy fails with the server's question", async () => {
    vi.stubGlobal("confirm", () => false);
    const { sent, deploy } = deployer(async () => {
      throw tooMany();
    });
    const err = await deploy();
    expect(err).toBeInstanceOf(ResearcherApiError);
    expect(sent).toHaveLength(1);
  });

  it("another refusal is not asked about", async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const { sent, deploy } = deployer(async () => {
      throw new ResearcherApiError(400, "invalid", { error: "The design has errors", code: "invalid_design" });
    });
    expect(await deploy()).toBeInstanceOf(ResearcherApiError);
    expect(confirm).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
  });

  it("keeps a paused study paused: the deploy asks the server whether it is live", async () => {
    const { sent, deploy } = deployer(async () => deployment);
    await deploy();
    expect(sent[0].active).toBe(false);
  });
});
