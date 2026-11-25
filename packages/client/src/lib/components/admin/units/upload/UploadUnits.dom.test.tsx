// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UnitsCreateBody } from "@annotinder/contracts";
import type { ResearcherApi } from "../../../../api/httpResearcherApi";
import { UploadUnits } from "./UploadUnits";

afterEach(cleanup);

/** The upload form of a study that has these units already; `refuse`: the server's answer to an upload. */
function uploadForm(existing: { externalId: string; coded: boolean }[] = [], refuse?: string) {
  const created: UnitsCreateBody[] = [];
  const onDone = vi.fn();
  const units = existing.map((unit, i) => ({ id: i + 1, ...unit }));
  const client = {
    studyId: 1,
    createUnits: async (body: UnitsCreateBody) => {
      if (refuse) throw new Error(refuse);
      created.push(body);
    },
    listUnits: async () => units,
    listSetGroups: async () => [],
  } as unknown as ResearcherApi;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(["admin", "study", 1, "units"], units);
  queryClient.setQueryData(["admin", "study", 1, "sets", "draft"], []);
  const view = render(
    <QueryClientProvider client={queryClient}>
      <UploadUnits client={client} studyFields={[]} onDone={onDone} />
    </QueryClientProvider>,
  );
  /** Chooses a CSV file. */
  const choose = (csv: string, name = "units.csv") => {
    const input = view.container.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File([csv], name, { type: "text/csv" })] } });
  };
  /** Chooses a CSV file, and uploads every column under its own name. */
  const open = async (csv: string) => {
    choose(csv);
    await screen.findByText("units.csv");
    fireEvent.click(screen.getByText("Use column names"));
  };
  const upload = () => screen.getByRole<HTMLButtonElement>("button", { name: /^Upload/ });
  /** Clicks Upload, and waits until the form is done. */
  const uploaded = async () => {
    fireEvent.click(upload());
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    return created;
  };
  return { onDone, choose, open, upload, uploaded };
}

const box = (label: RegExp) => screen.getByText(label).querySelector<HTMLInputElement>("input")!;

describe("uploading units from a CSV", () => {
  it("uploads the file's units, with the column named id as their ids", async () => {
    const { open, upload, uploaded } = uploadForm();
    await open("headline,id\nFirst,u1\nSecond,u2");
    expect(screen.getByText("(2 rows)")).toBeTruthy();
    expect(upload().textContent).toBe("Upload 2 units");
    const created = await uploaded();
    expect(created).toHaveLength(1);
    expect(created[0].overwrite).toBe(false);
    expect(created[0].units.map((u) => [u.externalId, u.data])).toEqual([
      ["u1", { headline: "First" }],
      ["u2", { headline: "Second" }],
    ]);
  });

  it("without a column named as an id, the first column is the units' ids", async () => {
    const { open, uploaded } = uploadForm();
    await open("code,headline\nA1,First");
    const created = await uploaded();
    expect(created[0].units).toEqual([expect.objectContaining({ externalId: "A1", data: { headline: "First" } })]);
  });

  it("a file without rows is not read as units, and says so", async () => {
    const { choose } = uploadForm();
    choose("id,headline", "empty.csv");
    expect(await screen.findByText(/empty.csv has no rows/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Upload/ })).toBeNull();
  });

  it("units that already exist are only replaced when asked", async () => {
    const { open, upload, uploaded } = uploadForm([{ externalId: "u1", coded: false }]);
    await open("id,headline\nu1,Changed\nu2,New");
    expect(upload().disabled).toBe(true);
    fireEvent.click(box(/Replace the 1 unit that already exists/));
    expect(upload().disabled).toBe(false);
    expect((await uploaded())[0]).toMatchObject({ overwrite: true, overwriteCoded: false });
  });

  it("coded units among them need a second yes, after a warning", async () => {
    const { open, upload, uploaded } = uploadForm([
      { externalId: "u1", coded: true },
      { externalId: "u2", coded: false },
    ]);
    await open("id,headline\nu1,Changed\nu2,Changed too\nu3,New");
    expect(screen.queryByText(/already coded/)).toBeNull();
    fireEvent.click(box(/Replace the 2 units that already exist/));
    expect(screen.getByText(/1 of them was already coded/)).toBeTruthy();
    expect(upload().disabled).toBe(true);
    fireEvent.click(box(/Also replace the 1 coded unit/));
    const created = await uploaded();
    expect(created[0]).toMatchObject({ overwrite: true, overwriteCoded: true });
    expect(created[0].units).toHaveLength(3);
  });

  it("says how far it got when the server stops it, and stays open", async () => {
    const { onDone, open, upload } = uploadForm([], "The study has too many units");
    await open("id,headline\nu1,First");
    fireEvent.click(upload());
    const failure = "Uploaded 0 of 1 units, then it stopped: The study has too many units";
    expect(await screen.findByText(failure)).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    expect(upload().disabled).toBe(false);
  });
});
